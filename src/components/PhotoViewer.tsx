"use client";

import { useRef } from "react";
import { X } from "lucide-react";

import { useT } from "@/components/I18nProvider";

/**
 * A photo thumbnail that opens full screen on tap. A native <dialog>: Esc and
 * the back gesture close it for free, focus is trapped, and pinch-zoom is the
 * browser's own. Used for task photos on rows, the task page and drafts.
 */
export function PhotoThumb({
  src,
  alt,
  size = 36,
  className = "",
}: {
  src: string;
  alt: string;
  size?: number | "full";
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const box = size === "full" ? undefined : { width: size, height: size };

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`photo-thumb shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] ${size === "full" ? "block w-full" : ""} ${className}`}
        style={box}
        aria-label={t("View photo")}
        title={t("View photo")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a Blob URL shown as-is; next/image would need the host configured and adds nothing here */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={size === "full" ? "max-h-72 w-full object-cover" : "h-full w-full object-cover"}
        />
      </button>
      <dialog
        ref={ref}
        className="photo-viewer"
        aria-label={alt}
        onClick={(e) => {
          // A tap on the backdrop (the dialog itself, not the photo) closes it.
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img src={src} alt={alt} className="photo-viewer-img" />
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="btn btn-icon photo-viewer-close"
          aria-label={t("Close")}
          autoFocus
        >
          <X size={20} strokeWidth={2.25} aria-hidden />
        </button>
      </dialog>
    </>
  );
}
