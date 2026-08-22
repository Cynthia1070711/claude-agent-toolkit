// ============================================================
// ConfirmDialog.tsx — 刪除確認對話框
// AC-7: 刪除確認 Dialog
// ============================================================

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h2 className="dialog__title">{title}</h2>
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <button type="button" className="dialog__btn dialog__btn--cancel" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="dialog__btn dialog__btn--danger"
            onClick={onConfirm}
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );
}
