import { sharedBalances } from "@/lib/couple";
import { listMembers } from "@/lib/data";
import { money } from "@/lib/format";
import { withHub } from "@/lib/hub-context";
import { langOf, translate } from "@/lib/i18n";
import { personFirstName } from "@/lib/people";

/**
 * "Chantelle te doit maintenant 42,50 $" — where the shared balance stands
 * for the viewer, right after they saved a split expense. Same rule as the
 * Budget page's balance line: two people get a sentence with the other's
 * name, more get the viewer's own position (who-owes-whom isn't one sentence
 * then). Null when the hub has nobody to share with.
 *
 * Server-only (it reads the hub); the string comes back already in the
 * viewer's language and the hub's currency.
 */
export async function balanceMessage(
  user: { id: string; locale?: string | null },
  hub: { id: string; currency: string },
): Promise<string | null> {
  // Members first, outside the transaction: listMembers uses the trusted
  // client, and awaiting a second connection while holding one open is the
  // deadlock hubChrome's comment describes.
  const members = await listMembers(user.id, hub.id);
  if (members.length < 2) return null;
  const balances = await withHub(user.id, (tx) =>
    sharedBalances(tx, hub.id, members.map((m) => m.id)),
  );

  const lang = langOf(user.locale);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const $ = (cents: number) => money(cents, hub.currency, user.locale ?? "en-CA");
  const mine = balances.find((b) => b.userId === user.id)?.netCents ?? 0;
  const other = members.length === 2 ? members.find((m) => m.id !== user.id) : undefined;

  if (other) {
    const name = personFirstName(other, t("Member"));
    if (mine === 0) return t("You and {name} are now even", { name });
    return mine > 0
      ? t("{name} now owes you {amount}", { name, amount: $(mine) })
      : t("You now owe {name} {amount}", { name, amount: $(-mine) });
  }
  if (mine === 0) return t("You're now even with everyone");
  return mine > 0
    ? t("You're now owed {amount}", { amount: $(mine) })
    : t("You now owe {amount}", { amount: $(-mine) });
}
