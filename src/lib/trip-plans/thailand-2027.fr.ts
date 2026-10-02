import type { PlanFrench } from "./localise";

/**
 * The Thailand plan in Québec French, kept beside the English one rather than
 * inside it so the English file stays readable. Keys are the English text:
 * `KIND|title` for items, the name for stops, the title for reminders.
 *
 * The English title stays the plan's identity. Importing in French writes
 * these titles onto the trip, and a later import (in either language) matches
 * a row on *either* title, so nothing is added twice. If an item is renamed in
 * English, move its key here too — `checkFrench` in localise.ts (run by
 * scripts/check-trip-plan.ts) fails on a key that no longer matches anything.
 */
export const thailand2027Fr: PlanFrench = {
  label: "Thaïlande, une semaine, mars 2027",
  trip: {
    title: "Thaïlande, une semaine",
    destination: "Krabi · Ao Nang",
    notes:
      "Sept nuits à Ao Nang, un seul billet jusqu'à Krabi, aller-retour par Bangkok. Version économique pour deux : hôtel avec piscine, surtout de la bouffe de rue, un petit coussin. Une journée en solo à Bangkok reste possible.",
  },
  stops: {
    "Ao Nang, Krabi": "Ao Nang, Krabi",
  },
  items: {
    // ---- jour par jour -------------------------------------------------------
    "ACTIVITY|Evening flight YUL → Krabi, connecting in Bangkok (~26–30h)": {
      title: "Vol de soir YUL → Krabi, avec correspondance à Bangkok (~26–30 h)",
      note: "Un seul billet jusqu'au bout : d'habitude Doha, Istanbul, Tokyo ou Taipei, puis Bangkok → Krabi. Les bagages suivent tout seuls, et une correspondance en retard, c'est le problème de la compagnie.",
    },
    "ACTIVITY|Submit the TDAC arrival cards before boarding": {
      title: "Remplir les cartes d'arrivée TDAC avant l'embarquement",
    },
    "ACTIVITY|Land in Krabi, car to the Ao Nang hotel (~40 min)": {
      title: "Arrivée à Krabi, voiture jusqu'à l'hôtel d'Ao Nang (~40 min)",
      note: "Comptoir de taxis de l'aéroport ou voiture réservée d'avance, environ 20–25 $.",
    },
    "ACTIVITY|Easy walk along Ao Nang beach, early night": {
      title: "Petite marche sur la plage d'Ao Nang, dodo de bonne heure",
    },
    "ACTIVITY|Slow first day: beach, pool, nap": {
      title: "Première journée tranquille : plage, piscine, sieste",
    },
    "ACTIVITY|Thai massage, 1 hour (~$12 each)": {
      title: "Massage thaï, 1 heure (~12 $ chacun)",
    },
    "ACTIVITY|Sunset on Ao Nang beach, street food at the night market": {
      title: "Coucher de soleil sur la plage d'Ao Nang, bouffe de rue au marché de nuit",
    },
    "ACTIVITY|Tiger Cave Temple, early (1,260 steps; shoulders + knees covered)": {
      title: "Temple de la grotte du Tigre, tôt (1 260 marches; épaules et genoux couverts)",
      note: "Y aller à 7 h, avant la chaleur. La vue sur les falaises vaut chaque marche. Environ 30 min en voiture d'Ao Nang.",
    },
    "ACTIVITY|Krabi Town walking street night market (Sunday)": {
      title: "Marché de nuit de la rue piétonne de Krabi Town (dimanche)",
      note: "Du vendredi au dimanche soir seulement. Kiosques de bouffe pas chers et musique live.",
    },
    "ACTIVITY|Longtail boat from Ao Nang to Railay": {
      title: "Bateau longue-queue d'Ao Nang à Railay",
      note: "15 minutes à partir du quai de la plage d'Ao Nang, environ 4 $ chacun. Aucune route ne se rend à Railay, et ça fait partie du charme.",
    },
    "ACTIVITY|Sunset on Railay West beach": {
      title: "Coucher de soleil sur la plage de Railay Ouest",
      note: "Vérifier l'heure du dernier bateau pour Ao Nang (d'habitude vers le coucher du soleil), ou en réserver un privé.",
    },
    "ACTIVITY|Four-islands boat tour: Phra Nang cave, Chicken Island, Tup sandbar": {
      title: "Tour des quatre îles en bateau : grotte de Phra Nang, île Chicken, banc de sable de Tup",
      note: "Le banc de sable de Tup se traverse à pied à marée basse. Apporter de la crème solaire sans danger pour les coraux et des souliers d'eau.",
    },
    "ACTIVITY|Railay viewpoint trail, early morning": {
      title: "Sentier du belvédère de Railay, tôt le matin",
      note: "Prendre le premier bateau. Court mais à pic, avec des cordes et de la boue rouge : souliers fermés, pas de gougounes.",
    },
    "ACTIVITY|Kayak the Ao Thalane mangroves, or a beginner climbing class": {
      title: "Kayak dans la mangrove d'Ao Thalane, ou cours d'escalade pour débutants",
    },
    "ACTIVITY|Couples massage": {
      title: "Massage en couple",
    },
    "ACTIVITY|Free beach day (optional Phi Phi day trip, ~$100 each)": {
      title: "Journée libre à la plage (excursion à Phi Phi en option, ~100 $ chacun)",
    },
    "ACTIVITY|Thai cooking class": {
      title: "Cours de cuisine thaïe",
      note: "En soirée, et on mange ce qu'on prépare.",
    },
    "ACTIVITY|Last swim, check out by noon": {
      title: "Dernière baignade, départ de l'hôtel avant midi",
    },
    "ACTIVITY|Afternoon flight Krabi → Bangkok, connect to the flight home": {
      title: "Vol d'après-midi Krabi → Bangkok, correspondance pour le vol de retour",
      note: "Même billet, donc la correspondance est protégée. La plupart des vols de retour partent de Bangkok entre 23 h et 2 h.",
    },
    "ACTIVITY|Land in Montréal": {
      title: "Arrivée à Montréal",
    },

    // ---- à réserver, et quand ------------------------------------------------
    "BOOK|Flights YUL → Krabi and back, one ticket via Bangkok (alert at $1,300 each)": {
      title: "Vols YUL → Krabi aller-retour, un seul billet par Bangkok (alerte à 1 300 $ chacun)",
      note: "Chercher un simple aller-retour YUL ⇄ KBV, départ jeudi 11 mars, retour vendredi 19 mars. Montréal–Bangkok tourne autour de 1 550 $ chacun, et le segment vers Krabi ajoute d'habitude 50–100 $ sur le même billet; prévu à 1 450 $ chacun. Réserver le jour où une alerte tombe à 1 300 $, même avant le 30 novembre. Avec des billets séparés, garder au moins 4 heures à Bangkok dans chaque sens.",
    },
    "BOOK|Travel insurance (check your credit card first)": {
      title: "Assurance voyage (vérifier d'abord ta carte de crédit)",
    },
    "BOOK|Ao Nang hotel with a pool, 7 nights (~$90/night)": {
      title: "Hôtel avec piscine à Ao Nang, 7 nuits (~90 $/nuit)",
      note: "Annulation gratuite, à distance de marche de la plage et du quai des bateaux. Dormir à Ao Nang plutôt qu'à Railay : moitié prix, et les bateaux pour Railay ne roulent ni tôt ni tard.",
    },
    "BOOK|Four-islands boat tour for Tue Mar 16": {
      title: "Tour des quatre îles en bateau pour le mardi 16 mars",
    },
    "BOOK|Thai cooking class for Thu Mar 18": {
      title: "Cours de cuisine thaïe pour le jeudi 18 mars",
    },

    // ---- à faire --------------------------------------------------------------
    "TODO|Check both passports are valid until Sept 23, 2027": {
      title: "Vérifier que les deux passeports sont valides jusqu'au 23 septembre 2027",
    },
    "TODO|Set Google Flights alerts: YUL ⇄ Krabi (KBV), Mar 11 – Mar 19": {
      title: "Créer des alertes Google Flights : YUL ⇄ Krabi (KBV), du 11 au 19 mars",
    },
    "TODO|Open the trip savings account + automatic transfer": {
      title: "Ouvrir le compte d'épargne du voyage + virement automatique",
    },
    "TODO|Check whether a credit card covers trip insurance": {
      title: "Vérifier si une carte de crédit couvre l'assurance voyage",
      note: "Bien des cartes voyage canadiennes incluent l'assurance médicale et l'annulation quand les vols sont payés avec la carte. Si l'une des vôtres le fait, c'est 230 $ d'économisés.",
    },
    "TODO|Travel clinic: hep A, typhoid, mosquito protection": {
      title: "Clinique voyage : hépatite A, typhoïde, protection contre les moustiques",
    },
    "TODO|eSIM for Thailand": {
      title: "eSIM pour la Thaïlande",
    },
    "TODO|Tell the bank you're travelling; no-FX-fee card": {
      title: "Aviser la banque du voyage; carte sans frais de conversion",
    },
    "TODO|TDAC arrival cards at tdac.immigration.go.th (free)": {
      title: "Cartes d'arrivée TDAC sur tdac.immigration.go.th (gratuit)",
      note: "Ouvre 72 h avant l'atterrissage. Faire une capture d'écran de la confirmation.",
    },
    "TODO|About $100 in baht for the first night": {
      title: "Environ 100 $ en bahts pour le premier soir",
    },

    // ---- plan d'épargne, à deux (moitié-moitié), 4 750 $ en tout ---------------
    "SAVE|October deposit ($725 each)": { title: "Dépôt d'octobre (725 $ chacun)" },
    "SAVE|November deposit ($850 each)": { title: "Dépôt de novembre (850 $ chacun)" },
    "SAVE|December deposit ($350 each)": { title: "Dépôt de décembre (350 $ chacun)" },
    "SAVE|January deposit ($150 each)": { title: "Dépôt de janvier (150 $ chacun)" },
    "SAVE|February deposit ($150 each)": { title: "Dépôt de février (150 $ chacun)" },
    "SAVE|March deposit ($150 each)": { title: "Dépôt de mars (150 $ chacun)" },

    // ---- où va l'argent (estimations pour deux) --------------------------------
    "BUDGET|Flights to Krabi and back, one ticket (2 × ~$1,450)": {
      title: "Vols aller-retour jusqu'à Krabi, un seul billet (2 × ~1 450 $)",
    },
    "BUDGET|Ao Nang hotel with a pool, 7 nights": {
      title: "Hôtel avec piscine à Ao Nang, 7 nuits",
    },
    "BUDGET|Food, mostly street food (~$50 a day for two)": {
      title: "Bouffe, surtout de rue (~50 $ par jour pour deux)",
    },
    "BUDGET|Tours: islands boat, cooking class, massages": {
      title: "Activités : bateau des îles, cours de cuisine, massages",
    },
    "BUDGET|Travel insurance": {
      title: "Assurance voyage",
    },
    "BUDGET|Optional solo day in Bangkok (one person, return flight)": {
      title: "Journée solo à Bangkok, en option (une personne, vol aller-retour)",
    },
    "BUDGET|Local transport (airport car, longtails, songthaews)": {
      title: "Transport local (voiture de l'aéroport, bateaux, songthaews)",
    },
    "BUDGET|Small buffer": {
      title: "Petit coussin",
    },

    // ---- bon à savoir ----------------------------------------------------------
    "TIP|Entry rules (Canadian passport)": {
      title: "Règles d'entrée (passeport canadien)",
      note: "Pas besoin de visa : depuis le 15 septembre 2026, les Canadiens ont droit à 30 jours sans visa (c'était 60), amplement pour une semaine. Remplir la carte d'arrivée TDAC, gratuite, dans les 72 h avant l'atterrissage. Passeports valides au moins 6 mois après l'arrivée.",
    },
    "TIP|One ticket to Krabi": {
      title: "Un seul billet jusqu'à Krabi",
      note: "Rien ne vole directement de Montréal à Krabi, alors la correspondance se fait à Bangkok dans les deux sens. Avec un seul billet, vous passez l'immigration à Bangkok, les bagages sont enregistrés jusqu'au bout, et une correspondance manquée est remplacée sans frais. Au retour, la correspondance se fait à Suvarnabhumi (BKK), pas à Don Mueang.",
    },
    "TIP|A solo day in Bangkok (optional)": {
      title: "Une journée en solo à Bangkok (en option)",
      note: "Faisable à partir d'Ao Nang : les premiers vols quittent Krabi vers 6–7 h, les derniers reviennent vers 20–21 h, environ 90–150 $ aller-retour sans bagage enregistré. En partant de l'hôtel vers 5 h, tu es de retour vers 22–23 h, avec 7–8 heures en ville. Choisir une journée sans réservation; la journée libre à la plage (18 mars) fonctionne si le cours de cuisine est déplacé.",
    },
    "TIP|As a couple in Thailand": {
      title: "En couple en Thaïlande",
      note: "Les voyageurs noirs décrivent la Thaïlande comme curieuse plutôt qu'hostile : des regards, des demandes de photo, parfois quelqu'un qui touche tes cheveux. Les couples mixtes sont courants à Bangkok et à Krabi. C'est correct de refuser les photos.",
    },
    "TIP|The weather": {
      title: "La météo",
      note: "Saison sèche sur les deux côtes. 32–34 °C vers midi : les visites se font le matin, et l'après-midi se garde pour la piscine, une sieste ou un massage.",
    },
    "TIP|Why Krabi only": {
      title: "Pourquoi seulement Krabi",
      note: "Un seul hôtel pour toute la semaine : pas de valises à refaire, pas de vol intérieur, pas de journée de transport. Tu échanges les temples et les marchés de Bangkok contre une semaine complète de falaises et de plages, et tu économises environ 100 $.",
    },
    "TIP|Where the $4,750 comes from": {
      title: "D'où viennent les 4 750 $",
      note: "Les vols comptent pour plus de la moitié et bougent à peine : attraper un tarif à 1 300 $ fait économiser 300 $. Sur place, c'est environ 230 $ par jour pour deux, hôtel compris. La bouffe de rue coûte 2–4 $ l'assiette, un massage thaï d'une heure environ 12 $, une bière environ 3 $. L'excursion à Phi Phi (environ 100 $ chacun) n'est pas dans le budget.",
    },

    // ---- bagages -----------------------------------------------------------------
    "PACK|Temple clothes (shoulders + knees covered)": {
      title: "Vêtements pour les temples (épaules et genoux couverts)",
    },
    "PACK|Reef-safe sunscreen + insect repellent": {
      title: "Crème solaire sans danger pour les coraux + chasse-moustiques",
    },
    "PACK|Water shoes for the islands": {
      title: "Souliers d'eau pour les îles",
    },
    "PACK|Closed shoes for the Railay viewpoint": {
      title: "Souliers fermés pour le belvédère de Railay",
    },
    "PACK|Universal adapter + power bank": {
      title: "Adaptateur universel + batterie externe",
    },
    "PACK|Passports + TDAC screenshots": {
      title: "Passeports + captures d'écran des TDAC",
    },
    "PACK|Dry bag for the longtail boats": {
      title: "Sac étanche pour les bateaux longue-queue",
    },
  },

  // ---- rappels ---------------------------------------------------------------------
  deadlines: {
    "Put $1,450 aside for Thailand ($725 each)": {
      title: "Mettre 1 450 $ de côté pour la Thaïlande (725 $ chacun)",
      notes: "Ensuite, coche-le dans le calendrier de réservation du voyage.",
    },
    "Put $1,700 aside for Thailand ($850 each)": {
      title: "Mettre 1 700 $ de côté pour la Thaïlande (850 $ chacun)",
      notes: "Ensuite, coche-le dans le calendrier de réservation du voyage.",
    },
    "Put $700 aside for Thailand ($350 each)": {
      title: "Mettre 700 $ de côté pour la Thaïlande (350 $ chacun)",
      notes: "Ensuite, coche-le dans le calendrier de réservation du voyage.",
    },
    "Put $300 aside for Thailand ($150 each)": {
      title: "Mettre 300 $ de côté pour la Thaïlande (150 $ chacun)",
      notes: "Ensuite, coche-le dans le calendrier de réservation du voyage.",
    },
    "Book the Thailand flights (last good date)": {
      title: "Réserver les vols pour la Thaïlande (dernière bonne date)",
      notes:
        "Un seul billet, aller-retour YUL ⇄ Krabi (KBV) par Bangkok : départ jeudi 11 mars, retour vendredi 19 mars. Environ 1 450 $ chacun, c'est normal; réserver le jour où une alerte tombe à 1 300 $ ou moins.",
    },
    "Book the trip hotels (free cancellation)": {
      title: "Réserver les hôtels du voyage (annulation gratuite)",
      notes: "Ao Nang avec piscine, 7 nuits (12–19 mars, ~90 $/nuit), à distance de marche de la plage.",
    },
    "Submit the TDAC arrival cards": {
      title: "Remplir les cartes d'arrivée TDAC",
      notes:
        "Gratuit, sur tdac.immigration.go.th, dans les 72 h avant l'atterrissage. Faire une capture d'écran de la confirmation.",
    },
  },
};
