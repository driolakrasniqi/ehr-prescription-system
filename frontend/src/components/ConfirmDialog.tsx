import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <div className="confirm-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <AlertCircle />
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "confirm-dialog__confirm--danger" : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
