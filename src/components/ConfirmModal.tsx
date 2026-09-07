import { useEffect, useId, useRef, type ReactNode } from "react";

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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal-overlay"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="modal__title">{title}</h2>
        {children}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy || disabled} onClick={onConfirm}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
