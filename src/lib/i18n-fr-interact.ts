/**
 * French strings for the interaction layer — pull-to-refresh, the "+" sheet,
 * the budget's at-a-glance cards and the notification buttons. In their own
 * file and spread into FR (like i18n-fr-viz.ts), so work here and work on the
 * main dictionary never edit the same lines.
 */
export const FR_INTERACT: Record<string, string> = {
  // ---- refresh ---------------------------------------------------------------
  "Refreshing…": "Actualisation…",

  // ---- composer sheet --------------------------------------------------------
  "Add something": "Ajouter quelque chose",
  "View": "Voir",

  // ---- budget at a glance ----------------------------------------------------
  "Left this month": "Reste ce mois-ci",
  "Left for {month}": "Reste pour {month}",
  "{spent} spent of {total} budgeted": "{spent} dépensés sur {total} prévus",
  "{name} owes you {amount}": "{name} te doit {amount}",
  "You owe {name} {amount}": "Tu dois {amount} à {name}",
  "You're owed {amount}": "On te doit {amount}",
  "You owe {amount}": "Tu dois {amount}",
  "Settle": "Régler",

  // ---- notification buttons --------------------------------------------------
  // Short on purpose: Android truncates a button label after a few characters.
  "Done ✓": "Fait ✓",
};
