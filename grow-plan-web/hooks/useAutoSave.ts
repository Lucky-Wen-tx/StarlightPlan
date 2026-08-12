"use client";

/**
 * 防抖自动保存 Hook
 *
 * 核心逻辑：
 * 1. 内容变化后等待 delay 毫秒，调用 api.update 保存正文
 * 2. 标题在创建笔记时已确定，不再随自动保存更新
 * 3. 离开当前笔记（切换 / 组件卸载）时，若仍有未落盘的编辑内容，立即兜底保存，
 *    避免切换笔记 / 进入回收站等操作丢失最后一次输入
 *    （原实现依赖清理时仅清除定时器，防抖窗口内的最新编辑会被丢弃）
 *
 * 实现说明（双 effect 分工）：
 * - Effect 1：防抖保存，依赖 [noteId, content, delay]；同时把最新正文同步到
 *   pendingContentRef，供 Effect 2 离开笔记时读取。
 * - Effect 2：兜底保存，依赖 [noteId]。它不依赖 content，因此输入过程中不会触发；
 *   只在 noteId 变化或组件卸载时执行 cleanup，若存在未保存内容则立即保存。
 *   利用 React「同一提交先执行所有 cleanup、再执行所有 setup」的顺序保证：
 *   切笔记时 cleanup 读到的 pendingContentRef 仍是旧笔记的最新内容。
 *
 * 使用方式：
 *   const noteId  = useNoteStore(s => s.currentId);
 *   const content = useNoteStore(s => s.currentContent);
 *   useAutoSave(noteId, content); // 默认 1000ms 防抖
 */
import { useCallback, useEffect, useRef } from "react";
import { update } from "@/lib/api";
import { useNoteStore } from "@/store/useNoteStore";

// ── 保存快照类型（记录上次成功保存时的 noteId + 正文）───────
interface SaveSnapshot {
  /** 保存时对应的笔记 ID */
  noteId: string;
  /** 保存时的正文内容 */
  content: string;
}

/**
 * @param noteId  - 当前笔记 ID（对应 store.currentId），null 时不启用自动保存
 * @param content - 当前笔记正文
 * @param delay   - 防抖延迟毫秒数，默认 1000
 */
export function useAutoSave(
  noteId: string | null,
  content: string,
  delay: number = 1000,
): void {
  /** 防抖定时器句柄 */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 上次成功保存时的 { noteId, content } 快照 */
  const lastSavedRef = useRef<SaveSnapshot | null>(null);
  /**
   * 当前笔记最新正文快照：每次渲染由 Effect 1 同步。
   * 供 Effect 2 在离开笔记时读取"最新内容"，避免用到过期的闭包值。
   */
  const pendingContentRef = useRef<string>(content);

  /**
   * 保存正文（防抖触发与兜底触发共用）。
   * - 成功后在快照仍属于本次保存的笔记时才回写，防止异步竞态覆盖新笔记快照；
   * - 仅当用户当前仍停留在这篇笔记时才更新状态栏"最近保存时间"。
   * - 失败静默处理：记录日志，下次变更时定时器会重新触发保存。
   */
  const persist = useCallback(
    async (targetNoteId: string, targetContent: string): Promise<void> => {
      try {
        const result = await update(targetNoteId, { content: targetContent });

        // 快照仍属于本次保存的笔记时才回写，避免旧的异步结果覆盖新笔记快照
        if (lastSavedRef.current?.noteId === targetNoteId) {
          lastSavedRef.current = {
            noteId: result.id,
            content: result.content,
          };
        }
        // 用户仍停留在这篇笔记时才更新时间（切走后展示的应是当前笔记的时间）
        if (useNoteStore.getState().currentId === targetNoteId) {
          // 使用后端返回的文件修改时间（直接读取 .md 文件 mtime）
          useNoteStore.getState().setLastSavedAt(result.updated_at);
        }
      } catch (err: unknown) {
        // 自动保存失败静默处理 —— 避免频繁弹窗打扰用户
        // 下次变更时定时器会重新触发保存
        const message: string =
          err instanceof Error ? err.message : "未知错误";
        console.error(`[AutoSave] 保存失败 (noteId=${targetNoteId}):`, message);
      }
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════
  // Effect 1：防抖保存
  // 依赖 content 变化重新计时；同时把最新正文同步到 pendingContentRef，
  // 供 Effect 2 在离开笔记时读取（cleanup 阶段该 ref 仍是旧笔记的内容）。
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // 记录最新正文快照（Effect 2 的 cleanup 读取它）
    pendingContentRef.current = content;

    // ── 未选中笔记 → 重置快照，不执行任何操作 ─────────────────
    if (noteId === null) {
      lastSavedRef.current = null;
      return;
    }

    // ── 笔记切换 → 用当前值初始化快照，视为"已保存"状态 ────
    // 避免切换笔记后自动触发一次无意义的保存请求
    if (
      lastSavedRef.current === null ||
      lastSavedRef.current.noteId !== noteId
    ) {
      lastSavedRef.current = { noteId, content };
      return;
    }

    // ── 内容未变化 → 跳过，避免重复请求 ──────────────────────
    if (lastSavedRef.current.content === content) {
      return;
    }

    // ── 清除上一次尚未触发的定时器（重新倒计时）──────────────
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // ── 启动防抖定时器 ──────────────────────────────────────
    timerRef.current = setTimeout(() => {
      void persist(noteId, content);
    }, delay);

    // ── 清理函数：仅清除防抖定时器，兜底保存交给 Effect 2 ────
    return (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [noteId, content, delay, persist]);

  // ═══════════════════════════════════════════════════════════════
  // Effect 2：离开笔记时兜底保存
  // 仅在 noteId 变化或组件卸载时执行 cleanup（不依赖 content，输入过程不触发）；
  // 若该笔记还有未落盘内容（快照与最新正文不一致），立即保存最新正文。
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // 未选中笔记时不注册清理逻辑
    if (noteId === null) {
      return;
    }

    return (): void => {
      // 仅当存在未保存内容时才兜底，避免重复 / 无意义的请求
      if (
        lastSavedRef.current?.noteId === noteId &&
        lastSavedRef.current.content !== pendingContentRef.current
      ) {
        void persist(noteId, pendingContentRef.current);
      }
    };
  }, [noteId, persist]);
}
