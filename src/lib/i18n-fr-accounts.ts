/**
 * French strings for the account system: app invitations, usernames, profile
 * photo, address changes, join requests and co-owners. Merged into FR by
 * i18n-fr.ts; same rules (tu, Québec usage, placeholders identical).
 */
export const FR_ACCOUNTS: Record<string, string> = {
  // ---- username --------------------------------------------------------------
  "Username": "Nom d'utilisateur",
  "How people find you to invite you to a hub. Letters, digits, dots and underscores.":
    "C'est avec lui qu'on t'invite dans un hub. Lettres, chiffres, points et traits de soulignement.",
  "A username is 3 to 24 characters.": "Un nom d'utilisateur a de 3 à 24 caractères.",
  "Use letters, digits, dots or underscores — starting and ending with a letter or digit.":
    "Utilise des lettres, des chiffres, des points ou des traits de soulignement, avec une lettre ou un chiffre au début et à la fin.",
  "That username is reserved. Pick another one.": "Ce nom d'utilisateur est réservé. Choisis-en un autre.",
  "That username is taken. Try another one.": "Ce nom d'utilisateur est déjà pris. Essaie-en un autre.",
  "Too many changes. Try again in an hour.": "Trop de changements. Réessaie dans une heure.",
  "Your username is now @{username}.": "Ton nom d'utilisateur est maintenant @{username}.",
  "Username removed.": "Nom d'utilisateur retiré.",
  "You don't have one yet — the suggestion above isn't saved until you press Save.":
    "Tu n'en as pas encore. La suggestion ci-dessus n'est enregistrée que si tu touches Enregistrer.",

  // ---- photo -----------------------------------------------------------------
  "Change photo": "Changer la photo",
  "Shown to the people in your hubs, next to your name.": "Visible par les gens de tes hubs, à côté de ton nom.",

  // ---- sign-in address -------------------------------------------------------
  "Sign-in address": "Adresse de connexion",
  "Your sign-in links go to {email}. To change it, enter the new address: we send it a confirmation link, and nothing changes until you open it.":
    "Tes liens de connexion vont à {email}. Pour la changer, entre la nouvelle adresse : on lui envoie un lien de confirmation, et rien ne change tant que tu ne l'as pas ouvert.",
  "Waiting for confirmation from {email}.": "En attente de la confirmation de {email}.",
  "New address": "Nouvelle adresse",
  "Send the confirmation link": "Envoyer le lien de confirmation",
  "That's already your address.": "C'est déjà ton adresse.",
  "Too many tries today. Try again tomorrow.": "Trop d'essais aujourd'hui. Réessaie demain.",
  "If that address can be used, a confirmation link is on its way to it. It works for 1 hour.":
    "Si cette adresse peut être utilisée, un lien de confirmation s'en va vers elle. Il est valide 1 heure.",
  "Confirm your new address": "Confirme ta nouvelle adresse",
  "Once confirmed, sign-in links go to the new address only, and the old one gets a notice.":
    "Une fois confirmée, les liens de connexion iront seulement à la nouvelle adresse, et l'ancienne recevra un avis.",
  "Confirm": "Confirmer",
  "Done: you now sign in with {email}.": "C'est fait : tu te connectes maintenant avec {email}.",
  "That confirmation link doesn't work. Ask for a new one.": "Ce lien de confirmation ne fonctionne pas. Demandes-en un nouveau.",
  "That address now belongs to another account.": "Cette adresse appartient maintenant à un autre compte.",

  // ---- inviting to the app ---------------------------------------------------
  "Invite to Life Hub": "Inviter sur Life Hub",
  "Invite someone": "Inviter quelqu'un",
  "{name} invited you. Bring someone in the same way: they create their own account.":
    "{name} t'a invité. Fais entrer quelqu'un de la même façon : la personne crée son propre compte.",
  "Bring someone in: they create their own account, then join your hubs if they want.":
    "Fais entrer quelqu'un : la personne crée son propre compte, puis rejoint tes hubs si elle le veut.",
  "No limit on your invitations.": "Aucune limite sur tes invitations.",
  "{n} of {limit} invitations left this month.": "Il te reste {n} invitations sur {limit} ce mois-ci.",
  "The person creates their own account — name, username, language. Joining one of your hubs stays a separate yes: invite them from its Members page, or give them its code.":
    "La personne crée son propre compte : nom, nom d'utilisateur, langue. Rejoindre un de tes hubs reste un autre oui : invite-la depuis la page Membres du hub, ou donne-lui son code.",
  "By email": "Par courriel",
  "Their email address": "Son adresse courriel",
  "Send the invitation": "Envoyer l'invitation",
  "By link": "Par lien",
  "For a text message or Messenger. Whoever opens it first enters their address, and the account is tied to it.":
    "Pour un texto ou Messenger. La première personne qui l'ouvre entre son adresse, et le compte y est lié.",
  "Invitation link": "Lien d'invitation",
  "Create an invitation link": "Créer un lien d'invitation",
  "Creating…": "Création…",
  "Send it to one person. It works once, for 14 days, and won't be shown again here.":
    "Envoie-le à une seule personne. Il fonctionne une fois, pendant 14 jours, et ne sera plus affiché ici.",
  "Sent": "Envoyées",
  "Joined Life Hub": "A rejoint Life Hub",
  "Cancelled": "Annulée",
  "Expired": "Expirée",
  "Waiting · until {date}": "En attente · jusqu'au {date}",
  "That person already has an account. Invite them to a hub from its Members page.":
    "Cette personne a déjà un compte. Invite-la dans un hub depuis sa page Membres.",
  "That address was invited several times today. Try again tomorrow.":
    "Cette adresse a été invitée plusieurs fois aujourd'hui. Réessaie demain.",
  "You've used all your invitations for this month.": "Tu as utilisé toutes tes invitations ce mois-ci.",
  "Invitation sent to {who}.": "Invitation envoyée à {who}.",
  "Invitation sent to {who} again.": "Invitation renvoyée à {who}.",
  "That's you.": "C'est toi.",

  // ---- the invitation page ---------------------------------------------------
  "{name} invites you to Life Hub.": "{name} t'invite sur Life Hub.",
  "You're invited to Life Hub.": "Tu es invité sur Life Hub.",
  "This invitation doesn't work any more.": "Cette invitation ne fonctionne plus.",
  "It was used, cancelled or has expired. Ask the person who sent it for a new one.":
    "Elle a été utilisée, annulée ou elle a expiré. Demandes-en une nouvelle à la personne qui te l'a envoyée.",
  "Tasks, bills, budget and calendar — yours, and shared in “{hub}” if you say yes.":
    "Tâches, factures, budget et calendrier : les tiens, et partagés dans « {hub} » si tu dis oui.",
  "Tasks, bills, budget and calendar — alone or with the people you choose.":
    "Tâches, factures, budget et calendrier : seul ou avec les gens que tu choisis.",
  "You already have an account, so this invitation isn't needed.":
    "Tu as déjà un compte, alors cette invitation n'est pas nécessaire.",
  "I already have an account": "J'ai déjà un compte",
  "Your email address": "Ton adresse courriel",
  "This invitation was sent to {email}.": "Cette invitation a été envoyée à {email}.",
  "Create my account": "Créer mon compte",
  "We email you a link instead of asking for a password. Your address stays private: other people see your name and username.":
    "On t'envoie un lien par courriel au lieu d'un mot de passe. Ton adresse reste privée : les autres voient ton nom et ton nom d'utilisateur.",
  "Open the link we just sent: it creates your account and signs you in. No password to remember.":
    "Ouvre le lien qu'on vient d'envoyer : il crée ton compte et te connecte. Aucun mot de passe à retenir.",
  "Nothing after a few minutes? Check your junk folder, or enter your address again.":
    "Rien après quelques minutes ? Regarde dans tes courriels indésirables, ou entre ton adresse de nouveau.",
  "Too many tries. Wait a little and try again.": "Trop d'essais. Attends un peu et réessaie.",
  "This invitation was sent to another address. Use that one.":
    "Cette invitation a été envoyée à une autre adresse. Utilise celle-là.",
  "If that address has an account or an invitation, a sign-in link is on its way. It expires in 24 hours.":
    "Si cette adresse a un compte ou une invitation, un lien de connexion s'en vient. Il expire dans 24 heures.",
  "Invite-only for now: someone who uses Life Hub can send you an invitation.":
    "Sur invitation pour l'instant : une personne qui utilise Life Hub peut t'en envoyer une.",

  // ---- members page: inviting, roles, requests --------------------------------
  "Invite by username": "Inviter par nom d'utilisateur",
  "For someone already on Life Hub — no email address needed.":
    "Pour quelqu'un qui est déjà sur Life Hub. Pas besoin d'adresse courriel.",
  "Type a username.": "Écris un nom d'utilisateur.",
  "Nobody has that username. Check the spelling.": "Personne n'a ce nom d'utilisateur. Vérifie l'orthographe.",
  "Someone new gets an invitation to create their account first; joining stays their choice.":
    "Une nouvelle personne reçoit d'abord une invitation à créer son compte ; rejoindre le hub reste son choix.",
  "{who} is already in this hub.": "{who} est déjà dans ce hub.",
  "{who} had asked to join — they're in now.": "{who} avait demandé à rejoindre : c'est fait.",
  "invited · no account yet": "invité · pas encore de compte",
  "cancel": "annuler",
  "owner": "propriétaire",
  "Make {name} an owner": "Faire de {name} un propriétaire",
  "Make someone else an owner before you leave.": "Nomme un autre propriétaire avant de partir.",
  "An owner can't be removed. They can leave on their own.":
    "On ne peut pas retirer un propriétaire. Il peut partir de lui-même.",
  "Use \"Leave hub\" to remove yourself.": "Utilise « Quitter ce hub » pour te retirer.",
  "Asking to join": "Demandes pour rejoindre",
  "Let in": "Accepter",
  "Share a code or a link: people who have it can ask to join, and you let them in or not. Nobody can find this hub without it.":
    "Partage un code ou un lien : les gens qui l'ont peuvent demander à rejoindre, et tu acceptes ou non. Personne ne peut trouver ce hub sans lui.",
  "Hub code": "Code du hub",
  "Code to ask to join": "Code pour demander à rejoindre",
  "Link to ask to join": "Lien pour demander à rejoindre",
  "New code": "Nouveau code",
  "Turn off": "Désactiver",
  "A new code stops the old one from working.": "Un nouveau code désactive l'ancien.",
  "Create a code": "Créer un code",

  // ---- pushes ----------------------------------------------------------------
  "Invited to \"{hub}\"": "Invitation dans « {hub} »",
  "{name} invited you. Tap to answer.": "{name} t'invite. Touche pour répondre.",
  "You're in \"{hub}\"": "Tu es dans « {hub} »",
  "Your request was approved. Tap to open it.": "Ta demande a été acceptée. Touche pour l'ouvrir.",
  "Request to join \"{hub}\"": "Demande pour rejoindre « {hub} »",
  "{name} is asking to join. Tap to answer.": "{name} demande à rejoindre. Touche pour répondre.",
  "Someone is asking to join. Tap to answer.": "Quelqu'un demande à rejoindre. Touche pour répondre.",

  // ---- asking to join ----------------------------------------------------------
  "Have a hub code?": "Tu as un code de hub ?",
  "Open": "Ouvrir",
  "Someone in the hub can give you its code. The owner approves your request.":
    "Quelqu'un du hub peut te donner son code. Le propriétaire approuve ta demande.",
  "A hub code has 8 letters and digits, like ABCD-2345.": "Un code de hub a 8 lettres et chiffres, comme ABCD-2345.",
  "That code doesn't work.": "Ce code ne fonctionne pas.",
  "That code doesn't work any more. Ask for a new one.": "Ce code ne fonctionne plus. Demandes-en un nouveau.",
  "Too many tries.": "Trop d'essais.",
  "It may have been changed or turned off. Ask someone in the hub for the current one.":
    "Il a peut-être été changé ou désactivé. Demande le code actuel à quelqu'un du hub.",
  "Wait an hour, then try the code again.": "Attends une heure, puis réessaie le code.",
  "Code {code}": "Code {code}",
  "You're already in {name}.": "Tu es déjà dans {name}.",
  "Ask to join {name}?": "Demander à rejoindre {name} ?",
  "An owner sees your name and username and decides. Joining shares the hub's bills, deadlines and calendar with you; your debts stay private.":
    "Un propriétaire voit ton nom et ton nom d'utilisateur, puis décide. Rejoindre te donne accès aux factures, aux échéances et au calendrier du hub ; tes dettes restent privées.",
  "A word for the owner (optional)": "Un mot pour le propriétaire (facultatif)",
  "e.g. It's Marie, Chantelle's sister": "ex. C'est Marie, la sœur de Chantelle",
  "Ask to join": "Demander à rejoindre",
  "Tip: pick a username under Your account, so the owner can tell who you are.":
    "Astuce : choisis un nom d'utilisateur dans Ton compte, pour que le propriétaire sache qui tu es.",
  "Request sent.": "Demande envoyée.",
  "Request sent. You'll get a notification when you're in.":
    "Demande envoyée. Tu recevras une notification quand tu seras accepté.",
  "An owner of {name} will answer. You'll get a notification when you're in.":
    "Un propriétaire de {name} va répondre. Tu recevras une notification quand tu seras accepté.",
  "Cancel my request": "Annuler ma demande",
  "You've sent a lot of requests today. Try again tomorrow.": "Tu as envoyé beaucoup de demandes aujourd'hui. Réessaie demain.",
  "Keep the message under 140 characters.": "Garde le message sous 140 caractères.",
  "Leave your email address out of the message.": "Ne mets pas ton adresse courriel dans le message.",
  "Waiting for an answer.": "En attente d'une réponse.",
  "Your requests": "Tes demandes",
  "Waiting for an owner to answer": "En attente de la réponse d'un propriétaire",
  "Or create your own hub": "Ou crée ton propre hub",
  "Your request to join is waiting for an owner. You can make your own hub meanwhile, or skip.":
    "Ta demande attend la réponse d'un propriétaire. Tu peux créer ton propre hub en attendant, ou passer.",

  // ---- small shared bits -------------------------------------------------------
  "Copy": "Copier",
  "Copied": "Copié",
  "Sent again": "Renvoyé",
  "Sent to {email}.": "Envoyé à {email}.",
  "We sent a link to {email}. Opening it creates your account and signs you in.":
    "On a envoyé un lien à {email}. En l'ouvrant, tu crées ton compte et tu te connectes.",
  "Nothing after a few minutes? Look in junk or promotions for “Life Hub”, check the address above, then send it again.":
    "Rien après quelques minutes ? Cherche « Life Hub » dans les indésirables ou les promotions, vérifie l'adresse ci-dessus, puis renvoie le lien.",
  "Send the link again": "Renvoyer le lien",
  "Use another address": "Utiliser une autre adresse",
};
