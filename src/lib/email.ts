/**
 * Email via the Resend REST API. When AUTH_RESEND_KEY is unset (local dev), every
 * send is logged to the server console instead — so you can use the app with zero
 * email setup. Phase 2 adds the daily digest here.
 */

import { logInfo, reportError } from "@/lib/observability";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function from(): string {
  return process.env.EMAIL_FROM ?? "Life Hub <onboarding@resend.dev>";
}

type SendArgs = {
  to: string;
  /** What kind of email, for the logs only: never content. */
  kind?: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text, kind = "other" }: SendArgs): Promise<void> {
  const key = process.env.AUTH_RESEND_KEY;

  if (!key) {
    console.log(
      `\n📧 [email:dev] to=${to}\n   subject: ${subject}\n   ${text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n`,
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: from(), to, subject, html, text }),
  });

  if (!res.ok) {
    // Resend's error body names the problem (unverified domain, suppressed
    // address, daily quota) and never echoes the message, so it is safe to log.
    const body = (await res.text()).slice(0, 300);
    await reportError("email.send_failed", new Error(`Resend ${res.status}: ${body}`), { kind });
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  // The Resend id is what to search for in Resend → Emails when someone says
  // a message never arrived: it shows delivered, bounced or suppressed.
  const sent = (await res.json().catch(() => null)) as { id?: string } | null;
  logInfo("email.sent", { kind, resendId: sent?.id ?? null, domain: to.split("@")[1] ?? null });
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  if (!process.env.AUTH_RESEND_KEY) {
    console.log(`\n🔑 [auth:dev] magic link for ${to}\n   ${url}\n`);
    return;
  }

  // French first, then English: a brand-new person has no language on file
  // yet, and most people here read French. A one-language English mail from
  // an unknown sender is also the kind spam filters like least.
  const href = url.replace(/"/g, "&quot;");
  await sendEmail({
    to,
    kind: "magic-link",
    subject: "Ton lien de connexion Life Hub · Your Life Hub sign-in link",
    text: `Ouvre ce lien pour te connecter à Life Hub (valide 24 heures, une seule fois) :\n${url}\n\nSi tu n'as rien demandé, ignore ce courriel.\n\n---\nOpen this link to sign in to Life Hub (works once, for 24 hours):\n${url}\n\nIf you didn't ask for it, ignore this email.`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
        <h1 lang="fr" style="font-size:18px;margin:0 0 8px">Ton lien Life Hub</h1>
        <p lang="fr" style="font-size:15px;line-height:1.5;margin:0 0 20px">
          Touche le bouton pour te connecter. Si c'est ta première fois, il crée aussi ton compte. Le lien marche une seule fois, pendant 24 heures.
        </p>
        <p style="margin:0 0 20px">
          <a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">
            Me connecter · Sign in
          </a>
        </p>
        <p lang="en" style="color:#555;font-size:14px;line-height:1.5;margin:0 0 20px">
          Tap the button to sign in. The first time, it also creates your account. The link works once, for 24 hours.
        </p>
        <p style="color:#888;font-size:12px;line-height:1.5;margin:0;word-break:break-all">
          Ou colle cette adresse dans ton navigateur · Or paste this into your browser:<br />${href}
        </p>
        <p style="color:#888;font-size:12px;line-height:1.5;margin:16px 0 0">
          Tu n'as rien demandé ? Ignore ce courriel. · Didn't ask for this? Ignore this email.
        </p>
      </div>
    `,
  });
}
