import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The label over every card-sized section, and the page title at the top of
 * a screen. One component each, so the twenty-odd screens that grew their own
 * `text-xs font-bold uppercase…` strings can't drift apart again. The styles
 * themselves are `.section-title` / `.page-title` in globals.css, so a plain
 * `<h2 className="section-title">` stays identical where a component would be
 * overkill.
 *
 * Neither uses the display serif: these label facts, they don't speak.
 */
export function SectionHeader({
  title,
  href,
  cta,
  tone,
  id,
}: {
  title: React.ReactNode;
  href?: string;
  cta?: string;
  tone?: "danger";
  id?: string;
}) {
  return (
    <div className="section-head">
      <h2
        id={id}
        className="section-title"
        style={tone === "danger" ? { color: "var(--color-danger)" } : undefined}
      >
        {title}
      </h2>
      {href && cta && (
        <Link href={href} className="section-link">
          {cta}
          <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  action,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
