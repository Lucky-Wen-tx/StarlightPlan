"use client";

/**
 * 删除确认弹窗
 *
 * 与原生 window.confirm 等价的自定义实现：
 * - 主体展示操作后果提示文字
 * - 仅点击「删除」按钮才执行操作；取消 / 点击遮罩 / 按 ESC 均关闭
 */
import type { ReactNode } from "react";
import Modal from "@/components/common/Modal";

interface ConfirmDialogProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 弹窗标题 */
  title: string;
  /** 主体提示文字 */
  message: ReactNode;
  /** 关闭回调 */
  onClose: () => void;
  /** 确认回调（点击「删除」时触发） */
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onClose,
  onConfirm,
}: ConfirmDialogProps): React.ReactElement | null {
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
          {/* 删除：红色危险按钮 + 白字 */}
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium cursor-pointer rounded-lg bg-red-500 text-white hover:bg-red-400 transition-colors"
          >
            删除
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        {message}
      </p>
    </Modal>
  );
}
