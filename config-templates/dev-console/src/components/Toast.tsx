// ============================================================
// Toast.tsx — 右上角浮動通知（success/error, 3s auto-dismiss）
// AC-7: 操作成功 Toast 通知
// ============================================================
import { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const last = toasts[toasts.length - 1];
    const timer = setTimeout(() => onDismiss(last.id), 3000);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="通知">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} role="alert">
          <span>{t.message}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(t.id)}
            aria-label="關閉通知"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
