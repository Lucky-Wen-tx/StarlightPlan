"use client";

/**
 * 输入弹窗：新建 / 重命名笔记共用
 *
 * 与原生 window.prompt 等价的自定义实现：
 * - 打开弹窗时自动聚焦输入框，光标定位到预填文本末尾（重命名时便于直接在原标题后追加修改）
 * - 输入为空（trim 后）时「确认」按钮禁用，避免提交空白标题
 * - 回车键等同点击「确认」
 *
 * 新建与重命名仅通过 title / initialValue 两个 prop 区分，无需两套组件。
 */
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/common/Modal";

interface InputDialogProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 弹窗标题（新建笔记 / 重命名笔记） */
  title: string;
  /** 输入框预填值（重命名传原标题，新建传空字符串） */
  initialValue: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 确认回调：传入用户最终输入（已 trim 去空白） */
  onConfirm: (value: string) => void;
}

export default function InputDialog({
  open,
  title,
  initialValue,
  onClose,
  onConfirm,
}: InputDialogProps): React.ReactElement | null {
  /** 输入框引用：打开时自动聚焦 + 全选 */
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** 输入框当前值（每次打开弹窗时用 initialValue 重置） */
  const [value, setValue] = useState<string>(initialValue);

  // ── 弹窗打开：自动聚焦，光标定位到文本末尾 ────────────────
  // 说明：弹窗由父组件按需挂载（关闭即卸载），每次打开都是全新挂载，
  // useState(initialValue) 的初始化值即当前预填值，无需在 effect 里再重置。
  useEffect(() => {
    if (!open) {
      return;
    }
    const input = inputRef.current;
    if (input) {
      input.focus();
      // 光标放末尾而非全选：重命名时便于在原标题后追加修改，不误覆盖原内容
      // （新建时预填为空，setSelectionRange 等效于仅聚焦）
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }, [open]);

  // 输入为空（trim 后）时禁用「确认」
  const canSubmit: boolean = value.trim().length > 0;

  // ── 回车键提交 ──────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && canSubmit) {
      onConfirm(value.trim());
    }
  };

  // 关闭状态不渲染任何 DOM（弹窗整体由父组件按需挂载）
  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          {/* 取消：灰色文字 + 白底，hover 浅灰高亮 */}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm cursor-pointer rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 transition-colors"
          >
            取消
          </button>
          {/* 确认：蓝色主按钮 + 白字；输入为空时禁用 */}
          <button
            type="button"
            onClick={() => onConfirm(value.trim())}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium cursor-pointer rounded-lg bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            确认
          </button>
        </>
      }
    >
      {/* 单行标题输入框 */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="请输入笔记标题"
        maxLength={100}
        className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
      />
    </Modal>
  );
}
