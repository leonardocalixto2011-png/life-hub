import type { TripPlan } from "../trip-plan";

/**
 * One week in Thailand, March 11–20 2027, for two, from Montréal:
 * Bangkok 3 nights, then Krabi / Railay 4 nights, home from Krabi.
 * Prices are estimates from fare searches in September 2026, not quotes.
 * Nothing personal in here: public prices, dates and places only.
 *
 * This replaces the earlier Thailand + Vietnam version (Hoi An weekend,
 * home on March 22). `previous`, `retired` and `retiredDeadlines` describe
 * that version, so importing this onto a trip made from it removes the Vietnam
 * rows nobody has ticked and moves the trip's dates and budget, while
 * anything a person changed or ticked is left alone.
 */
export const thailand2027: TripPlan = {
  budget: 5800,
  trip: {
    title: "Thailand, one week",
    destination: "Bangkok · Krabi",
    start: "2027-03-11",
    end: "2027-03-20",
    notes: "Bangkok 3 nights, Krabi/Railay 4 nights, home from Krabi. Budget is for two; about $380 of it is a buffer for extras.",
  },
  previous: {
    title: "Thailand + Vietnam",
    destination: "Bangkok · Krabi · Hoi An",
    start: "2027-03-11",
    end: "2027-03-22",
    budget: 6300,
    notes: "Bangkok 3 nights, Krabi/Railay 4 nights, Hoi An 3 nights. Budget is for two; keep about $500 extra for tailoring and extras.",
  },
  stops: [
    { name: "Bangkok", from: "2027-03-12", to: "2027-03-15" },
    { name: "Krabi / Railay", from: "2027-03-15", to: "2027-03-19" },
  ],
  items: [
    // ---- day by day ---------------------------------------------------------
    { kind: "ACTIVITY", date: "2027-03-11", title: "Evening flight from YUL (one stop, ~22–26h)", note: "Usually one stop: Doha, Istanbul, Tokyo or Taipei." },
    { kind: "ACTIVITY", date: "2027-03-11", title: "Submit the TDAC arrival cards before boarding" },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Land in Bangkok, Grab to the hotel", note: "Grab is the local Uber, or use the official taxi queue. Stay by the river or near a BTS SkyTrain stop." },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Easy street-food walk, early night" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Grand Palace at 8:30 (cover shoulders + knees)", note: "Go at opening, before the heat and the tour groups." },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Wat Pho, the reclining Buddha" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "5-baht ferry across to Wat Arun" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Pool + nap in the afternoon heat" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Sunset rooftop bar, then Chinatown (Yaowarat) dinner" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Chatuchak weekend market, early" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Thai massage, 1 hour (~$15 each)", note: "A traditional Thai massage, about an hour." },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Longtail boat through the canals, or Jodd Fairs night market" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Muay Thai night at Rajadamnern Stadium (optional)", note: "The oldest stadium in Bangkok; ringside is pricey, the upper seats are about $40–60 each. Skip it if the jet lag wins." },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Morning flight DMK → Krabi (1h20)" },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Longtail boat from Ao Nang to Railay", note: "No road reaches Railay, which is part of the magic. Car to Ao Nang first." },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Sunset on Railay West beach" },
    { kind: "ACTIVITY", date: "2027-03-16", title: "Four-islands boat tour: Phra Nang cave, Chicken Island, Tup sandbar", note: "The Tup sandbar is walkable at low tide. Bring reef-safe sunscreen and water shoes." },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Railay viewpoint trail, early morning", note: "Short but steep, with ropes and red mud: closed shoes, not flip-flops. The viewpoint is the easy half; the drop to the lagoon is for confident climbers." },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Kayak the Ao Thalane mangroves, or a beginner climbing class" },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Couples massage" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Free beach day (optional Phi Phi day trip, ~$100 each)" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Thai cooking class", note: "In the evening, and you eat what you make." },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Sunrise swim at Phra Nang beach, then check out" },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Longtail to Ao Nang, car to Krabi airport (~40 min)", note: "Leave Railay by late morning: the boats stop when the tide is too low, and you want slack before the flight." },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Afternoon flight Krabi → Suvarnabhumi (BKK), late flight home", note: "Suvarnabhumi, not Don Mueang. Most flights home leave Bangkok between 23:00 and 2:00." },
    { kind: "ACTIVITY", date: "2027-03-20", title: "Land in Montréal" },

    // ---- to book, with when --------------------------------------------------
    { kind: "BOOK", date: "2026-11-30", cost: 2600, title: "Long-haul flights YUL → Bangkok, home from Krabi (≤ $1,300 each)", note: "Search multi-city: YUL → BKK Thu Mar 11, KBV → YUL Fri Mar 19. If one ticket including Krabi costs about the same, take it: a late Krabi flight is then the airline's problem. Book the day an alert hits your target, even before Nov 30." },
    { kind: "BOOK", date: "2026-11-30", cost: 230, title: "Travel insurance (check your credit card first)" },
    { kind: "BOOK", date: "2026-12-15", cost: 390, title: "Bangkok hotel, 3 nights, free cancellation" },
    { kind: "BOOK", date: "2026-12-15", cost: 600, title: "Railay / Ao Nang hotel, 4 nights" },
    { kind: "BOOK", date: "2027-01-31", cost: 150, title: "Flight Bangkok DMK → Krabi, Mon Mar 15" },
    { kind: "BOOK", date: "2027-01-31", cost: 150, title: "Flight Krabi → Suvarnabhumi (BKK), Fri Mar 19", note: "Only if it isn't already on the long-haul ticket. Land at least 5 hours before the flight home: separate tickets mean a delay is yours to absorb." },
    { kind: "BOOK", date: "2027-02-20", title: "Four-islands boat tour for Tue Mar 16" },
    { kind: "BOOK", date: "2027-02-20", title: "Thai cooking class for Thu Mar 18" },

    // ---- to do ---------------------------------------------------------------
    { kind: "TODO", date: "2026-10-01", title: "Check both passports are valid until Sept 23, 2027" },
    { kind: "TODO", date: "2026-10-01", title: "Set Google Flights alerts: YUL → BKK Mar 11, KBV → YUL Mar 19" },
    { kind: "TODO", date: "2026-10-01", title: "Open the trip savings account + automatic transfer" },
    { kind: "TODO", date: "2027-02-15", title: "Travel clinic: hep A, typhoid, mosquito protection" },
    { kind: "TODO", date: "2027-03-01", title: "eSIM for Thailand" },
    { kind: "TODO", date: "2027-03-01", title: "Tell the bank you're travelling; no-FX-fee card" },
    { kind: "TODO", date: "2027-03-09", title: "TDAC arrival cards at tdac.immigration.go.th (free)", note: "Opens 72h before landing. Screenshot the confirmation." },
    { kind: "TODO", date: "2027-03-10", title: "About $100 in baht for the first night" },

    // ---- savings schedule, together (half each), $5,800 in all ----------------
    // Ahead of every payment: $2,900 saved by Nov 30 for $2,830 of flights +
    // insurance, $3,900 by Dec 15 for $3,820 with the hotels, $4,600 by Jan 31
    // for $4,120 with the Krabi flights. Deposits add up to the $5,800 budget.
    { kind: "SAVE", date: "2026-10-01", cost: 1450, title: "October deposit ($725 each)" },
    { kind: "SAVE", date: "2026-11-01", cost: 1450, title: "November deposit ($725 each)" },
    { kind: "SAVE", date: "2026-12-01", cost: 900, title: "December deposit ($450 each)" },
    { kind: "SAVE", date: "2026-12-10", cost: 100, title: "December top-up ($50 each)", note: "Covers the hotels due Dec 15." },
    { kind: "SAVE", date: "2027-01-01", cost: 700, title: "January deposit ($350 each)" },
    { kind: "SAVE", date: "2027-02-01", cost: 600, title: "February deposit ($300 each)" },
    { kind: "SAVE", date: "2027-03-01", cost: 600, title: "March deposit ($300 each)" },

    // ---- where the money goes (estimates for two) ------------------------------
    { kind: "BUDGET", cost: 2600, title: "Long-haul flights (2 × ~$1,300)" },
    { kind: "BUDGET", cost: 990, title: "Hotels, 7 nights" },
    { kind: "BUDGET", cost: 650, title: "Food and drinks, 7 days" },
    { kind: "BUDGET", cost: 500, title: "Tours and activities" },
    { kind: "BUDGET", cost: 300, title: "Flights to Krabi and back to Bangkok" },
    { kind: "BUDGET", cost: 230, title: "Travel insurance" },
    { kind: "BUDGET", cost: 150, title: "Local transport (Grab, longtail boats)" },
    { kind: "BUDGET", cost: 380, title: "Buffer for extras" },

    // ---- good to know ----------------------------------------------------------
    {
      kind: "TIP",
      title: "Entry rules (Canadian passport)",
      note: "No visa for a holiday this short: the visa-free stay has been 60 days, with talk of cutting it to 30, and either covers a week. Fill in the free TDAC arrival card within 72h before landing. Passports valid at least 6 months after arrival.",
    },
    {
      kind: "TIP",
      title: "Bangkok has two airports",
      note: "Don Mueang (DMK) for the budget flight to Krabi, Suvarnabhumi (BKK) for the flights from and to Montréal. They're about an hour apart by car, so check the code on every ticket.",
    },
    {
      kind: "TIP",
      title: "As a couple in Thailand",
      note: "Black travellers describe Thailand as curious rather than hostile: stares, photo requests, now and then someone touching your hair. Mixed couples are common in Bangkok and Krabi. It's fine to say no to photos.",
    },
    {
      kind: "TIP",
      title: "The weather",
      note: "Dry season on both coasts. 32–34°C by noon, so sightsee in the morning and keep afternoons for the pool, a nap or a massage.",
    },
    {
      kind: "TIP",
      title: "Why this order",
      note: "City first while you're fresh from the flight, beach last so the week ends slowly. Flying home from Krabi saves a night and a trip back into Bangkok.",
    },
    {
      kind: "TIP",
      title: "What the buffer is for",
      note: "About $380: a Phi Phi day trip (about $100 each), the Muay Thai night, shopping at Chatuchak, a nicer last dinner.",
    },

    // ---- packing ---------------------------------------------------------------
    { kind: "PACK", title: "Temple clothes (shoulders + knees covered)" },
    { kind: "PACK", title: "Reef-safe sunscreen + insect repellent" },
    { kind: "PACK", title: "Water shoes for the islands" },
    { kind: "PACK", title: "Closed shoes for the Railay viewpoint" },
    { kind: "PACK", title: "Universal adapter + power bank" },
    { kind: "PACK", title: "Passports + TDAC screenshots" },
    { kind: "PACK", title: "Dry bag for the longtail boats" },
  ],

  // ---- rows from the Thailand + Vietnam version ------------------------------
  retired: [
    { kind: "STOP", title: "Hoi An, Vietnam" },
    { kind: "ACTIVITY", title: "Fly Krabi → Bangkok → Da Nang, car to Hoi An (45 min)" },
    { kind: "ACTIVITY", title: "Lantern-lit old town, boat ride and float a lantern" },
    { kind: "ACTIVITY", title: "Pick a tailor and get measured" },
    { kind: "ACTIVITY", title: "Bike through the rice fields to An Bang beach" },
    { kind: "ACTIVITY", title: "Night market + cao lầu noodles" },
    { kind: "ACTIVITY", title: "Basket-boat ride, Cam Thanh coconut forest" },
    { kind: "ACTIVITY", title: "Marble Mountains + My Khe beach (or Ba Na Hills, ~$70 each)" },
    { kind: "ACTIVITY", title: "Final tailor fitting, farewell dinner" },
    { kind: "ACTIVITY", title: "Fly Da Nang → Bangkok → Montréal" },
    { kind: "BOOK", title: "Long-haul flights YUL → BKK, back from DAD (≤ $1,300 each)" },
    { kind: "BOOK", title: "Hoi An hotel, 3 nights" },
    { kind: "BOOK", title: "Flights Krabi → Bangkok → Da Nang, Fri Mar 19" },
    { kind: "BOOK", title: "Car from Da Nang airport to Hoi An" },
    { kind: "TODO", title: "Set Google Flights alerts YUL → BKK, Mar 11–22" },
    { kind: "TODO", title: "Vietnam e-visas at evisa.gov.vn only (entry: Da Nang)" },
    { kind: "TODO", title: "eSIM for Thailand + Vietnam" },
    { kind: "SAVE", title: "October top-up ($65 each)" },
    { kind: "SAVE", title: "November top-up ($65 each)" },
    { kind: "SAVE", title: "December top-up ($65 each)" },
    { kind: "SAVE", title: "January deposit ($450 each)" },
    { kind: "SAVE", title: "February deposit ($400 each)" },
    { kind: "SAVE", title: "March deposit ($400 each)" },
    { kind: "BUDGET", title: "Hotels, 10 nights" },
    { kind: "BUDGET", title: "Food and drinks" },
    { kind: "BUDGET", title: "Regional flights" },
    { kind: "BUDGET", title: "Insurance and e-visas" },
    { kind: "BUDGET", title: "Local transport (Grab, boats, cars)" },
    { kind: "TIP", title: "Entry rules (Canadian passports)" },
    { kind: "TIP", title: "As a couple" },
    { kind: "TIP", title: "Why Hoi An for the weekend" },
    { kind: "TIP", title: "Not in the budget" },
    { kind: "PACK", title: "Passports, printed e-visas, TDAC screenshots" },
    { kind: "PACK", title: "Room in the bag for Hoi An tailoring" },
    { kind: "PACK", title: "Light rain jacket" },
  ],

  // ---- reminders: the dated steps, as hub deadlines ---------------------------
  deadlines: [
    { title: "Put $1,450 aside for Thailand ($725 each)", due: "2026-10-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $1,450 aside for Thailand ($725 each)", due: "2026-11-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $900 aside for Thailand ($450 each)", due: "2026-12-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $100 more aside for Thailand ($50 each)", due: "2026-12-10", notes: "Covers the hotels due Dec 15. Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $700 aside for Thailand ($350 each)", due: "2027-01-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2027-02-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2027-03-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    {
      title: "Book the Thailand flights (last good date)",
      due: "2026-11-30",
      notes: "Multi-city: YUL → BKK Thu Mar 11, Krabi (KBV) → YUL Fri Mar 19. Aim for ≤ $1,300 each. Book earlier if an alert hits that.",
      remind: [21, 14, 7, 3, 1],
    },
    { title: "Book the trip hotels (free cancellation)", due: "2026-12-15", notes: "Bangkok 3 nights (Mar 12–15), Railay/Ao Nang 4 nights (Mar 15–19)." },
    {
      title: "Book the Krabi flights",
      due: "2027-01-31",
      notes: "DMK → Krabi Mon Mar 15. Krabi → Suvarnabhumi (BKK) Fri Mar 19 if it isn't on the long-haul ticket, landing 5h+ before the flight home. Add checked bags at booking.",
    },
    {
      title: "Submit the TDAC arrival cards",
      due: "2027-03-09",
      notes: "Free, at tdac.immigration.go.th, within 72h before landing. Screenshot the confirmation.",
      remind: [2, 1],
    },
  ],
  retiredDeadlines: [
    { title: "Put $1,580 aside for Thailand ($790 each)", due: "2026-10-01" },
    { title: "Put $1,580 aside for Thailand ($790 each)", due: "2026-11-01" },
    { title: "Put $1,030 aside for Thailand ($515 each)", due: "2026-12-01" },
    { title: "Put $900 aside for Thailand ($450 each)", due: "2027-01-01" },
    { title: "Put $800 aside for Thailand ($400 each)", due: "2027-02-01" },
    { title: "Put $800 aside for Thailand ($400 each)", due: "2027-03-01" },
    { title: "Book the regional flights (Krabi, Da Nang)", due: "2027-01-31" },
    { title: "Apply for the Vietnam e-visas", due: "2027-02-10" },
  ],
};
