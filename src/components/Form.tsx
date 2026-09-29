/**
 * The pieces every edit screen is built from, so they all read alike:
 * labelled groups in cards, one full-width primary action at the bottom, and
 * destructive actions set apart below it where a thumb can't hit them on the
 * way to Save. Styles live in globals.css (`.form-card`, `.field-label`,
 * `.danger-zone`, `.btn-quiet-danger`). Server-safe: no hooks.
 */

/** A titled group of fields. `plain` drops the card and heading — for the
 *  inline create forms, which are already a card of their own. */
export function FormSection({
  title,
  children,
  plain,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  plain?: boolean;
}) {
  if (plain) return <div className="form-stack">{children}</div>;
  return (
    <section>
      {title && <h2 className="section-title">{title}</h2>}
      <div className="form-card">{children}</div>
    </section>
  );
}

/** Destructive actions, separated from Save by space and a hairline. */
export function DangerZone({ children }: { children: React.ReactNode }) {
  return <div className="danger-zone">{children}</div>;
}
