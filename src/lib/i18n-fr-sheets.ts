/**
 * French strings for the edit sheet and the search sheet. In their own file
 * and spread into FR (like i18n-fr-interact.ts), so work here and work on the
 * main dictionary never edit the same lines.
 *
 * Only what is new: "Edit", "Tasks", "Events", "Take a photo"… already live
 * in the main dictionary and are reused as they are.
 */
export const FR_SHEETS: Record<string, string> = {
  // ---- search sheet ----------------------------------------------------------
  "Search": "Rechercher",
  "Search everything…": "Rechercher partout…",
  "Clear": "Effacer",
  "Quick actions": "Actions rapides",
  "Add a task": "Ajouter une tâche",
  "Add an expense": "Ajouter une dépense",
  // Dropped into the composer as the start of a sentence: "Dépense : 45 épicerie".
  "Expense: ": "Dépense : ",
  "Recent": "Récents",
  "See all": "Voir tout",
  "Trip plans": "Plans de voyage",
  "Nothing found for “{q}”": "Rien trouvé pour « {q} »",
  "Too many searches — wait a moment.": "Trop de recherches — attends un instant.",
  // A cancelled subscription, in a result's detail line.
  "cancelled": "annulé",
};
