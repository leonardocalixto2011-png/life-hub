"use client";

import { useState, useTransition } from "react";

import { revealInboundAddress, rotateInbound } from "./actions";

/**
 * Hidden until asked for. Anyone holding this address can post into the hub's
 * review inbox, so it's treated as a credential: revealed deliberately,
 * copyable in one tap, and revocable.
 */
export function ForwardingAddress({ initial }: { initial: string | null }) {
  const [address, setAddress] = useState<string | null>(initial);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reveal() {
    startTransition(async () => setAddress(await revealInboundAddress()));
  }

  function rotate() {
    if (!confirm("Issue a new address? Anything still forwarding to the old one will stop arriving.")) return;
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
    <div className="card space-y-2 p-3">
      <div className="text-xs font-semibold">Forward mail to this hub</div>
      <p className="text-[0.68rem] text-[var(--color-text-dim)]">
        Forward a bill or confirmation to this address and it lands in this
        hub&apos;s review inbox. Treat it like a password — anyone who has it can
        put items in here.
      </p>

      {address ? (
        <>
          <div className="flex items-center gap-2">
            <code className="field flex-1 truncate text-[0.7rem]">{address}</code>
            <button type="button" onClick={copy} className="btn shrink-0 text-[0.7rem]">
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={rotate}
            disabled={pending}
            className="text-[0.65rem] font-semibold text-[var(--color-danger)] underline disabled:opacity-60"
          >
            Issue a new address
          </button>
        </>
      ) : (
        <button type="button" onClick={reveal} disabled={pending} className="btn w-full">
          {pending ? "…" : "Show forwarding address"}
        </button>
      )}
    </div>
  );
}
