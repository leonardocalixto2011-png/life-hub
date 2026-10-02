/**
 * French strings for the social layer — the activity feed ("who did what"),
 * its 🙏 reaction, and splitting a receipt between members. In their own file
 * and spread into FR (like i18n-fr-interact.ts), so work here and work on the
 * main dictionary never edit the same lines.
 *
 * Québec French, tu. Guillemets « » around titles, as everywhere else.
 */
export const FR_SOCIAL: Record<string, string> = {
  // ---- activity feed: one sentence per verb (lib/activity.ts) ---------------
  "{actor} added “{title}”": "{actor} a ajouté « {title} »",
  "{actor} finished “{title}”": "{actor} a terminé « {title} »",
  "{actor} gave “{title}” to {target}": "{actor} a confié « {title} » à {target}",
  "{actor} planned “{title}”": "{actor} a planifié « {title} »",
  "{actor} added the deadline “{title}”": "{actor} a ajouté l'échéance « {title} »",
  "{actor} wrapped up the deadline “{title}”": "{actor} a bouclé l'échéance « {title} »",
  "{actor} logged {amount} · {title}": "{actor} a noté {amount} · {title}",
  "{actor} settled up {amount}": "{actor} a réglé {amount}",
  "{actor} started the trip “{title}”": "{actor} a créé le voyage « {title} »",
  "{actor} checked off “{title}”": "{actor} a coché « {title} »",
  "{actor} joined the hub": "{actor} a rejoint le hub",
  "someone": "quelqu'un",

  // ---- /activity -------------------------------------------------------------
  "Who did what in {hub} — the last 90 days.": "Qui a fait quoi dans {hub} — les 90 derniers jours.",
  "Nothing further back.": "Rien de plus ancien.",
  "What you add and finish shows up here. Invite someone to this hub and you'll see what they do too.":
    "Ce que tu ajoutes et termines apparaît ici. Invite quelqu'un dans ce hub et tu verras aussi ce qu'il fait.",
  "Nothing yet. What you and the others add or finish shows up here.":
    "Rien pour l'instant. Ce que toi et les autres ajoutez ou terminez apparaît ici.",
  "Pages": "Pages",
  "Newer": "Plus récent",
  "Older": "Plus ancien",

  // ---- 🙏 --------------------------------------------------------------------
  "Say thanks": "Dire merci",
  "Thanks sent": "Merci envoyé",
  "Thanks received": "Mercis reçus",
  "Say thanks to {name}": "Dire merci à {name}",
  "You said thanks to {name}": "Tu as dit merci à {name}",
  "That one is yours.": "Celle-là, c'est la tienne.",
  "That's plenty of thanks for today — more tomorrow.": "Ça fait beaucoup de mercis pour aujourd'hui — la suite demain.",
  // The push itself, in the recipient's language.
  "Thanks 🙏": "Merci 🙏",
  "{actor} says thanks for “{title}”": "{actor} te dit merci pour « {title} »",
  "{actor} says thanks": "{actor} te dit merci",

  // ---- receipt → split (DraftCard) -------------------------------------------
  // ("Paid by", "Not shared", "Mine", "Shared" are already in the main dictionary.)
  "Share": "Partager",
  "The other pays it all": "L'autre paie tout",
  "The others pay it all": "Les autres paient tout",
  "Itemise": "Détailler",
  "Hide the lines": "Masquer les lignes",
  "Who had what? Tax and tip follow the lines.": "Qui a pris quoi ? Les taxes et le pourboire suivent les lignes.",
  "Item": "Article",
  "Theirs": "À l'autre",
  "The others'": "Aux autres",
  "All shared": "Tout partagé",
  "From the lines: {pct} %": "Selon les lignes : {pct} %",
  "{name} keeps {amount}": "Part de {name} : {amount}",
  "You keep {amount}": "Ta part : {amount}",
  "{name} owes {amount}": "{name} doit {amount}",
  "You owe {amount} of it": "Tu en dois {amount}",
  "The others owe {amount}": "Les autres doivent {amount}",
  "The lines add up to {items}; the rest of the {total} total (tax, tip) is spread the same way.":
    "Les lignes font {items} ; le reste du total de {total} (taxes, pourboire) est réparti de la même façon.",
  "Add the amount to see the split.": "Ajoute le montant pour voir le partage.",

  // ---- after saving a split expense ------------------------------------------
  "{name} now owes you {amount}": "{name} te doit maintenant {amount}",
  "You now owe {name} {amount}": "Tu dois maintenant {amount} à {name}",
  "You and {name} are now even": "Toi et {name} êtes maintenant quittes",
  "You're now even with everyone": "Tu es maintenant quitte avec tout le monde",
  "You're now owed {amount}": "On te doit maintenant {amount}",
  "You now owe {amount}": "Tu dois maintenant {amount}",
};
