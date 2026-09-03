"use client";

import { useEffect, useState } from "react";

export type ToastData = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

let listeners: Array<(t: ToastData) => void> = [];

/** Fire a transient toast from anywhere on the client. */
export function showToast(t: ToastData) {
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    const l = (t: ToastData) => setToast(t);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="safe-b pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--color-text)] px-4 py-2 text-sm text-[var(--color-bg)] shadow-lg">
        <span>{toast.message}</span>
        {toast.onAction && (
          <button
            onClick={() => {
              toast.onAction?.();
              setToast(null);
            }}
            className="font-bold underline"
          >
            {toast.actionLabel ?? "Undo"}
          </button>
        )}
      </div>
    </div>
  );
}
