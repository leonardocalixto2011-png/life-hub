import Link from "next/link";

import type { LegalDoc, LegalLang } from "@/content/legal/types";
import { POLICY_UPDATED, POLICY_VERSION, legalPublished } from "@/content/legal/version";
import { langOf } from "@/lib/i18n";
import { getUser } from "@/lib/session";

/**
 * Renders a legal document (privacy policy, terms) from its typed content
 * module. Public — works signed out — so it reads nothing hub-scoped.
 *
 * Language: an explicit `?lang=` wins, then the signed-in person's own
 * setting. Otherwise French, whatever the browser asks for: these are
 * contracts of adhesion, and the Charter of the French language (s. 55)
 * requires the French version to be handed over first — someone may then
 * choose English with the link at the top. Do not bring Accept-Language back.
 */
export async function resolveLegalLang(param: string | undefined): Promise<LegalLang> {
  if (param === "fr" || param === "en") return param;
  const user = await getUser();
  if (user?.locale) return langOf(user.locale);
  return "fr";
}

const UI = {
  fr: {
    draft: "Version préliminaire",
    draftBody:
      "Ce texte n'est pas final. Les sections marquées « à compléter » seront remplacées par la version officielle.",
    todo: "à compléter",
    updated: "Dernière mise à jour",
    version: "Version",
    other: "English",
    back: "Retour à Life Hub",
    officer: "Responsable de la protection des renseignements personnels",
    entity: "Entreprise",
    title: "Titre",
    email: "Courriel",
    address: "Adresse",
    missing: "[à compléter]",
    privacy: "Politique de confidentialité",
    terms: "Conditions d'utilisation",
  },
  en: {
    draft: "Preliminary version",
    draftBody:
      "This text is not final. Sections marked “to be completed” will be replaced by the official version.",
    todo: "to be completed",
    updated: "Last updated",
    version: "Version",
    other: "Français",
    back: "Back to Life Hub",
    officer: "Person in charge of the protection of personal information",
    entity: "Business",
    title: "Title",
    email: "Email",
    address: "Address",
    missing: "[to be completed]",
    privacy: "Privacy policy",
    terms: "Terms of use",
  },
} as const;

/** Read at request time, so setting the variables needs no rebuild. */
function officer() {
  const v = (name: string) => process.env[name]?.trim() || null;
  return {
    entity: v("LEGAL_ENTITY_NAME"),
    title: v("PRIVACY_OFFICER_TITLE"),
    email: v("PRIVACY_OFFICER_EMAIL"),
    address: v("LEGAL_ADDRESS"),
  };
}

function Paragraphs({ items }: { items: string[] }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) return;
    out.push(
      <ul key={`l${out.length}`} className="list-disc space-y-1 pl-5">
        {list.map((li, i) => (
          <li key={i}>{li}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const p of items) {
    if (p.startsWith("- ")) list.push(p.slice(2));
    else {
      flush();
      out.push(<p key={`p${out.length}`}>{p}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

export async function LegalPage({ doc, langParam }: { doc: LegalDoc; langParam?: string }) {
  const lang = await resolveLegalLang(langParam);
  const ui = UI[lang];
  const o = officer();
  const other: LegalLang = lang === "fr" ? "en" : "fr";
  const sibling = doc.slug === "confidentialite" ? "conditions" : "confidentialite";

  return (
    <main lang={lang} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Life Hub">
        <Link href="/" className="font-semibold text-[var(--color-primary)]">
          ← {ui.back}
        </Link>
        <Link href={`/${doc.slug}?lang=${other}`} lang={other} className="font-semibold text-[var(--color-primary)]">
          {ui.other}
        </Link>
      </nav>

      {!legalPublished() && (
        <div
          role="note"
          className="card border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-sm"
        >
          <p className="font-semibold text-[var(--color-danger)]">{ui.draft}</p>
          <p className="mt-1 text-[var(--color-text-dim)]">{ui.draftBody}</p>
        </div>
      )}

      <header>
        <h1 className="text-2xl font-bold tracking-tight">{doc.title[lang]}</h1>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          {ui.updated}
          {lang === "fr" ? " : " : ": "}
          {POLICY_UPDATED} · {ui.version} {POLICY_VERSION}
        </p>
        <div className="mt-3 space-y-2 text-sm leading-relaxed">
          <Paragraphs items={doc.intro[lang]} />
        </div>
      </header>

      {doc.sections.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-4">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">
            <span>
              {i + 1}. {s.heading[lang]}
            </span>
            {s.placeholder && (
              <span className="chip text-[var(--color-text-dim)]" data-placeholder>
                {ui.todo}
              </span>
            )}
          </h2>
          <div
            className={`mt-2 space-y-2 text-sm leading-relaxed ${s.placeholder ? "text-[var(--color-text-dim)]" : ""}`}
          >
            <Paragraphs items={s.body[lang]} />
          </div>

          {s.officer && (
            <dl className="card mt-3 space-y-2 p-4 text-sm">
              <dt className="font-semibold">{ui.officer}</dt>
              <dd className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <span className="text-[var(--color-text-dim)]">{ui.entity}</span>
                <span>{o.entity ?? ui.missing}</span>
                <span className="text-[var(--color-text-dim)]">{ui.title}</span>
                <span>{o.title ?? ui.missing}</span>
                <span className="text-[var(--color-text-dim)]">{ui.email}</span>
                <span className="break-all">
                  {o.email ? (
                    <a href={`mailto:${o.email}`} className="font-semibold text-[var(--color-primary)]">
                      {o.email}
                    </a>
                  ) : (
                    ui.missing
                  )}
                </span>
                <span className="text-[var(--color-text-dim)]">{ui.address}</span>
                <span>{o.address ?? ui.missing}</span>
              </dd>
            </dl>
          )}
        </section>
      ))}

      <footer className="border-t border-[var(--color-border)] pt-4 text-sm">
        <Link href={`/${sibling}?lang=${lang}`} className="font-semibold text-[var(--color-primary)]">
          {sibling === "conditions" ? ui.terms : ui.privacy} →
        </Link>
      </footer>
    </main>
  );
}

/**
 * The two links, for the login footer, /welcome and /account. Takes the
 * already-translated labels so it works in server and client trees alike.
 */
export function LegalLinks({
  privacy,
  terms,
  className,
}: {
  privacy: string;
  terms: string;
  className?: string;
}) {
  return (
    <p className={className ?? "text-xs text-[var(--color-text-dim)]"}>
      <Link href="/confidentialite" className="underline">
        {privacy}
      </Link>
      {" · "}
      <Link href="/conditions" className="underline">
        {terms}
      </Link>
    </p>
  );
}
