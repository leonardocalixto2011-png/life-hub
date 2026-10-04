import type { LegalDoc } from "./types";

/**
 * Terms of use — PRELIMINARY TEXT, same convention as privacy.ts: reviewed
 * against Québec's Consumer Protection Act (LPC), the Civil Code and the
 * Charter of the French language, not yet approved by a member of the Barreau.
 *
 * Two rules to keep when editing:
 *   - No clause may exclude or limit our liability for our own act or our
 *     representatives' (LPC s. 10). Clauses that would be void in Québec are
 *     either rewritten or labelled as such (LPC s. 19.1).
 *   - Paid plans are not covered yet. Before charging anyone, the "prix"
 *     section needs the full distance-contract disclosures and the
 *     cancellation rules; have the lawyer write that section.
 */
export const TERMS: LegalDoc = {
  slug: "conditions",
  title: { fr: "Conditions d'utilisation", en: "Terms of use" },
  intro: {
    fr: [
      "Ces conditions encadrent l'utilisation de Life Hub. En créant ton compte, tu les acceptes.",
      "Les présentes sont rédigées en français. Une version anglaise est offerte ; tu peux choisir d'être lié par elle seulement après avoir reçu la version française, en l'indiquant expressément.",
    ],
    en: [
      "These terms govern the use of Life Hub. By creating your account, you accept them.",
      "These terms are written in French. This English version is offered for convenience; you are bound by it only if, after receiving the French version, you expressly choose it. Otherwise the French version governs.",
    ],
  },
  sections: [
    {
      id: "service",
      heading: { fr: "Le service", en: "The service" },
      body: {
        fr: [
          "Life Hub est un outil d'organisation personnelle et familiale : tâches, calendrier, budget, abonnements, dettes, voyages, rappels. Ce n'est pas un conseiller financier, juridique ou fiscal, ni un service bancaire ou de recouvrement. Les calculs et suggestions sont indicatifs et ne remplacent pas un professionnel.",
          "Le service est gratuit pendant la période de lancement.",
        ],
        en: [
          "Life Hub is a personal and family organisation tool: tasks, calendar, budget, subscriptions, debts, trips, reminders. It is not a financial, legal or tax adviser, nor a banking or collection service. Calculations and suggestions are indicative and do not replace a professional.",
          "The service is free during the launch period.",
        ],
      },
    },
    {
      id: "compte",
      heading: { fr: "Ton compte et l'âge minimum", en: "Your account and minimum age" },
      body: {
        fr: [
          "- Tu dois avoir 14 ans ou plus. Le suivi des dettes, la connexion d'une boîte courriel et tout forfait payant sont réservés aux 18 ans et plus.",
          "- Tu te connectes par un lien envoyé à ton adresse courriel : elle doit t'appartenir et tu dois garder l'accès à cette boîte.",
          "- Avise-nous sans délai si tu crois que quelqu'un d'autre a utilisé ton compte.",
        ],
        en: [
          "- You must be 14 or older. Debt tracking, connecting a mailbox and any paid plan are for people 18 and older.",
          "- You sign in with a link sent to your email address: it must be yours, and you must keep access to that mailbox.",
          "- Tell us without delay if you believe someone else has used your account.",
        ],
      },
    },
    {
      id: "hubs",
      heading: { fr: "Groupes (hubs) et contenu partagé", en: "Hubs and shared content" },
      body: {
        fr: [
          "- Le propriétaire d'un groupe invite et retire les membres. Ce que tu marques comme partagé est visible par tous les membres actifs du groupe.",
          "- N'invite que des personnes qui veulent y être, et ne partage pas l'information d'une autre personne sans son accord.",
          "- Quand tu quittes un groupe ou en es retiré, tes éléments privés y sont effacés ; ce que tu avais partagé y reste pour les autres membres.",
        ],
        en: [
          "- A hub's owner invites and removes members. What you mark as shared is visible to every active member of the hub.",
          "- Only invite people who want to be there, and do not share someone else's information without their agreement.",
          "- When you leave a hub or are removed from it, your private items there are erased; what you had shared stays for the other members.",
        ],
      },
    },
    {
      id: "contenu",
      heading: { fr: "Ton contenu", en: "Your content" },
      body: {
        fr: [
          "Ce que tu entres (texte, photos, montants) t'appartient. Tu nous permets seulement de le stocker, de l'afficher à toi et aux membres des groupes où tu le partages, et de le traiter pour faire fonctionner le service, y compris par nos fournisseurs. Cette permission prend fin quand tu supprimes le contenu ou ton compte, sous réserve des copies de sauvegarde décrites dans la politique de confidentialité.",
        ],
        en: [
          "What you enter (text, photos, amounts) belongs to you. You only allow us to store it, show it to you and to the members of the hubs where you share it, and process it to run the service, including through our service providers. This permission ends when you delete the content or your account, subject to the backups described in the privacy policy.",
        ],
      },
    },
    {
      id: "ia",
      heading: { fr: "Fonctions d'intelligence artificielle", en: "Artificial-intelligence features" },
      body: {
        fr: [
          "Les propositions de l'IA (titres, dates, montants, catégories) peuvent contenir des erreurs. Vérifie-les avant de les enregistrer, surtout une date d'échéance ou un montant à payer.",
        ],
        en: [
          "AI suggestions (titles, dates, amounts, categories) can contain mistakes. Check them before saving, especially a due date or an amount to pay.",
        ],
      },
    },
    {
      id: "courriels",
      heading: { fr: "Boîtes courriel connectées", en: "Connected mailboxes" },
      body: {
        fr: [
          "Si tu connectes une boîte courriel, tu confirmes en avoir le droit. Life Hub utilise cet accès seulement pour lire tes nouveaux messages : il n'en envoie, n'en supprime et n'en modifie aucun, et ne les marque pas comme lus.",
          "Attention : un mot de passe d'application (Gmail, Yahoo) donne techniquement un accès complet à ta boîte. Life Hub le garde chiffré et n'en fait que l'usage décrit ici. Tu peux déconnecter la boîte dans Life Hub et révoquer ce mot de passe chez ton fournisseur en tout temps.",
        ],
        en: [
          "If you connect a mailbox, you confirm you have the right to. Life Hub uses that access only to read your new messages: it sends, deletes and changes none of them, and does not mark them as read.",
          "Note: an app password (Gmail, Yahoo) technically gives full access to your mailbox. Life Hub keeps it encrypted and uses it only as described here. You can disconnect the mailbox in Life Hub and revoke that password at your provider at any time.",
        ],
      },
    },
    {
      id: "usage",
      heading: { fr: "Utilisation acceptable", en: "Acceptable use" },
      body: {
        fr: [
          "Il est interdit d'utiliser Life Hub pour harceler une personne, la surveiller à son insu, stocker du contenu illégal, contourner les limites d'utilisation, tenter d'accéder aux données d'un autre groupe ou nuire au service. Nous pouvons suspendre un compte qui enfreint gravement ces règles.",
        ],
        en: [
          "You may not use Life Hub to harass anyone, monitor someone without their knowledge, store illegal content, get around usage limits, try to access another hub's data or harm the service. We may suspend an account that seriously breaches these rules.",
        ],
      },
    },
    {
      id: "responsabilite",
      heading: { fr: "Disponibilité et responsabilité", en: "Availability and liability" },
      body: {
        fr: [
          "Nous faisons de notre mieux pour que le service soit disponible et que les rappels partent à temps, sans pouvoir le garantir (panne d'un fournisseur, notifications bloquées par ton téléphone). Ne compte pas uniquement sur Life Hub pour une échéance légale ou financière importante.",
          "Rien dans les présentes n'exclut ni ne limite notre responsabilité pour notre propre fait ou celui de nos représentants et fournisseurs, pour un préjudice corporel ou moral, ou pour un préjudice matériel causé par une faute intentionnelle ou lourde. Sous ces réserves, nous ne sommes pas responsables d'un préjudice causé par une force majeure.",
        ],
        en: [
          "We do our best to keep the service available and reminders on time, but cannot guarantee it (a provider outage, notifications blocked by your phone). Do not rely on Life Hub alone for an important legal or financial deadline.",
          "Nothing in these terms excludes or limits our liability for our own act or that of our representatives and service providers, for bodily or moral injury, or for material injury caused by intentional or gross fault. Subject to that, we are not liable for injury caused by superior force (force majeure).",
        ],
      },
    },
    {
      id: "fin",
      heading: { fr: "Fermer ton compte", en: "Closing your account" },
      body: {
        fr: [
          "Tu peux supprimer ton compte en tout temps depuis Ton compte, sans frais. Ce qui est effacé et ce qui reste dans un groupe partagé est décrit dans la politique de confidentialité.",
          "Nous pouvons fermer ton accès immédiatement si tu enfreins gravement les présentes. Sinon, nous te donnons un préavis écrit d'au moins 60 jours et te laissons télécharger tes données avant la fermeture.",
        ],
        en: [
          "You can delete your account at any time from Your account, at no cost. What is erased and what stays in a shared hub is described in the privacy policy.",
          "We may close your access immediately if you seriously breach these terms. Otherwise, we give you at least 60 days' written notice and let you download your data before closing it.",
        ],
      },
    },
    {
      id: "modifications",
      heading: { fr: "Modifications", en: "Changes" },
      body: {
        fr: [
          "Nous pouvons modifier seulement les fonctionnalités accessoires, les limites d'utilisation, les procédures de soutien et la liste des fournisseurs ; jamais unilatéralement la nature du service, ni le prix ou la durée d'un forfait en cours.",
          "Au moins 30 jours avant l'entrée en vigueur, nous t'envoyons un avis écrit, rédigé clairement, contenant seulement la clause nouvelle ou modifiée, sa version antérieure et la date d'entrée en vigueur. Si la modification augmente tes obligations ou réduit les nôtres, tu peux la refuser et résilier sans frais, pénalité ni indemnité, en nous avisant au plus tard 30 jours après son entrée en vigueur.",
        ],
        en: [
          "We may change only ancillary features, usage limits, support procedures and the list of service providers; never, unilaterally, the nature of the service or the price or term of a plan in progress.",
          "At least 30 days before it takes effect, we send you a clearly written notice containing only the new or changed clause, its previous version and the date it takes effect. If the change increases your obligations or reduces ours, you may refuse it and cancel at no cost, penalty or indemnity, by telling us no later than 30 days after it takes effect.",
        ],
      },
    },
    {
      id: "droit",
      heading: { fr: "Droit applicable", en: "Governing law" },
      body: {
        fr: [
          "Les lois du Québec et les lois fédérales applicables régissent les présentes. Si tu résides au Québec, rien ne te prive de la protection de la loi québécoise ni de ton droit de poursuivre devant les tribunaux du Québec. Aucune clause ne t'oblige à l'arbitrage ni ne t'empêche de participer à une action collective.",
        ],
        en: [
          "The laws of Québec and the applicable federal laws govern these terms. If you live in Québec, nothing deprives you of the protection of Québec law or of your right to sue before Québec courts. No clause forces you into arbitration or prevents you from joining a class action.",
        ],
      },
    },
    {
      id: "contact",
      heading: { fr: "Nous joindre", en: "Contact" },
      body: {
        fr: ["Pour toute question sur ces conditions ou sur tes renseignements personnels :"],
        en: ["For any question about these terms or your personal information:"],
      },
      officer: true,
    },
  ],
};
