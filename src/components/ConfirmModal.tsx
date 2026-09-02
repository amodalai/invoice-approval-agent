import type { ReactNode } from "react";

export function ConfirmModal({
  title,
  confirmLabel,
  busy,
  disabled,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  disabled?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{title}</h2>
        {children}
        {error ? <div className="banner error">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy || disabled} onClick={onConfirm}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
