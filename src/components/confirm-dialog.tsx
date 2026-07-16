"use client";

import { AlertTriangle, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        className="max-w-md gap-0 overflow-hidden rounded-md bg-white p-0 text-slate-950"
        onEscapeKeyDown={(event) => {
          if (busy) {
            event.preventDefault();
            return;
          }
          onCancel();
        }}
      >
        <AlertDialogHeader className="relative grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-slate-200 px-5 py-4 text-left">
          <AlertDialogMedia
            className={tone === "danger"
              ? "mb-0 size-8 bg-red-50 text-red-600"
              : "mb-0 size-8 bg-blue-50 text-blue-700"}
          >
            <AlertTriangle aria-hidden="true" size={20} />
          </AlertDialogMedia>
          <div className="min-w-0">
            <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
            <AlertDialogDescription className="mt-1 text-sm leading-6 text-slate-600">
              {description}
            </AlertDialogDescription>
          </div>
          <AlertDialogCancel
            aria-label="关闭对话框"
            className="size-8 border-0 p-0 text-slate-500 shadow-none"
            disabled={busy}
            onClick={onCancel}
            title="关闭"
            variant="ghost"
          >
            <X size={17} />
          </AlertDialogCancel>
        </AlertDialogHeader>
        <AlertDialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-white px-5 py-4">
          <AlertDialogCancel disabled={busy} onClick={onCancel} variant="ghost">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={onConfirm}
            variant={tone === "danger" ? "destructive" : "ghost"}
          >
            {busy ? "处理中..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
