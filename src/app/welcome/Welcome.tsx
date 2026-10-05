"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { PushToggle } from "@/components/PushToggle";
import { InstallHint } from "@/components/InstallHint";
import { QuickAdd } from "@/components/QuickAdd";
import { fillQuickAdd } from "@/lib/quickadd-bus";
import { FIRST_ADD_EXAMPLES, INTERESTS } from "@/lib/onboarding";
import { UsernameField } from "@/app/(app)/account/UsernameField";
import { JoinCodeBox } from "@/components/JoinCodeBox";
import type { FavoriteChip } from "@/lib/favorites";
import type { Lang } from "@/lib/i18n";
import {
  acceptWelcomeInvite,
  declineWelcomeInvite,
  finishWelcome,
  saveInterests,
  saveWelcomeAboutYou,
  saveWelcomeHub,
  setWelcomeLocale,
} from "./actions";

type StepId = "invites" | "lang" | "you" | "hub" | "interests" | "notify" | "first";

type Invite = { id: string; name: string; color: string; invitedBy: string; members: number };
type HubInfo = { id: string; name: string; color: string; owner: boolean; placeholderName: boolean };
type Chrome = {
  ventures: { id: string; name: string }[];
  members: { id: string; name: string | null; email?: string | null }[];
  favorites: FavoriteChip[];
};

// Device facts don't change while the page is open; the server snapshot says
// "not iOS" so nothing install-related renders until the browser can tell.
const noop = () => () => {};
function readIosTab(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * The first minute. One question per screen, each skippable, ending on the
 * real quick-add composer — because "this app works for me" is decided by
 * the first thing someone manages to put in it, not by a tour.
 *
 * Arrival rung of the celebration ladder: each step settles in over --moment
 * (300ms, zeroed by reduced motion / the calm toggle), and the one flourish is
 * "C'est parti ✓" after the first saved item. No confetti — that's reserved
 * for milestones.
 */
export function Welcome({
  lang,
  localeChosen,
  replay,
  ageAttested,
  ageNeeded,
  name,
  username,
  suggestedUsername,
  pendingRequests,
  userId,
  first,
  suggestedHubName,
  colors,
  hub,
  invites,
  interests,
  aiEnabled,
  aiNoticeSeen,
  chrome,
}: {
  lang: Lang;
  localeChosen: boolean;
  replay: boolean;
  /** Already on record as 14+ (grandfathered, or attested on an earlier visit). */
  ageAttested: boolean;
  /** They tried to finish without attesting — open on that step and say why. */
  ageNeeded: boolean;
  name: string;
  /** Their saved @handle, or "" if none yet. */
  username: string;
  suggestedUsername: string;
  /** Join requests they sent that no owner has answered yet. */
  pendingRequests: number;
  userId: string;
  first: string | null;
  suggestedHubName: string;
  colors: string[];
  hub: HubInfo | null;
  invites: Invite[];
  interests: string[];
  aiEnabled: boolean;
  aiNoticeSeen: boolean;
  chrome: Chrome | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Fixed on arrival: accepting an invite mid-flow must not shift the steps
  // under the person's thumb. The hub step is left out only for someone who
  // is already a plain member of a hub — nothing there for them to name.
  const [steps] = useState<StepId[]>(() => {
    const s: StepId[] = [];
    if (invites.length > 0) s.push("invites");
    s.push("lang");
    // After the language, so the attestation is read in the right one. Left
    // out once it is on record — a replay doesn't ask again.
    // Also shown to someone without a username yet, to pick one.
    if (!ageAttested || !username) s.push("you");
    if (!hub || hub.owner) s.push("hub");
    s.push("interests", "notify", "first");
    return s;
  });
  // Also fixed on arrival, so an answered invite stays on screen as "You're in."
  // instead of vanishing when the refresh drops it from the pending list.
  const [inviteList] = useState(invites);
  const [index, setIndex] = useState(() => (ageNeeded ? Math.max(0, steps.indexOf("you")) : 0));
  const step = steps[index];
  // The age box starts unchecked, always: an attestation is something the
  // person does, never a default.
  const [isOver14, setIsOver14] = useState(false);
  const [attested, setAttested] = useState(ageAttested);
  const [displayName, setDisplayName] = useState(name);
  const [handle, setHandle] = useState(username || suggestedUsername);
  const youIndex = steps.indexOf("you");
  /** Everything past the attestation is locked until it is given. */
  const ageLocked = youIndex !== -1 && !attested;

  const [chosenLang, setChosenLang] = useState<Lang>(lang);
  // Until they type, the suggestion follows the language they just picked.
  const [typedHubName, setHubName] = useState<string | null>(null);
  const hubName = typedHubName ?? (hub && !hub.placeholderName ? hub.name : suggestedHubName);
  const [hubColor, setHubColor] = useState(() =>
    hub && colors.includes(hub.color) ? hub.color : colors[0],
  );
  const [picked, setPicked] = useState<string[]>(interests);
  const [answered, setAnswered] = useState<Record<string, "joined" | "declined">>({});
  const [arrived, setArrived] = useState(false);
  const iosTab = useSyncExternalStore(noop, readIosTab, () => false);

  function next() {
    setError(null);
    if (index < steps.length - 1) setIndex(index + 1);
  }
  /** "Skip all" / "Finish" before attesting lands on the attestation instead. */
  function toAgeStep() {
    setIndex(youIndex);
    setError(t("Confirm that you are 14 or older to continue."));
  }
  function back() {
    setError(null);
    if (index > 0) setIndex(index - 1);
  }

  /** Runs a server action, refreshes the server half, then moves on. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>, advance = true) {
    setError(null);
    start(async () => {
      try {
        const r = await action();
        if (!r.ok) {
          setError(t(r.error ?? "Something went wrong. Try again."));
          return;
        }
        router.refresh();
        if (advance) next();
      } catch {
        setError(t("Something went wrong. Try again."));
      }
    });
  }

  function finish() {
    if (ageLocked) return toAgeStep();
    start(async () => {
      await finishWelcome();
    });
  }

  function onFirstSaved() {
    // The item exists already; this is acknowledgement, then the app.
    setArrived(true);
    window.setTimeout(finish, 1400);
  }

  // ---- step bodies ----------------------------------------------------------
  let title = "";
  let body: React.ReactNode = null;
  let primary: { label: string; onClick: () => void } | null = null;
  let skip: (() => void) | null = next;

  switch (step) {
    case "invites":
      title = t("You've been invited");
      body = (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("Join to see the same tasks, bills and calendar as the people already inside.")}
          </p>
          {inviteList.map((inv) => {
            const state = answered[inv.id];
            return (
              <div key={inv.id} className="card space-y-3 p-4" style={{ borderColor: inv.color }}>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: inv.color }} aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{inv.name}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {t("{name} invited you", { name: inv.invitedBy })} ·{" "}
                      {inv.members === 1 ? t("1 person") : t("{n} people", { n: inv.members })}
                    </div>
                  </div>
                </div>
                {state ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold" role="status">
                    {state === "joined" ? (
                      <>
                        <Check size={16} aria-hidden /> {t("You're in.")}
                      </>
                    ) : (
                      t("Declined")
                    )}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await acceptWelcomeInvite(inv.id);
                          if (r.ok) setAnswered((a) => ({ ...a, [inv.id]: "joined" }));
                          return r;
                        }, false)
                      }
                    >
                      {t("Join hub")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost flex-1"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await declineWelcomeInvite(inv.id);
                          if (r.ok) setAnswered((a) => ({ ...a, [inv.id]: "declined" }));
                          return r;
                        }, false)
                      }
                    >
                      {t("Decline")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
      primary = { label: t("Continue"), onClick: next };
      break;

    case "lang":
      title = "Langue · Language";
      body = (
        <div className="space-y-2" role="radiogroup" aria-label="Langue · Language">
          {(
            [
              ["fr", "Français", "Québec"],
              ["en", "English", "Canada"],
            ] as const
          ).map(([value, label, sub]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={chosenLang === value}
              lang={value}
              onClick={() => setChosenLang(value)}
              className="welcome-option"
              data-active={chosenLang === value ? "" : undefined}
            >
              <span className="text-base font-semibold">{label}</span>
              <span className="text-xs text-[var(--color-text-dim)]">{sub}</span>
              {chosenLang === value && <Check size={20} className="ml-auto" aria-hidden />}
            </button>
          ))}
        </div>
      );
      primary = {
        label: chosenLang === "fr" ? "Continuer" : "Continue",
        onClick: () =>
          localeChosen && chosenLang === lang
            ? next()
            : run(() => setWelcomeLocale(chosenLang === "fr" ? "fr-CA" : "en-CA")),
      };
      break;

    case "you":
      title = t("Before we start");
      body = (
        <div className="space-y-4">
          <label className="field-label">
            {t("What should people call you?")}
            <input
              className="field"
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="given-name"
            />
            <span className="field-hint">
              {t("The people in your hubs see this name — never your email address, unless you choose to show it.")}
            </span>
          </label>
          <UsernameField value={handle} onChange={setHandle} />
          {!ageAttested && (
          <label className="check-row items-start">
            <input
              type="checkbox"
              checked={isOver14}
              onChange={(e) => setIsOver14(e.target.checked)}
              className="mt-0.5"
              aria-describedby="age-why"
            />
            <span>{t("I am 14 or older")}</span>
          </label>
          )}
          <p id="age-why" className="text-xs text-[var(--color-text-dim)]">
            {t("Life Hub isn't for children under 14. Debts and email analysis ask for 18 or older, when you get to them.")}{" "}
            <Link href="/confidentialite" className="underline">
              {t("Privacy policy")}
            </Link>
            {" · "}
            <Link href="/conditions" className="underline">
              {t("Terms of use")}
            </Link>
          </p>
        </div>
      );
      primary = {
        label: t("Continue"),
        onClick: () =>
          run(async () => {
            const r = await saveWelcomeAboutYou({
              attested: ageAttested || isOver14,
              name: displayName,
              username: handle,
            });
            if (r.ok) setAttested(true);
            return r;
          }),
      };
      skip = null; // Required: there is no skipping the attestation.
      break;

    case "hub": {
      const memberOnly = hub && !hub.owner;
      title = memberOnly ? t("You're in {name}", { name: hub.name }) : t("Your hub");
      if (memberOnly) {
        body = (
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("Everything you add lands there, shared with its members — unless you mark it private.")}
          </p>
        );
        primary = { label: t("Continue"), onClick: next };
        break;
      }
      body = (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("A hub is a shared space — your home, a couple, a business. You can invite people later.")}
          </p>
          {pendingRequests > 0 && !hub && (
            <p className="card p-3 text-sm" role="status">
              {t("Your request to join is waiting for an owner. You can make your own hub meanwhile, or skip.")}
            </p>
          )}
          <label className="field-label">
            {t("Hub name")}
            <input
              className="field"
              value={hubName}
              maxLength={80}
              onChange={(e) => setHubName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <fieldset>
            <legend className="field-label mb-2">{t("Colour")}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Colour")}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={hubColor === c}
                  aria-label={c}
                  onClick={() => setHubColor(c)}
                  className="welcome-swatch"
                  style={{ background: c }}
                  data-active={hubColor === c ? "" : undefined}
                >
                  {hubColor === c && <Check size={18} color="#fff" strokeWidth={3} aria-hidden />}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      );
      body = (
        <>
          {body}
          {!hub && (
            <div className="border-t border-[var(--color-border)] pt-4">
              <JoinCodeBox />
            </div>
          )}
        </>
      );
      primary = {
        label: hub ? t("Save") : t("Create my hub"),
        onClick: () => run(() => saveWelcomeHub({ hubId: hub?.id, name: hubName, color: hubColor })),
      };
      // Skipping with no hub at all still has to leave them somewhere to put
      // things: it takes the suggestion as-is.
      skip = hub || pendingRequests > 0
        ? next
        : () => run(() => saveWelcomeHub({ name: suggestedHubName, color: colors[0] }));
      break;
    }

    case "interests":
      title = t("What do you want to keep track of?");
      body = (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("Pick as many as you like. It only changes what Today puts first — everything stays a tap away.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = picked.includes(i.key);
              return (
                <button
                  key={i.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((k) => k !== i.key) : [...p, i.key]))}
                  className="chip chip-filter"
                  data-active={on ? "" : undefined}
                >
                  {on && <Check size={15} strokeWidth={2.5} aria-hidden />}
                  {t(i.label)}
                </button>
              );
            })}
          </div>
        </div>
      );
      primary = { label: t("Continue"), onClick: () => run(() => saveInterests(picked)) };
      break;

    case "notify":
      title = t("Stay ahead, without checking");
      body = (
        <div className="space-y-3">
          <ul className="space-y-2 text-sm">
            <li className="card p-3">
              <span className="font-semibold">{t("A morning summary")}</span>
              <span className="block text-xs text-[var(--color-text-dim)]">
                {t("What's due, overdue and coming up — once a day, only when there's something.")}
              </span>
            </li>
            <li className="card p-3">
              <span className="font-semibold">{t("A reminder an hour before")}</span>
              <span className="block text-xs text-[var(--color-text-dim)]">
                {t("For events on the calendar, plus bills and cancel-by dates coming up.")}
              </span>
            </li>
          </ul>
          <PushToggle />
          {iosTab && <InstallHint />}
        </div>
      );
      primary = { label: t("Continue"), onClick: next };
      break;

    case "first":
      title = t("Add your first thing");
      body = chrome ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("Say it, snap it or type it — plain sentences work. Try one of these:")}
          </p>
          <div className="flex flex-wrap gap-2">
            {FIRST_ADD_EXAMPLES[lang].map((ex) => (
              <button key={ex} type="button" className="chip chip-filter" onClick={() => fillQuickAdd(ex)}>
                “{ex}”
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--color-border)]">
            <QuickAdd
              ventures={chrome.ventures}
              members={chrome.members}
              defaultAssigneeId={userId}
              userId={userId}
              aiEnabled={aiEnabled}
              aiNoticeSeen={aiNoticeSeen}
              favorites={chrome.favorites}
              onSaved={onFirstSaved}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-dim)]">
          {t("Join or create a hub first — then this is where your first item goes.")}
        </p>
      );
      primary = { label: t("Finish"), onClick: finish };
      skip = null; // Finish is the skip here.
      break;
  }

  const last = index === steps.length - 1;

  return (
    <main className="flex min-h-dvh flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex min-h-[44px] items-center justify-between">
        <div className="flex gap-1.5" aria-label={t("Step {n} of {total}", { n: index + 1, total: steps.length })} role="img">
          {steps.map((s, i) => (
            <span key={s} className="welcome-dot" data-state={i < index ? "done" : i === index ? "now" : undefined} />
          ))}
        </div>
        {!last &&
          (ageLocked ? (
            // Not a form: skipping everything still goes through the age step.
            step !== "you" && (
              <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={toAgeStep}>
                {t("Skip all")}
              </button>
            )
          ) : (
            <form action={finishWelcome}>
              <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
                {replay ? t("Close") : t("Skip all")}
              </button>
            </form>
          ))}
      </div>

      {index === 0 && (
        <p className="display mt-6 text-[1.75rem] leading-tight">
          {first ? t("Welcome, {name}.", { name: first }) : t("Welcome.")}
        </p>
      )}

      <section key={step} className="welcome-step mt-6 flex-1 space-y-4" aria-live="polite">
        <h1 className={index === 0 ? "text-lg font-bold" : "display text-[1.5rem] leading-tight"}>{title}</h1>
        {body}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </section>

      <div className="sticky bottom-0 mt-6 space-y-2 bg-[var(--color-bg)] pt-2">
        {primary && (
          <button
            type="button"
            className="btn btn-primary btn-lg w-full"
            onClick={primary.onClick}
            disabled={pending || (step === "you" && !isOver14 && !ageAttested)}
          >
            {pending ? t("Saving…") : primary.label}
          </button>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={back}
            disabled={index === 0 || pending}
            style={{ visibility: index === 0 ? "hidden" : undefined }}
          >
            <ChevronLeft size={16} aria-hidden /> {t("Back")}
          </button>
          {skip && (
            <button type="button" className="btn btn-ghost text-sm" onClick={skip} disabled={pending}>
              {t("Skip")}
            </button>
          )}
        </div>
      </div>

      <p className="pt-3 text-center text-[0.6875rem] text-[var(--color-text-dim)]">
        <Link href="/confidentialite" className="underline">
          {t("Privacy policy")}
        </Link>
        {" · "}
        <Link href="/conditions" className="underline">
          {t("Terms of use")}
        </Link>
      </p>

      {arrived && (
        <div className="welcome-arrival" role="status">
          <div className="welcome-arrival-card">
            <p className="display text-[1.75rem] leading-tight">{t("Here we go")} ✓</p>
            <p className="text-sm text-[var(--color-text-dim)]">{t("Your first item is in. Here's your day.")}</p>
          </div>
        </div>
      )}
    </main>
  );
}
