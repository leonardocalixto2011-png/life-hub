"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, RefreshCw } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { revealInboundAddress, rotateInbound } from "./actions";

/**
 * Hidden until asked for. Anyone holding this address can post into the hub's
 * review inbox, so it's treated as a credential: revealed deliberately,
 * copyable in one tap, and revocable.
 */
export function ForwardingAddress({ initial }: { initial: string | null }) {
  const t = useT();
  const [address, setAddress] = useState<string | null>(initial);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reveal() {
    startTransition(async () => setAddress(await revealInboundAddress()));
  }

  function rotate() {
    if (!confirm(t("Issue a new address? Anything still forwarding to the old one will stop arriving."))) return;
    startTransition(async () => {
      setAddress(await rotateInbound());
      setCopied(false);
    });
  }

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address is on screen to select manually.
    }
  }

  return (
    <section>
      <h2 className="section-title">{t("Forward mail to this hub")}</h2>
      <div className="form-card">
        <p className="field-hint mt-0">
          {t(
            "Forward a bill or confirmation to this address and it lands in this hub's review inbox. Treat it like a password — anyone who has it can put items in here.",
          )}
        </p>

        {address ? (
          <>
            <div className="flex items-center gap-2">
              <code className="field flex-1 truncate text-xs leading-[1.9]">{address}</code>
              <button type="button" onClick={copy} className="btn btn-secondary shrink-0">
                {copied ? <Check size={16} strokeWidth={2.25} aria-hidden /> : <Copy size={16} strokeWidth={2} aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <button
              type="button"
              onClick={rotate}
              disabled={pending}
              className="btn btn-quiet-danger btn-sm self-start"
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden />
              {t("Issue a new address")}
            </button>
          </>
        ) : (
          <button type="button" onClick={reveal} disabled={pending} className="btn btn-secondary w-full">
            <Eye size={16} strokeWidth={2} aria-hidden />
            {pending ? "…" : t("Show forwarding address")}
          </button>
        )}
      </div>
    </section>
  );
}
