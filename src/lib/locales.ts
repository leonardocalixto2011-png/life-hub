/**
 * Formatting locales and hub currencies offered in settings.
 *
 * Locale here controls *number and date formatting only* — the interface
 * itself is still English throughout. Offering fr-CA does not translate the
 * app; it makes "1 234,56 $" render the way a Quebec user writes it instead
 * of "$1,234.56". Real UI translation is a separate, much larger job.
 */

export const LOCALES: { value: string; label: string }[] = [
  { value: "en-CA", label: "English (Canada)" },
  { value: "fr-CA", label: "Français (Canada)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "pt-BR", label: "Português (Brasil)" },
];

export const DEFAULT_LOCALE = "en-CA";

export const CURRENCIES: { value: string; label: string }[] = [
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "USD", label: "USD — US dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British pound" },
  { value: "AUD", label: "AUD — Australian dollar" },
  { value: "CHF", label: "CHF — Swiss franc" },
  { value: "MXN", label: "MXN — Mexican peso" },
  { value: "BRL", label: "BRL — Brazilian real" },
];

export function isLocale(v: unknown): v is string {
  return typeof v === "string" && LOCALES.some((l) => l.value === v);
}

export function isCurrency(v: unknown): v is string {
  return typeof v === "string" && CURRENCIES.some((c) => c.value === v);
}

export function resolveLocale(stored: string | null | undefined): string {
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}
