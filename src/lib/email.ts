/**
 * Email via the Resend REST API. When AUTH_RESEND_KEY is unset (local dev), every
 * send is logged to the server console instead — so you can use the app with zero
 * email setup. Phase 2 adds the daily digest here.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function from(): string {
  return process.env.EMAIL_FROM ?? "Life Hub <onboarding@resend.dev>";
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
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
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  if (!process.env.AUTH_RESEND_KEY) {
    console.log(`\n🔑 [auth:dev] magic link for ${to}\n   ${url}\n`);
    return;
  }

  await sendEmail({
    to,
    subject: "Your Life Hub sign-in link",
    text: `Sign in to Life Hub: ${url}\n\nThis link expires in 24 hours. If you didn't request it, ignore this email.`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="font-size:18px;margin:0 0 12px">Sign in to Life Hub</h1>
        <p style="color:#444;font-size:14px;line-height:1.5;margin:0 0 20px">
          Tap the button below to sign in. This link works once and expires in 24 hours.
        </p>
        <p style="margin:0 0 24px">
          <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">
            Sign in
          </a>
        </p>
        <p style="color:#888;font-size:12px;line-height:1.5;margin:0;word-break:break-all">
          Or paste this URL into your browser:<br />${url}
        </p>
      </div>
    `,
  });
}
