import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-invites";
import { fmt } from "@/lib/i18n";
import { money } from "@/lib/format";
import { reportError } from "@/lib/observability";
import { billingEnabled } from "@/lib/billing/plan";
import { PLUS_PRICE_CENTS, TRIAL_NOTICE_DAYS } from "@/lib/billing/plans";

/**
 * Bill 10 (in force 12 Sept 2026): 2 to 10 days before a free period ends,
 * tell the person the end date and the price that would then apply. Our trial
 * never turns into a charge on its own (no card is taken), so the email says
 * so — the notice is still sent, because it is what the law asks of a free
 * period, and because it's the honest moment to offer the plan.
 *
 * Run once a day from /api/cron/digest. Sends when the trial ends within
 * TRIAL_NOTICE_DAYS (3) days and at least 2 days out — inside the legal
 * window even if the daily cron skips a run — once per trial.
 */
export async function sendTrialNotices(now = new Date()): Promise<number> {
  if (!billingEnabled()) return 0;
  const from = new Date(now.getTime() + 2 * 86_400_000);
  const to = new Date(now.getTime() + (TRIAL_NOTICE_DAYS + 1) * 86_400_000);
  const due = await prisma.planAccount.findMany({
    where: { status: "TRIALING", trialNoticeSentAt: null, trialEndsAt: { gte: from, lte: to } },
    select: { userId: true, trialEndsAt: true, user: { select: { email: true } } },
  });
  let sent = 0;
  for (const row of due) {
    if (!row.trialEndsAt || !row.user.email) continue;
    try {
      const fr = fmt(row.trialEndsAt, "d MMMM yyyy", "fr");
      const en = fmt(row.trialEndsAt, "MMMM d, yyyy", "en");
      const m = money(PLUS_PRICE_CENTS.MONTH, "CAD", "fr-CA");
      const y = money(PLUS_PRICE_CENTS.YEAR, "CAD", "fr-CA");
      const url = `${appUrl()}/billing`;
      await sendEmail({
        to: row.user.email,
        kind: "trial-ending",
        subject: `Ton essai Plus se termine le ${fr} · Your Plus trial ends ${en}`,
        text:
          `Ton essai gratuit de Life Hub Plus se termine le ${fr}. Ensuite, tu reviens au forfait gratuit : rien ne te sera facturé, car aucune carte n'a été demandée. ` +
          `Pour garder Plus, l'abonnement coûte ${m} par mois ou ${y} par année, plus les taxes applicables, et s'annule en un geste : ${url}\n\n---\n` +
          `Your free Life Hub Plus trial ends on ${en}. After that you're back on the free plan: nothing will be charged, since no card was taken. ` +
          `To keep Plus, it costs ${m} a month or ${y} a year, plus applicable taxes, and cancels in one tap: ${url}`,
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
            <h1 lang="fr" style="font-size:18px;margin:0 0 8px">Ton essai Plus se termine le ${fr}</h1>
            <p lang="fr" style="font-size:15px;line-height:1.5;margin:0 0 12px">
              Ensuite, tu reviens au forfait gratuit. <strong>Rien ne te sera facturé</strong> : aucune carte n'a été demandée.
              Pour garder Plus : ${m} par mois ou ${y} par année, plus les taxes applicables, annulable en un geste.
            </p>
            <p style="margin:0 0 20px">
              <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">
                Mon abonnement · My plan
              </a>
            </p>
            <p lang="en" style="color:#555;font-size:14px;line-height:1.5;margin:0">
              Your Plus trial ends on ${en}. After that you're back on the free plan and nothing is charged, since no card was taken.
              To keep Plus: ${m} a month or ${y} a year, plus applicable taxes, cancel any time in one tap.
            </p>
          </div>`,
      });
      await prisma.planAccount.update({ where: { userId: row.userId }, data: { trialNoticeSentAt: new Date() } });
      sent++;
    } catch (err) {
      await reportError("billing.trial_notice_failed", err, { userId: row.userId });
    }
  }
  return sent;
}
