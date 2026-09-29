"use client";

import { ReactNode, useEffect } from "react";
import { Icon } from "@/components/icons";
import SpecularButton from "@/components/SpecularButton";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/45"
      style={{ backdropFilter: "blur(2px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-panel ${wide ? "wide" : ""}`}>
        <div className="flex items-center justify-between pl-5 pr-4 py-3.5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px] tracking-[-0.01em]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3">
        {danger && (
          <span className="w-9 h-9 rounded-full bg-[#fcebe9] text-[#D93025] flex items-center justify-center shrink-0">
            <Icon name="alert" size={17} />
          </span>
        )}
        <p className="text-[13.5px] text-muted leading-relaxed whitespace-pre-line pt-1">{message}</p>
      </div>
      <div className="mt-6 flex gap-2.5 justify-end">
        <button onClick={onClose} className="btn btn-secondary" disabled={busy}>
          Cancel
        </button>
        {danger ? (
          <button onClick={onConfirm} className="btn btn-danger" disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        ) : (
          <SpecularButton onClick={onConfirm} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Working…" : confirmLabel}
          </SpecularButton>
        )}
      </div>
    </Modal>
  );
}
