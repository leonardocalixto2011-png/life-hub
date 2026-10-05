/**
 * French strings for plans and billing (/billing, /admin/finance, plan limits).
 * Merged into FR by i18n-fr.ts; same rules (tu, Québec usage, placeholders
 * identical). "Forfait" for plan, "abonnement" for the paid subscription.
 */
export const FR_BILLING: Record<string, string> = {
  // ---- /billing ---------------------------------------------------------------
  "Plan & billing": "Forfait et paiement",
  "I am 18 or older.": "J'ai 18 ans ou plus.",
  "I accept the plan terms": "J'accepte les conditions du forfait",
  "price, renewal, cancellation": "prix, renouvellement, annulation",
  "Beta: every Plus feature is included for everyone, free.":
    "Bêta : toutes les fonctions Plus sont incluses pour tout le monde, gratuitement.",
  "Free plan.": "Forfait gratuit.",
  "Plus, offered until {date}.": "Plus, offert jusqu'au {date}.",
  "Plus, offered.": "Plus, offert.",
  "Plus trial until {date}. Nothing is charged when it ends.":
    "Essai Plus jusqu'au {date}. Rien n'est facturé à la fin.",
  "Plus. Your last payment didn't go through: update your card below.":
    "Plus. Ton dernier paiement n'est pas passé : mets ta carte à jour ci-dessous.",
  "Plus until {date}, then the free plan. It won't renew.":
    "Plus jusqu'au {date}, puis le forfait gratuit. Il ne se renouvellera pas.",
  "Plus, renews on {date} at {price}.": "Plus, renouvelé le {date} à {price}.",
  "Plus.": "Plus.",
  "Thank you! Plus is being switched on; it can take a few seconds.":
    "Merci! Plus s'active; ça peut prendre quelques secondes.",
  "Thank you! Your credits will appear in a few seconds.": "Merci! Tes crédits apparaîtront dans quelques secondes.",
  "Your Plus covers everyone in: {hubs}.": "Ton Plus couvre tout le monde dans : {hubs}.",
  "What each plan includes": "Ce que comprend chaque forfait",
  "Free plan": "Forfait gratuit",
  "Tasks, calendar, budget, debts and trips, unlimited": "Tâches, calendrier, budget, dettes et voyages, sans limite",
  "{n} hub you own, up to {m} members": "{n} hub à toi, jusqu'à {m} membres",
  "AI features paid from your own Claude credit ({amount} to start)": "Fonctions IA payées avec ton propre crédit Claude ({amount} pour commencer)",
  "{month} a month or {year} a year": "{month} par mois ou {year} par année",
  "Covers up to {n} hubs you own, {m} members each": "Couvre jusqu'à {n} hubs à toi, {m} membres chacun",
  "Connected mailboxes with automatic sorting": "Boîtes courriel connectées, avec tri automatique",
  "{amount} of Claude credit each month": "{amount} de crédit Claude chaque mois",
  "Try Plus free for {n} days": "Essaie Plus gratuitement pendant {n} jours",
  "No card asked. When the trial ends you're back on the free plan, unless you subscribe. We email you 3 days before.":
    "Aucune carte demandée. À la fin de l'essai, tu reviens au forfait gratuit, sauf si tu t'abonnes. On t'écrit 3 jours avant.",
  "Start the free trial": "Commencer l'essai gratuit",
  "Subscribe to Plus": "S'abonner à Plus",
  "Sold by {seller}, in Canadian dollars. {month} a month or {year} a year, plus applicable taxes. Renews automatically until you cancel; cancel any time here in one tap, and Plus runs to the end of the period already paid. Payment by card through Stripe.":
    "Vendu par {seller}, en dollars canadiens. {month} par mois ou {year} par année, plus les taxes applicables. Renouvelé automatiquement jusqu'à ce que tu annules; tu annules ici en tout temps, en un geste, et Plus reste actif jusqu'à la fin de la période déjà payée. Paiement par carte, par Stripe.",
  "{price} a year (two months free)": "{price} par année (deux mois gratuits)",
  "{price} a month": "{price} par mois",
  "Continue to payment": "Continuer vers le paiement",
  "Your subscription": "Ton abonnement",
  "Keep Plus": "Garder Plus",
  "End the trial": "Mettre fin à l'essai",
  "Card and invoices": "Carte et factures",
  "For every AI feature: the assistant, quick add, photos and mail sorting. Each person pays for their own use, on any plan.":
    "Pour toutes les fonctions IA : l'assistant, l'ajout rapide, les photos et le tri du courriel. Chaque personne paie sa propre utilisation, peu importe le forfait.",
  "Buy credit": "Acheter du crédit",
  "Your Claude credit": "Ton crédit Claude",
  "Paid by card through Stripe, in Canadian dollars. Credit never expires and never reloads on its own; whatever is left is refunded on request if you close your account.":
    "Payé par carte avec Stripe, en dollars canadiens. Le crédit n'expire jamais et ne se recharge jamais tout seul; ce qui reste t'est remboursé sur demande si tu fermes ton compte.",
  "Finance dashboard": "Tableau de bord financier",

  // ---- billing actions --------------------------------------------------------
  "Paid plans aren't open yet. Everything is included during the beta.":
    "Les forfaits payants ne sont pas encore ouverts. Tout est inclus pendant la bêta.",
  "Payments aren't set up yet. Try again later.": "Les paiements ne sont pas encore en place. Réessaie plus tard.",
  "Confirm you are 18 or older and accept the plan terms to continue.":
    "Confirme que tu as 18 ans ou plus et accepte les conditions du forfait pour continuer.",
  "You already have Plus.": "Tu as déjà Plus.",
  "You've already used your free trial.": "Tu as déjà utilisé ton essai gratuit.",
  "Your 14-day Plus trial has started.": "Ton essai Plus de 14 jours est commencé.",
  "AI credits aren't on sale yet.": "Les crédits IA ne sont pas encore en vente.",
  "Pick one of the packs.": "Choisis un des forfaits de crédits.",
  "You don't have a plan to cancel.": "Tu n'as pas de forfait à annuler.",
  "Cancelled. Nothing more will be charged.": "Annulé. Plus rien ne sera facturé.",
  "There's nothing to resume.": "Il n'y a rien à reprendre.",
  "Plus will renew as before.": "Plus se renouvellera comme avant.",
  "No payment on file yet.": "Aucun paiement enregistré pour l'instant.",
  "The payment service didn't answer as expected. Try again in a moment.":
    "Le service de paiement n'a pas répondu comme prévu. Réessaie dans un instant.",
  "Can't stop your subscription right now. Try again later.":
    "Impossible d'arrêter ton abonnement pour l'instant. Réessaie plus tard.",

  // ---- plan limits ------------------------------------------------------------
  "Connecting a mailbox is part of Plus. Start the free trial or subscribe under Plan & billing.":
    "Connecter une boîte courriel fait partie de Plus. Commence l'essai gratuit ou abonne-toi dans Forfait et paiement.",
  "The free plan includes one hub you own. Plus covers up to three, see Plan & billing.":
    "Le forfait gratuit comprend un hub à toi. Plus en couvre jusqu'à trois, voir Forfait et paiement.",
  "This hub has reached the free plan's 6 members. The owner's Plus plan allows 10.":
    "Ce hub a atteint les 6 membres du forfait gratuit. Le forfait Plus du propriétaire en permet 10.",
  "This hub has reached its 10 members.": "Ce hub a atteint ses 10 membres.",

  // ---- /admin/finance ---------------------------------------------------------
  "Finance": "Finances",
  "Billing is off (beta): nobody is charged and everyone has Plus.":
    "La facturation est désactivée (bêta) : personne ne paie et tout le monde a Plus.",
  "Billing is on.": "La facturation est activée.",
  "Billing is on, but Stripe isn't configured yet.": "La facturation est activée, mais Stripe n'est pas encore configuré.",
  "monthly recurring": "revenu mensuel récurrent",
  "yearly run rate": "rythme annuel",
  "net, last 30 days": "net, 30 derniers jours",
  "paying / break-even": "payants / seuil de rentabilité",
  "Households": "Foyers",
  "Paying": "Payants",
  "of which yearly": "dont à l'année",
  "On trial": "En essai",
  "Offered (beta, founders)": "Offerts (bêta, fondateurs)",
  "Payment failing": "Paiement en échec",
  "Cancelled, running to period end": "Annulés, actifs jusqu'à la fin de la période",
  "Last 30 days": "30 derniers jours",
  "Plus subscriptions": "Abonnements Plus",
  "Claude credit sold": "Crédit Claude vendu",
  "Refunds": "Remboursements",
  "Stripe fees (est.)": "Frais Stripe (est.)",
  "Claude API": "API Claude",
  "Servers and services": "Serveurs et services",
  "Net": "Net",
  "Claude: {calls} requests at Anthropic's price, from the credit ledger; people were charged {used} for them. Credit still held in wallets: {held}. Servers: {fixed} a month, set with FIN_FIXED_MONTHLY_CAD from the real invoices.":
    "Claude : {calls} requêtes au prix d'Anthropic, selon le registre des crédits; les gens ont payé {used} pour celles-ci. Crédit encore dans les portefeuilles : {held}. Serveurs : {fixed} par mois, à ajuster avec FIN_FIXED_MONTHLY_CAD selon les vraies factures.",
  "Latest movements": "Derniers mouvements",
  "Plus payment": "Paiement Plus",
  "Refund": "Remboursement",
  "Failed payment": "Paiement refusé",
  "Offer Plus to someone": "Offrir Plus à quelqu'un",
  "Until (empty = no end)": "Jusqu'au (vide = sans fin)",
  "Note": "Note",
  "founder, friend, support…": "fondateur, ami, soutien…",
  "Offer Plus": "Offrir Plus",
  "Thank the beta households": "Remercier les foyers de la bêta",
  "Gives Plus until the date to everyone who owns a hub today. Do it before turning billing on. People who already pay are left alone.":
    "Donne Plus jusqu'à la date à toutes les personnes qui possèdent un hub aujourd'hui. À faire avant d'activer la facturation. Les personnes qui paient déjà ne sont pas touchées.",
  "Until": "Jusqu'au",
  "Offer Plus to every hub owner": "Offrir Plus à tous les propriétaires de hub",
  "Only the app admin can do this.": "Seul l'administrateur de l'app peut faire ça.",
  "Pick a valid date.": "Choisis une date valide.",
  "Enter a valid email address.": "Entre une adresse courriel valide.",
  "No account uses that address.": "Aucun compte n'utilise cette adresse.",
  "That person already pays for Plus.": "Cette personne paie déjà Plus.",
  "Plus offered.": "Plus offert.",
  "Plus offered to {n} people.": "Plus offert à {n} personnes.",
};
