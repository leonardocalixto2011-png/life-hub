"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, MoreHorizontal } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { ActionForm } from "@/components/ActionForm";
import { addGroupMembers, leaveChat, muteChat } from "../actions";

/** Mute, add people to a group, leave a group. */
export function ChatSettings({
  conversationId,
  kind,
  muted,
  addable,
}: {
  conversationId: string;
  kind: "DIRECT" | "GROUP" | "HUB" | "AI";
  muted: boolean;
  addable: { id: string; name: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="relative">
      <button type="button" className="icon-btn" aria-label={t("Chat settings")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={22} aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="menu absolute right-0 top-full z-40 mt-1 w-64 p-2">
            <button
              type="button"
              className="menu-item w-full"
              disabled={pending}
              onClick={() => start(() => muteChat(conversationId, !muted))}
            >
              {muted ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
              {muted ? t("Turn notifications on") : t("Mute notifications")}
            </button>
            {kind === "GROUP" && addable.length > 0 && (
              <ActionForm action={addGroupMembers.bind(null, conversationId)} className="mt-2 space-y-1 px-2">
                <p className="field-label">{t("Add people")}</p>
                {addable.map((c) => (
                  <label key={c.id} className="check-row">
                    <input type="checkbox" name="memberIds" value={c.id} /> {c.name}
                  </label>
                ))}
                <button className="btn btn-secondary btn-sm w-full">{t("Add")}</button>
              </ActionForm>
            )}
            {kind === "GROUP" && (
              <button
                type="button"
                className="menu-item w-full text-[var(--color-danger)]"
                disabled={pending}
                onClick={() => {
                  if (confirm(t("Leave this group?"))) start(() => leaveChat(conversationId));
                }}
              >
                {t("Leave group")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
