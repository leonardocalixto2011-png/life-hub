"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { eventTimeRange, initials } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { useLang, useT } from "@/components/I18nProvider";
import type { EventWithRefs } from "@/lib/data";
import { deleteEvents } from "./actions";

type Member = { id: string; name: string | null; email: string | null };

/** A holiday, special date or trip on that day — labels are built on the server. */
type PlanChip = { key: string; label: string; href: string | null; planAhead: boolean };

type Day = { key: string; label: string; items: EventWithRefs[]; plans: PlanChip[] };

function AttendeeDots({ ids, members }: { ids: string[]; members: Member[] }) {
  if (ids.length === 0) return null;
  const map = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="flex -space-x-1">
      {ids.slice(0, 4).map((id) => {
        const m = map.get(id);
        return (
          <span
            key={id}
            title={m?.name ?? m?.email ?? undefined}
            className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]"
          >
            {initials(m?.name, m?.email)}
          </span>
        );
      })}
      {ids.length > 4 && (
        <span className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]">
          +{ids.length - 4}
        </span>
      )}
    </div>
  );
}

function EventBody({ e, members, lang }: { e: EventWithRefs; members: Member[]; lang: "en" | "fr" }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{e.title}</span>
        <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
          {eventTimeRange(e.startAt, e.endAt, lang)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
        {e.location && (
          <span className="text-[0.72rem] text-[var(--color-text-dim)]">📍 {e.location}</span>
        )}
        <AttendeeDots ids={e.attendeeIds} members={members} />
      </div>
    </>
  );
}

function Plans({ plans, spaced, planWord }: { plans: PlanChip[]; spaced: boolean; planWord: string }) {
  if (plans.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${spaced ? "mb-2" : ""}`}>
      {plans.map((p) =>
        p.href ? (
          <Link key={p.key} href={p.href} className="chip">
            {p.label}
            {p.planAhead && (
              <span className="font-semibold text-[var(--color-primary)]"> · {planWord}</span>
            )}
          </Link>
        ) : (
          <span key={p.key} className="chip">
            {p.label}
          </span>
        ),
      )}
    </div>
  );
}

export function CalendarList({ days, members }: { days: Day[]; members: Member[] }) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function removeSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      await deleteEvents([...selected]);
      exitSelect();
      router.refresh();
    });
  }

  if (days.length === 0) return null;
  const hasEvents = days.some((d) => d.items.length > 0);

  return (
    <>
      {hasEvents && (
        <div className="flex justify-end">
          {selecting ? (
            <button onClick={exitSelect} className="text-xs font-semibold text-[var(--color-text-dim)]">
              {t("Cancel")}
            </button>
          ) : (
            <button
              onClick={() => setSelecting(true)}
              className="text-xs font-semibold text-[var(--color-primary)]"
            >
              {t("Select")}
            </button>
          )}
        </div>
      )}

      {days.map(({ key, label, items, plans }) => (
        <section key={key}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {label}
          </h2>
          <Plans plans={plans} spaced={items.length > 0} planWord={t("plan")} />
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((e) =>
                selecting ? (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    className="card flex w-full items-start gap-3 p-3 text-left"
                    style={
                      selected.has(e.id)
                        ? { borderColor: "var(--color-primary)", background: "var(--color-surface-2)" }
                        : undefined
                    }
                  >
                    <input type="checkbox" checked={selected.has(e.id)} readOnly className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <EventBody e={e} members={members} lang={lang} />
                    </div>
                  </button>
                ) : (
                  <Link key={e.id} href={`/calendar/${e.id}`} className="card block p-3">
                    <EventBody e={e} members={members} lang={lang} />
                  </Link>
                ),
              )}
            </div>
          )}
        </section>
      ))}

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-16 z-10">
          <button
            onClick={removeSelected}
            disabled={pending}
            className="btn w-full bg-[var(--color-danger)] text-white"
          >
            {pending ? t("Deleting…") : t("Delete {n} selected", { n: selected.size })}
          </button>
        </div>
      )}
    </>
  );
}
