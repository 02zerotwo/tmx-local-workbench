"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "default",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className={tone === "danger" ? "text-red-600" : "text-blue-700"}>
            <AlertTriangle aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <button
            aria-label="关闭对话框"
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            className="h-10 cursor-pointer rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={tone === "danger"
              ? "h-10 cursor-pointer rounded bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              : "h-10 cursor-pointer rounded bg-blue-700 px-4 text-sm font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
