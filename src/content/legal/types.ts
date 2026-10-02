/**
 * Shape of a legal document (privacy policy, terms). Both languages live side
 * by side in one module so a section can never exist in French and be
 * forgotten in English. French is the reference version (Québec).
 */
export type LegalLang = "fr" | "en";

export type Bilingual<T = string> = Record<LegalLang, T>;

export type LegalSection = {
  /** Stable anchor id — used for #links; must not change once published. */
  id: string;
  heading: Bilingual;
  /** Paragraphs. A paragraph starting with "- " is rendered as a list item. */
  body: Bilingual<string[]>;
  /**
   * True while the body is a stand-in for text that has not been written yet.
   * Rendered with a visible "to be completed" marker so a draft can never be
   * mistaken for the final document.
   */
  placeholder?: boolean;
  /** Render the privacy-officer contact block (from env) after the body. */
  officer?: boolean;
};

export type LegalDoc = {
  slug: "confidentialite" | "conditions";
  title: Bilingual;
  intro: Bilingual<string[]>;
  sections: LegalSection[];
};
