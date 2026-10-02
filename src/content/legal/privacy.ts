import type { LegalDoc } from "./types";

/**
 * Privacy policy — STRUCTURE ONLY. Every section below is a placeholder that
 * says what the final text must cover (Québec, Act respecting the protection
 * of personal information in the private sector, as amended by Law 25). The
 * owner pastes the final wording here; nothing in this file is legal text yet.
 *
 * Facts to draw on when writing it: DATA-INVENTORY.md.
 */
export const PRIVACY: LegalDoc = {
  slug: "confidentialite",
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  intro: {
    fr: [
      "Cette page explique quels renseignements personnels Life Hub recueille, pourquoi, avec qui ils sont partagés et quels sont tes droits.",
    ],
    en: [
      "This page explains what personal information Life Hub collects, why, who it is shared with, and what your rights are.",
    ],
  },
  sections: [
    {
      id: "responsable",
      heading: {
        fr: "Qui est responsable de tes renseignements",
        en: "Who is responsible for your information",
      },
      body: {
        fr: ["[Texte à venir : identité de l'entreprise et rôle de la personne responsable de la protection des renseignements personnels.]"],
        en: ["[Text to come: identity of the business and role of the person in charge of protecting personal information.]"],
      },
      placeholder: true,
      officer: true,
    },
    {
      id: "renseignements",
      heading: { fr: "Ce que nous recueillons", en: "What we collect" },
      body: {
        fr: ["[Texte à venir : courriel, nom, tâches, budget, abonnements, dettes, contenu des courriels analysés, photos, préférences de notification.]"],
        en: ["[Text to come: email, name, tasks, budget, subscriptions, debts, content of analysed emails, photos, notification preferences.]"],
      },
      placeholder: true,
    },
    {
      id: "fins",
      heading: { fr: "Pourquoi nous les utilisons", en: "Why we use it" },
      body: {
        fr: ["[Texte à venir : les fins de chaque catégorie de renseignements. Aucune vente, aucune publicité.]"],
        en: ["[Text to come: the purpose of each category of information. No selling, no advertising.]"],
      },
      placeholder: true,
    },
    {
      id: "sensibles",
      heading: {
        fr: "Renseignements sensibles : dettes et courriels",
        en: "Sensitive information: debts and email",
      },
      body: {
        fr: ["[Texte à venir : consentement exprès pour les dettes, pour leur partage avec un hub et pour l'analyse des courriels; comment retirer ce consentement.]"],
        en: ["[Text to come: express consent for debts, for sharing them with a hub and for email analysis; how to withdraw that consent.]"],
      },
      placeholder: true,
    },
    {
      id: "ia",
      heading: { fr: "Intelligence artificielle", en: "Artificial intelligence" },
      body: {
        fr: ["[Texte à venir : ce qui est envoyé à Anthropic (États-Unis) — phrases, photos, courriels si activé; la dictée vocale est faite par le navigateur ou le fabricant du téléphone; aucune décision entièrement automatisée.]"],
        en: ["[Text to come: what is sent to Anthropic (United States) — sentences, photos, emails if enabled; voice dictation is done by the browser or phone vendor; no fully automated decisions.]"],
      },
      placeholder: true,
    },
    {
      id: "fournisseurs",
      heading: {
        fr: "Fournisseurs et transferts hors Québec",
        en: "Service providers and transfers outside Québec",
      },
      body: {
        fr: ["[Texte à venir : Vercel, Neon, Resend, Anthropic, Google / Yahoo / Microsoft; lieux d'hébergement; évaluation des facteurs relatifs à la vie privée.]"],
        en: ["[Text to come: Vercel, Neon, Resend, Anthropic, Google / Yahoo / Microsoft; hosting locations; privacy impact assessment.]"],
      },
      placeholder: true,
    },
    {
      id: "partage",
      heading: { fr: "Ce que voient les autres membres d'un hub", en: "What other hub members see" },
      body: {
        fr: ["[Texte à venir : éléments partagés ou privés; ton courriel est caché par défaut; tes dettes sont privées sauf si tu les partages.]"],
        en: ["[Text to come: shared versus private items; your email is hidden by default; your debts are private unless you share them.]"],
      },
      placeholder: true,
    },
    {
      id: "conservation",
      heading: { fr: "Combien de temps nous les gardons", en: "How long we keep it" },
      body: {
        fr: ["[Texte à venir : calendrier de conservation — courriels analysés : 90 jours; compteurs techniques : 24 heures; le reste jusqu'à la suppression du compte.]"],
        en: ["[Text to come: retention schedule — analysed emails: 90 days; technical counters: 24 hours; the rest until the account is deleted.]"],
      },
      placeholder: true,
    },
    {
      id: "droits",
      heading: { fr: "Tes droits", en: "Your rights" },
      body: {
        fr: ["[Texte à venir : accès, rectification, portabilité, retrait du consentement, suppression; comment faire une demande; recours auprès de la Commission d'accès à l'information.]"],
        en: ["[Text to come: access, rectification, portability, withdrawal of consent, deletion; how to make a request; recourse to the Commission d'accès à l'information.]"],
      },
      placeholder: true,
    },
    {
      id: "age",
      heading: { fr: "Âge minimum", en: "Minimum age" },
      body: {
        fr: ["[Texte à venir : 14 ans pour utiliser Life Hub; 18 ans pour les dettes et l'analyse des courriels.]"],
        en: ["[Text to come: 14 to use Life Hub; 18 for debts and email analysis.]"],
      },
      placeholder: true,
    },
    {
      id: "securite",
      heading: { fr: "Sécurité et incidents", en: "Security and incidents" },
      body: {
        fr: ["[Texte à venir : mesures de sécurité; ce que nous faisons en cas d'incident de confidentialité.]"],
        en: ["[Text to come: security measures; what we do in the event of a confidentiality incident.]"],
      },
      placeholder: true,
    },
    {
      id: "modifications",
      heading: { fr: "Modifications à cette politique", en: "Changes to this policy" },
      body: {
        fr: ["[Texte à venir : comment tu seras avisé d'un changement.]"],
        en: ["[Text to come: how you will be told about a change.]"],
      },
      placeholder: true,
    },
  ],
};
