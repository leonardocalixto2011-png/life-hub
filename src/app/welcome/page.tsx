import { cookies, headers } from "next/headers";

import { requireUser, listMyHubs, CURRENT_HUB_COOKIE } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hubChrome } from "@/lib/data";
import { langOf } from "@/lib/i18n";
import { money } from "@/lib/format";
import { HUB_COLORS } from "@/lib/hub-setup";
import {
  defaultHubName,
  firstNameOf,
  isPlaceholderHubName,
  langFromAcceptLanguage,
} from "@/lib/onboarding";
import { I18nProvider } from "@/components/I18nProvider";
import { Welcome } from "./Welcome";

export const dynamic = "force-dynamic";

/**
 * First-run welcome. Lives outside the (app) group, like /hubs/new: it has to
 * work for someone with zero hubs (the app layout would bounce them), and the
 * app layout is what sends un-onboarded people here, so being inside it would
 * loop. Also reachable later from /account to replay — nothing is reset.
 */
export default async function WelcomePage() {
  const user = await requireUser();
  const [hdrs, store, hubs, inviteRows] = await Promise.all([
    headers(),
    cookies(),
    listMyHubs(user.id),
    prisma.hubMembership.findMany({
      where: { userId: user.id, status: "INVITED" },
      select: {
        hub: {
          select: {
            id: true,
            name: true,
            color: true,
            createdBy: { select: { name: true, email: true } },
            _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Before they've chosen, greet them in their browser's language.
  const lang = user.locale ? langOf(user.locale) : langFromAcceptLanguage(hdrs.get("accept-language"));
  const hub = hubs.find((h) => h.id === store.get(CURRENT_HUB_COOKIE)?.value) ?? hubs[0] ?? null;
  const chrome = hub ? await hubChrome(user.id, hub.id) : null;
  const first = firstNameOf(user.name, user.email);

  return (
    <I18nProvider lang={lang}>
      <Welcome
        lang={lang}
        localeChosen={Boolean(user.locale)}
        replay={Boolean(user.onboardedAt)}
        userId={user.id}
        first={user.name?.trim().split(/\s+/)[0] ?? null}
        suggestedHubName={defaultHubName(first, lang)}
        colors={[...HUB_COLORS]}
        hub={
          hub
            ? {
                id: hub.id,
                name: hub.name,
                color: hub.color,
                owner: hub.role === "OWNER",
                placeholderName: isPlaceholderHubName(hub.name),
              }
            : null
        }
        invites={inviteRows.map((r) => ({
          id: r.hub.id,
          name: r.hub.name,
          color: r.hub.color,
          invitedBy: r.hub.createdBy.name ?? r.hub.createdBy.email ?? "",
          members: r.hub._count.memberships,
        }))}
        interests={user.interests}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        chrome={
          chrome && hub
            ? {
                ventures: chrome.ventures.map((v) => ({ id: v.id, name: v.name })),
                members: chrome.members,
                favorites: chrome.favorites.map((f) => ({
                  id: f.id,
                  label: f.label,
                  kind: f.kind,
                  amountCents: f.amountCents,
                  entryType: f.entryType,
                  amountLabel:
                    f.amountCents != null ? money(f.amountCents, hub.currency, user.locale ?? undefined) : null,
                })),
              }
            : null
        }
      />
    </I18nProvider>
  );
}
