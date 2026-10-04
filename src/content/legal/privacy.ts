import type { LegalDoc } from "./types";

/**
 * Privacy policy — PRELIMINARY TEXT, reviewed against Québec's Act respecting
 * the protection of personal information in the private sector (as amended by
 * Law 25) and PIPEDA, but not yet approved by a member of the Barreau du
 * Québec. The page shows a "preliminary version" banner until
 * `legalPublished()` is true, which also requires the privacy-officer
 * variables to be set (see version.ts).
 *
 * Keep every statement true of the code: facts come from DATA-INVENTORY.md.
 * If a feature changes what is collected, who receives it or how long it is
 * kept, change this text in the same PR and bump POLICY_VERSION.
 */
export const PRIVACY: LegalDoc = {
  slug: "confidentialite",
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  intro: {
    fr: [
      "Life Hub recueille seulement ce qu'il faut pour t'aider à organiser ta vie et ton budget. Nous ne vendons jamais tes renseignements, nous ne faisons pas de publicité et tu peux les télécharger ou les effacer en tout temps.",
      "La version française de cette politique est la version de référence.",
    ],
    en: [
      "Life Hub collects only what it needs to help you organise your life and your budget. We never sell your information, we run no advertising, and you can download or erase it at any time.",
      "The French version of this policy is the reference version.",
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
        fr: [
          "L'entreprise qui exploite Life Hub est responsable des renseignements personnels qu'elle détient. La personne responsable de la protection des renseignements personnels veille à l'application de cette politique et répond à tes demandes. Son titre et ses coordonnées sont indiqués ci-dessous.",
        ],
        en: [
          "The business that operates Life Hub is responsible for the personal information it holds. The person in charge of the protection of personal information oversees this policy and answers your requests. Their title and contact details are shown below.",
        ],
      },
      officer: true,
    },
    {
      id: "renseignements",
      heading: { fr: "Ce que nous recueillons", en: "What we collect" },
      body: {
        fr: [
          "- Compte : adresse courriel, nom affiché, langue, fuseau horaire, préférences d'affichage et de notification, attestation d'âge.",
          "- Ce que tu entres : tâches, échéances, événements, horaires de travail, voyages, dates spéciales, notes.",
          "- Renseignements financiers : revenus et dépenses, abonnements, objectifs de budget et, si tu choisis de les suivre, tes dettes (créancier, solde, taux, paiements, statut, y compris un défaut de paiement).",
          "- Photos : reçus, factures, invitations et photos de produits que tu choisis de joindre ou de faire lire, la photo d'arrière-plan et la photo de couverture d'un groupe.",
          "- Courriels, seulement si tu connectes une boîte ou transfères un message à l'adresse de ton groupe : expéditeur, objet, extrait et montants des messages retenus. Le mot de passe d'application ou le jeton d'accès de ta boîte est chiffré.",
          "- Appareil et journaux : adresse de notification push de ton navigateur, journaux techniques (adresse IP, date, page demandée).",
          "Nous n'utilisons aucun outil de publicité ni de mesure d'audience. Nous utilisons seulement des témoins (cookies) nécessaires au fonctionnement : la session de connexion, la protection contre la falsification de requêtes et le groupe choisi. Quelques réglages d'affichage (par exemple « réduire les animations ») sont gardés sur ton appareil seulement.",
        ],
        en: [
          "- Account: email address, display name, language, time zone, display and notification preferences, age attestation.",
          "- What you enter: tasks, deadlines, events, work schedules, trips, special dates, notes.",
          "- Financial information: income and expenses, subscriptions, budget targets and, if you choose to track them, your debts (creditor, balance, rate, payments, status, including a default).",
          "- Photos: receipts, bills, invitations and product photos you choose to attach or have read, your background photo and a hub's cover photo.",
          "- Email, only if you connect a mailbox or forward a message to your hub's address: sender, subject, excerpt and amounts of the messages kept. Your mailbox's app password or access token is encrypted.",
          "- Device and logs: your browser's push-notification address, technical logs (IP address, date, page requested).",
          "We use no advertising or audience-measurement tools. We use only the cookies the service needs to work: your sign-in session, protection against request forgery, and the hub you picked. A few display settings (such as “reduce motion”) are kept on your device only.",
        ],
      },
    },
    {
      id: "fins",
      heading: { fr: "Pourquoi nous les utilisons", en: "Why we use it" },
      body: {
        fr: [
          "- Faire fonctionner l'application et te montrer tes informations.",
          "- Montrer aux membres de ton groupe ce que tu y marques comme partagé.",
          "- T'envoyer le résumé du matin, les rappels et les invitations que tu as demandés.",
          "- Transformer une phrase, une photo ou un courriel en tâche, événement ou dépense, à ta demande.",
          "- Protéger le service (limites d'utilisation, détection d'abus) et respecter nos obligations légales.",
          "Nous n'utilisons tes renseignements à aucune autre fin sans ton consentement. Nous ne les vendons pas, ne les louons pas et ne les utilisons pas pour de la publicité.",
        ],
        en: [
          "- Run the app and show you your information.",
          "- Show the members of your hub what you mark as shared there.",
          "- Send you the morning summary, reminders and invitations you asked for.",
          "- Turn a sentence, a photo or an email into a task, event or expense, when you ask.",
          "- Protect the service (usage limits, abuse detection) and meet our legal obligations.",
          "We use your information for no other purpose without your consent. We do not sell it, rent it or use it for advertising.",
        ],
      },
    },
    {
      id: "sensibles",
      heading: {
        fr: "Ton consentement, et les renseignements sensibles",
        en: "Your consent, and sensitive information",
      },
      body: {
        fr: [
          "Tu consens aux usages décrits ici quand tu crées ton compte et confirmes avoir 14 ans ou plus.",
          "Tes dettes (créancier, solde, taux, paiements, statut de défaut) sont des renseignements sensibles. Avant ta première dette, nous te demandons un consentement exprès, dans un écran séparé, avec une case non cochée. Montrer ton suivi de dettes aux membres d'un groupe demande un nouveau consentement, pour ce groupe. Chaque consentement est inscrit avec sa date et la version de cette politique.",
          "Tu peux retirer un consentement en tout temps, au même endroit où tu l'as donné. Retirer ton consentement aux dettes arrête leur traitement partout dans l'application (résumés, budget, rappels).",
          "Par défaut : tes éléments privés restent privés, tes dettes ne sont montrées à personne, ton adresse courriel n'est pas visible des autres membres et l'analyse de tes courriels par l'IA est désactivée.",
        ],
        en: [
          "You consent to the uses described here when you create your account and confirm you are 14 or older.",
          "Your debts (creditor, balance, rate, payments, default status) are sensitive information. Before your first debt we ask for your express consent, on a separate screen, with an unticked box. Showing your debt tracker to the members of a hub asks for a new consent, for that hub. Each consent is recorded with its date and the version of this policy.",
          "You can withdraw a consent at any time, where you gave it. Withdrawing your consent for debts stops their processing everywhere in the app (summaries, budget, reminders).",
          "By default: your private items stay private, your debts are shown to nobody, your email address is not visible to other members, and AI analysis of your email is off.",
        ],
      },
    },
    {
      id: "ia",
      heading: { fr: "Intelligence artificielle", en: "Artificial intelligence" },
      body: {
        fr: [
          "Life Hub utilise l'IA d'Anthropic (États-Unis) pour : (1) transformer ce que tu tapes, dictes ou photographies en tâches, événements ou dépenses, quand tu le demandes ; (2) trier les courriels de ta boîte connectée ou transférés à ton groupe (facture, rendez-vous, abonnement).",
          "Le tri des courriels peut révéler des éléments de ta situation économique. Il est désactivé par défaut : tu l'actives pour un groupe sur la page Courriels, en cochant la case prévue, et tu l'y désactives en tout temps. Les courriels promotionnels ou purement informatifs sont écartés et non conservés.",
          "Aucune décision fondée exclusivement sur un traitement automatisé n'est prise à ton sujet. Ce que l'IA propose attend ta confirmation, sauf les classements automatiques que tu as autorisés pour un expéditeur de confiance ; tu peux les annuler et retirer cette confiance.",
          "Anthropic traite ces données pour nous, sous entente, et ne les utilise pas pour entraîner ses modèles selon ses conditions commerciales.",
          "Dictée vocale : la reconnaissance de la voix est faite par ton navigateur ou ton téléphone (par exemple Apple ou Google), selon leurs propres politiques. Life Hub ne reçoit que le texte.",
        ],
        en: [
          "Life Hub uses AI from Anthropic (United States) to: (1) turn what you type, dictate or photograph into tasks, events or expenses, when you ask; (2) sort the email from your connected mailbox or forwarded to your hub (bill, appointment, subscription).",
          "Sorting email can reveal things about your financial situation. It is off by default: you turn it on for a hub on the Email page by ticking the box provided, and you can turn it off there at any time. Promotional or purely informational emails are set aside and not kept.",
          "No decision based exclusively on automated processing is made about you. What the AI suggests waits for your confirmation, except automatic filing you authorised for a trusted sender; you can undo it and withdraw that trust.",
          "Anthropic processes this data on our behalf, under agreement, and under its commercial terms does not use it to train its models.",
          "Voice dictation: speech recognition is done by your browser or phone (for example Apple or Google), under their own policies. Life Hub only receives the text.",
        ],
      },
    },
    {
      id: "partage",
      heading: { fr: "Ce que voient les autres membres d'un groupe", en: "What other hub members see" },
      body: {
        fr: [
          "Les membres actifs d'un groupe voient ce que tu y marques comme partagé, ton nom affiché et, si tu le choisis, ton adresse courriel. Ils ne voient jamais tes éléments privés ni tes dettes, sauf si tu as consenti à montrer ton suivi de dettes à ce groupe.",
          "Une personne invitée qui n'a pas encore accepté ne voit rien du groupe.",
        ],
        en: [
          "Active members of a hub see what you mark as shared there, your display name and, if you choose, your email address. They never see your private items or your debts, unless you consented to show your debt tracker to that hub.",
          "Someone who was invited but has not accepted yet sees nothing of the hub.",
        ],
      },
    },
    {
      id: "fournisseurs",
      heading: {
        fr: "Fournisseurs et communication hors Québec",
        en: "Service providers and transfers outside Québec",
      },
      body: {
        fr: [
          "Nos fournisseurs traitent tes renseignements pour nous, sous entente écrite, et seulement pour fournir le service :",
          "- Vercel (États-Unis) : hébergement de l'application, journaux techniques et stockage des photos.",
          "- Neon (États-Unis) : base de données.",
          "- Resend (États-Unis) : envoi des liens de connexion, résumés et invitations.",
          "- Anthropic (États-Unis) : IA.",
          "- Cloudflare (États-Unis et mondial) : réception des courriels transférés à l'adresse d'un groupe.",
          "- Open-Meteo (Suisse) : météo des voyages ; reçoit seulement le nom de la destination, sans rien qui t'identifie.",
          "Si tu connectes ta boîte, Life Hub y accède chez ton fournisseur (Google, Yahoo ou Microsoft), selon ses conditions.",
          "Tes renseignements sont donc communiqués à l'extérieur du Québec. Nous ne le faisons qu'après avoir évalué les facteurs relatifs à la vie privée (sensibilité, finalité, mesures de protection, régime juridique de l'endroit) et conclu qu'ils y bénéficient d'une protection adéquate. Une fois aux États-Unis, ils peuvent être soumis aux lois de ce pays, y compris aux demandes de ses autorités.",
          "Nous ne communiquons tes renseignements à aucune autre personne sans ton consentement, sauf lorsque la loi l'exige ou le permet.",
        ],
        en: [
          "Our service providers process your information on our behalf, under written agreement, and only to provide the service:",
          "- Vercel (United States): app hosting, technical logs and photo storage.",
          "- Neon (United States): database.",
          "- Resend (United States): sending sign-in links, summaries and invitations.",
          "- Anthropic (United States): AI.",
          "- Cloudflare (United States and worldwide): receiving email forwarded to a hub's address.",
          "- Open-Meteo (Switzerland): trip weather; receives only the destination name, nothing that identifies you.",
          "If you connect your mailbox, Life Hub accesses it at your provider (Google, Yahoo or Microsoft), under its terms.",
          "Your information is therefore communicated outside Québec. We do so only after assessing the privacy factors (sensitivity, purpose, safeguards, the legal framework of the place) and concluding it receives adequate protection there. Once in the United States, it may be subject to that country's laws, including requests from its authorities.",
          "We communicate your information to no one else without your consent, except where the law requires or allows it.",
        ],
      },
    },
    {
      id: "conservation",
      heading: { fr: "Combien de temps nous les gardons", en: "How long we keep it" },
      body: {
        fr: [
          "- Ton compte et ton contenu : tant que ton compte existe.",
          "- Courriels analysés (boîte de révision) : 90 jours après leur arrivée, qu'ils aient été traités ou non.",
          "- Fil d'activité d'un groupe (« qui a fait quoi ») : 90 jours.",
          "- Liens de connexion non utilisés et compteurs de limites d'utilisation : effacés chaque jour une fois expirés. Les adresses courriel y sont remplacées par une empreinte chiffrée.",
          "- Journaux techniques et copies de sauvegarde : pour la courte durée fixée par nos fournisseurs d'hébergement et de base de données.",
          "Quand tu supprimes ton compte, nous effaçons tes renseignements personnels, tes éléments privés, tes dettes et tes photos. Ce que tu avais partagé dans un groupe y reste pour les autres membres, puisque c'est aussi leur information, mais n'est plus associé à ton compte.",
        ],
        en: [
          "- Your account and content: for as long as your account exists.",
          "- Analysed email (review inbox): 90 days after it arrives, whether or not it was handled.",
          "- A hub's activity feed (“who did what”): 90 days.",
          "- Unused sign-in links and usage-limit counters: deleted daily once expired. Email addresses in them are replaced by a keyed fingerprint.",
          "- Technical logs and backups: for the short period set by our hosting and database providers.",
          "When you delete your account, we erase your personal information, your private items, your debts and your photos. What you had shared in a hub stays there for the other members, since it is their information too, but is no longer linked to your account.",
        ],
      },
    },
    {
      id: "securite",
      heading: { fr: "Sécurité et incidents", en: "Security and incidents" },
      body: {
        fr: [
          "Connexion sans mot de passe par lien envoyé par courriel, sessions limitées à 7 jours, chiffrement en transit (HTTPS), chiffrement des accès aux boîtes courriel, isolation des groupes appliquée par la base de données elle-même, accès restreint.",
          "Les photos sont stockées à des adresses impossibles à deviner, mais accessibles à qui connaît le lien : ne joins pas de photo de pièce d'identité ou de carte bancaire.",
          "Nous tenons un registre de tous les incidents de confidentialité. Si un incident présente un risque de préjudice sérieux, nous avisons avec diligence la Commission d'accès à l'information et les personnes concernées.",
        ],
        en: [
          "Passwordless sign-in by emailed link, sessions limited to 7 days, encryption in transit (HTTPS), encrypted mailbox access, hub isolation enforced by the database itself, restricted access.",
          "Photos are stored at addresses that cannot be guessed, but anyone who has the link can open them: do not attach a photo of an ID or a bank card.",
          "We keep a register of every confidentiality incident. If an incident presents a risk of serious injury, we promptly notify the Commission d'accès à l'information and the people concerned.",
        ],
      },
    },
    {
      id: "droits",
      heading: { fr: "Tes droits", en: "Your rights" },
      body: {
        fr: [
          "Tu peux demander l'accès à tes renseignements, leur rectification, le retrait de ton consentement et, dans les cas prévus par la loi, la cessation de leur diffusion ou leur désindexation.",
          "Tu peux télécharger toutes tes données dans un format structuré et couramment utilisé (JSON) depuis Ton compte, ou demander que nous les transmettions à une personne ou un organisme que tu désignes. Tu peux aussi supprimer ton compte depuis Ton compte.",
          "Pour toute demande, écris à la personne responsable (section 1). Nous répondons par écrit dans les 30 jours.",
          "Plaintes : écris d'abord à la personne responsable. Si la réponse ne te satisfait pas, tu peux t'adresser à la Commission d'accès à l'information du Québec (cai.gouv.qc.ca, 1 888 528-7741) ou, hors Québec, au Commissariat à la protection de la vie privée du Canada (priv.gc.ca).",
        ],
        en: [
          "You can ask for access to your information, its correction, the withdrawal of your consent and, where the law provides for it, that it stop being disseminated or be de-indexed.",
          "You can download all your data in a structured, commonly used format (JSON) from Your account, or ask us to send it to a person or organisation you name. You can also delete your account from Your account.",
          "For any request, write to the person in charge (section 1). We answer in writing within 30 days.",
          "Complaints: write to the person in charge first. If you are not satisfied with the answer, you can contact Québec's Commission d'accès à l'information (cai.gouv.qc.ca, 1 888 528-7741) or, outside Québec, the Office of the Privacy Commissioner of Canada (priv.gc.ca).",
        ],
      },
    },
    {
      id: "age",
      heading: { fr: "Âge minimum", en: "Minimum age" },
      body: {
        fr: [
          "Life Hub est réservé aux personnes de 14 ans et plus. Le suivi des dettes, la connexion d'une boîte courriel et tout forfait payant sont réservés aux 18 ans et plus. Nous demandons une simple attestation, sans recueillir ta date de naissance.",
        ],
        en: [
          "Life Hub is for people aged 14 and over. Debt tracking, connecting a mailbox and any paid plan are for people aged 18 and over. We ask for a simple attestation and do not collect your date of birth.",
        ],
      },
    },
    {
      id: "modifications",
      heading: { fr: "Modifications à cette politique", en: "Changes to this policy" },
      body: {
        fr: [
          "Avant tout changement important, nous t'avisons dans l'application et par courriel. Si un changement touche un usage pour lequel tu as donné ton consentement, nous te le redemandons. La date et la version en haut de la page indiquent la version en vigueur.",
        ],
        en: [
          "Before any significant change, we tell you in the app and by email. If a change affects a use you consented to, we ask for your consent again. The date and version at the top of the page show the version in force.",
        ],
      },
    },
  ],
};
