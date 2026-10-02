import type { LegalDoc } from "./types";

/**
 * Terms of use — STRUCTURE ONLY, same convention as privacy.ts: every section
 * is a placeholder describing what the final text must cover. The owner pastes
 * the final wording here.
 */
export const TERMS: LegalDoc = {
  slug: "conditions",
  title: { fr: "Conditions d'utilisation", en: "Terms of use" },
  intro: {
    fr: ["Ces conditions encadrent l'utilisation de Life Hub."],
    en: ["These terms govern the use of Life Hub."],
  },
  sections: [
    {
      id: "service",
      heading: { fr: "Le service", en: "The service" },
      body: {
        fr: ["[Texte à venir : ce que Life Hub fait et ne fait pas. Ce n'est pas un conseil financier.]"],
        en: ["[Text to come: what Life Hub does and does not do. It is not financial advice.]"],
      },
      placeholder: true,
    },
    {
      id: "compte",
      heading: { fr: "Ton compte et l'âge minimum", en: "Your account and minimum age" },
      body: {
        fr: ["[Texte à venir : 14 ans ou plus; 18 ans pour les dettes et l'analyse des courriels; connexion par lien courriel.]"],
        en: ["[Text to come: 14 or older; 18 for debts and email analysis; sign-in by email link.]"],
      },
      placeholder: true,
    },
    {
      id: "hubs",
      heading: { fr: "Hubs et contenu partagé", en: "Hubs and shared content" },
      body: {
        fr: ["[Texte à venir : responsabilités du propriétaire d'un hub; ce qui arrive au contenu partagé quand quelqu'un quitte.]"],
        en: ["[Text to come: a hub owner's responsibilities; what happens to shared content when someone leaves.]"],
      },
      placeholder: true,
    },
    {
      id: "usage",
      heading: { fr: "Utilisation acceptable", en: "Acceptable use" },
      body: {
        fr: ["[Texte à venir.]"],
        en: ["[Text to come.]"],
      },
      placeholder: true,
    },
    {
      id: "ia",
      heading: { fr: "Fonctions d'intelligence artificielle", en: "Artificial-intelligence features" },
      body: {
        fr: ["[Texte à venir : les suggestions de l'IA sont à vérifier avant d'être acceptées.]"],
        en: ["[Text to come: AI suggestions are to be checked before being accepted.]"],
      },
      placeholder: true,
    },
    {
      id: "responsabilite",
      heading: { fr: "Limites de responsabilité", en: "Limits of liability" },
      body: {
        fr: ["[Texte à venir.]"],
        en: ["[Text to come.]"],
      },
      placeholder: true,
    },
    {
      id: "fin",
      heading: { fr: "Fermer ton compte", en: "Closing your account" },
      body: {
        fr: ["[Texte à venir : suppression depuis « Ton compte »; ce qui est effacé et ce qui reste dans un hub partagé.]"],
        en: ["[Text to come: deletion from “Your account”; what is erased and what stays in a shared hub.]"],
      },
      placeholder: true,
    },
    {
      id: "droit",
      heading: { fr: "Droit applicable", en: "Governing law" },
      body: {
        fr: ["[Texte à venir : lois du Québec.]"],
        en: ["[Text to come: laws of Québec.]"],
      },
      placeholder: true,
    },
    {
      id: "contact",
      heading: { fr: "Nous joindre", en: "Contact" },
      body: {
        fr: ["[Texte à venir.]"],
        en: ["[Text to come.]"],
      },
      placeholder: true,
      officer: true,
    },
  ],
};
