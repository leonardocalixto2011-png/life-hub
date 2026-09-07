"use client";

import { useState, useTransition } from "react";

import { Celebrate } from "@/components/Celebrate";
import { HubCover } from "@/components/HubCover";
import { acceptInvite, declineInvite } from "@/app/(app)/hubs/actions";

type Member = { id: string; name: string | null; email: string | null };

/**
 * The "arrival" rung of the celebration ladder.
 *
 * An invite used to be a coloured dot and two buttons — indistinguishable
 * from a settings row, for what is actually the moment someone is handed a
 * shared view of a household's money. So it leads with the hub's cover photo,
 * shows who is already inside, and the faces land in sequence so the hub
 * reads as populated rather than empty before you commit to it.
 *
 * `acceptInvite` redirects to /today on success, so the celebration is shown
 * optimistically the instant the transition starts. That is honest here in a
 * way it would not be for a destructive action: a failed accept throws, the
 * redirect never happens, and the user stays on this page with the invite
 * still listed.
 */
export function InviteCard({
  hubId,
  name,
  color,
  coverImageUrl,
  coverBy,
  invitedBy,
  members,
}: {
  hubId: string;
  name: string;
  color: string;
  coverImageUrl: string | null;
  coverBy: string | null;
  invitedBy: string;
  members: Member[];
}) {
  const [pending, start] = useTransition();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    setJoining(true);
    start(async () => {
      try {
        await acceptInvite(hubId);
      } catch (e) {
        // A redirect throws by design in the App Router — only surface a real
        // failure, and put the card back so the invite is still actionable.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setJoining(false);
        setError(e instanceof Error ? e.message : "Could not join — try again.");
      }
    });
  }

  return (
    <>
      {joining && (
        <Celebrate
          headline="You're in."
          detail={`${name} is yours to use — your own theme and background stay private.`}
          onDone={() => {
            /* The redirect from acceptInvite takes over from here. */
          }}
        />
      )}

      <div className="card overflow-hidden p-0">
        <HubCover name={name} color={color} imageUrl={coverImageUrl} by={coverBy} />

        <div className="space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold">{invitedBy} invited you</div>
            <p className="text-xs text-[var(--color-text-dim)]">
              {members.length} {members.length === 1 ? "person" : "people"} · shared bills,
              deadlines and calendar
            </p>
          </div>

          {members.length > 0 && (
            <div className="hub-faces flex pl-1.5">
              {members.slice(0, 5).map((m, i) => (
                <span
                  key={m.id}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 text-[0.72rem] font-bold text-white"
                  style={{
                    marginLeft: "-6px",
                    background: color,
                    borderColor: "var(--color-surface)",
                    animationDelay: `${60 + i * 70}ms`,
                  }}
                  title={m.name ?? m.email ?? undefined}
                >
                  {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={accept}
              disabled={pending}
              className="btn btn-primary flex-1"
            >
              {pending ? "Joining…" : "Join hub"}
            </button>
            <form action={declineInvite.bind(null, hubId)} className="flex-1">
              <button type="submit" disabled={pending} className="btn btn-ghost w-full">
                Decline
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
