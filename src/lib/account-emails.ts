import { sendEmail } from "@/lib/email";

/**
 * The emails the account system sends: an invitation to the app (optionally
 * into a hub), a hub invitation for someone who already has an account, and
 * the two halves of an address change.
 *
 * French first, then English, in every one: the recipient has no account yet
 * (or we don't know their language when writing to a new address), and the
 * app is used in Québec. Every name in them was typed by a person, so all of
 * it is escaped before it goes into HTML that arrives from our domain.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(blocks: { fr: string; en: string }, button?: { href: string; fr: string; en: string }): string {
  const btn = button
    ? `<p style="margin:20px 0">
        <a href="${escapeHtml(button.href)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">
          ${button.fr} · ${button.en}
        </a>
      </p>`
    : "";
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
      <div lang="fr" style="font-size:15px;line-height:1.55">${blocks.fr}</div>
      ${btn}
      <hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0" />
      <div lang="en" style="font-size:14px;line-height:1.55;color:#555">${blocks.en}</div>
    </div>`;
}

/** An invitation to create an account, sent to the address the inviter typed. */
export async function sendAppInviteEmail(opts: {
  to: string;
  inviter: string;
  url: string;
  hubName?: string | null;
  days: number;
}) {
  const who = escapeHtml(opts.inviter);
  const hub = opts.hubName ? escapeHtml(opts.hubName) : null;
  const subject = hub
    ? `${opts.inviter} t'invite sur Life Hub (« ${opts.hubName} ») · invites you to Life Hub`
    : `${opts.inviter} t'invite sur Life Hub · invites you to Life Hub`;
  const fr = hub
    ? `<p style="margin:0 0 8px"><strong>${who}</strong> t'invite à te créer un compte Life Hub et à rejoindre « ${hub} ».</p>
       <p style="margin:0">Tu choisis ton nom, ton nom d'utilisateur et ta langue. Rejoindre « ${hub} » reste ton choix. Le lien est valide ${opts.days} jours.</p>`
    : `<p style="margin:0 0 8px"><strong>${who}</strong> t'invite à te créer un compte Life Hub : tâches, échéances, budget et calendrier, seul ou à plusieurs.</p>
       <p style="margin:0">Tu choisis ton nom, ton nom d'utilisateur et ta langue. Le lien est valide ${opts.days} jours.</p>`;
  const en = hub
    ? `<p style="margin:0 0 8px"><strong>${who}</strong> invited you to create a Life Hub account and join "${hub}".</p>
       <p style="margin:0">You pick your name, username and language. Joining "${hub}" stays your choice. The link works for ${opts.days} days.</p>`
    : `<p style="margin:0 0 8px"><strong>${who}</strong> invited you to create a Life Hub account: tasks, deadlines, budget and calendar, alone or together.</p>
       <p style="margin:0">You pick your name, username and language. The link works for ${opts.days} days.</p>`;
  await sendEmail({
    kind: "app-invite",
    to: opts.to,
    subject,
    text: `${opts.inviter} t'invite sur Life Hub${opts.hubName ? ` (« ${opts.hubName} »)` : ""}. Crée ton compte : ${opts.url}\n\n${opts.inviter} invited you to Life Hub. Create your account: ${opts.url}\n\nValide ${opts.days} jours · Works for ${opts.days} days.`,
    html: layout({ fr, en }, { href: opts.url, fr: "Créer mon compte", en: "Create my account" }),
  });
}

/** A hub invitation for someone who already has an account. */
export async function sendHubInviteEmail(opts: { to: string; inviter: string; hubName: string; url: string }) {
  const who = escapeHtml(opts.inviter);
  const hub = escapeHtml(opts.hubName);
  await sendEmail({
    kind: "hub-invite",
    to: opts.to,
    subject: `${opts.inviter} t'invite dans « ${opts.hubName} » · invites you to "${opts.hubName}"`,
    text: `${opts.inviter} t'invite dans « ${opts.hubName} » sur Life Hub : ${opts.url}\n\n${opts.inviter} invited you to "${opts.hubName}" on Life Hub: ${opts.url}`,
    html: layout(
      {
        fr: `<p style="margin:0"><strong>${who}</strong> t'invite dans « ${hub} ». Connecte-toi pour accepter ou refuser.</p>`,
        en: `<p style="margin:0"><strong>${who}</strong> invited you to "${hub}". Sign in to accept or decline.</p>`,
      },
      { href: opts.url, fr: "Voir l'invitation", en: "See the invitation" },
    ),
  });
}

/** Sent to the NEW address: the link that makes the change. */
export async function sendEmailChangeConfirm(opts: { to: string; url: string }) {
  await sendEmail({
    kind: "email-change",
    to: opts.to,
    subject: "Confirme ta nouvelle adresse Life Hub · Confirm your new Life Hub address",
    text: `Pour te connecter à Life Hub avec cette adresse, ouvre ce lien (valide 1 heure) : ${opts.url}\nSi tu n'as rien demandé, ignore ce courriel.\n\nTo sign in to Life Hub with this address, open this link (works for 1 hour): ${opts.url}\nIf you didn't ask for this, ignore this email.`,
    html: layout(
      {
        fr: `<p style="margin:0">Pour te connecter à Life Hub avec cette adresse, confirme-la. Le lien est valide 1 heure. Si tu n'as rien demandé, ignore ce courriel.</p>`,
        en: `<p style="margin:0">To sign in to Life Hub with this address, confirm it. The link works for 1 hour. If you didn't ask for this, ignore this email.</p>`,
      },
      { href: opts.url, fr: "Confirmer", en: "Confirm" },
    ),
  });
}

/** Sent to the OLD address once the change is done, so a takeover can't be silent. */
export async function sendEmailChangedNotice(opts: { to: string; newEmail: string; privacyUrl: string }) {
  const masked = escapeHtml(opts.newEmail);
  const link = escapeHtml(opts.privacyUrl);
  await sendEmail({
    kind: "email-changed",
    to: opts.to,
    subject: "Ton adresse Life Hub a changé · Your Life Hub address changed",
    text: `Ton compte Life Hub se connecte maintenant avec ${opts.newEmail}. Si ce n'est pas toi, écris-nous à l'adresse indiquée ici : ${opts.privacyUrl}\n\nYour Life Hub account now signs in with ${opts.newEmail}. If this wasn't you, write to the address given here: ${opts.privacyUrl}`,
    html: layout({
      fr: `<p style="margin:0">Ton compte Life Hub se connecte maintenant avec <strong>${masked}</strong>. Si ce n'est pas toi, écris-nous à l'adresse indiquée dans la <a href="${link}">politique de confidentialité</a>.</p>`,
      en: `<p style="margin:0">Your Life Hub account now signs in with <strong>${masked}</strong>. If this wasn't you, write to the address given in the <a href="${link}">privacy policy</a>.</p>`,
    }),
  });
}
