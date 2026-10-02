import type { TripPlan } from "../trip-plan";

/**
 * One week in Thailand, March 11–20 2027, for two, from Montréal:
 * Bangkok 3 nights, then Krabi / Railay 4 nights, home from Krabi.
 * Prices are estimates from fare searches in September 2026, not quotes.
 * Nothing personal in here: public prices, dates and places only.
 *
 * Third version. v1 was Thailand + Vietnam (Hoi An weekend, home March 22,
 * $6,300); v2 was this week at a comfortable level ($5,800); this one is the
 * budget version ($4,850): 3-star hotels, mostly street food, a smaller
 * buffer. `previous`, `retired` and `retiredDeadlines` describe the earlier
 * versions, so importing this onto a trip made from it removes the Vietnam
 * rows nobody has ticked and moves the trip's dates and budget, while
 * anything a person changed or ticked is left alone.
 */
export const thailand2027: TripPlan = {
  budget: 4850,
  trip: {
    title: "Thailand, one week",
    destination: "Bangkok · Krabi",
    start: "2027-03-11",
    end: "2027-03-20",
    notes: "Bangkok 3 nights, Ao Nang/Railay 4 nights, home from Krabi. Budget version for two: 3-star hotels, mostly street food, a small buffer.",
  },
  previous: [
    {
      title: "Thailand, one week",
      destination: "Bangkok · Krabi",
      start: "2027-03-11",
      end: "2027-03-20",
      budget: 5800,
      notes: "Bangkok 3 nights, Krabi/Railay 4 nights, home from Krabi. Budget is for two; about $380 of it is a buffer for extras.",
    },
    {
    title: "Thailand + Vietnam",
    destination: "Bangkok · Krabi · Hoi An",
    start: "2027-03-11",
    end: "2027-03-22",
    budget: 6300,
    notes: "Bangkok 3 nights, Krabi/Railay 4 nights, Hoi An 3 nights. Budget is for two; keep about $500 extra for tailoring and extras.",
    },
  ],
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
    { kind: "BOOK", date: "2026-11-30", cost: 2800, title: "Long-haul flights YUL → Bangkok, home from Krabi (alert at $1,250 each)", note: "Montréal–Bangkok round trips average about $1,550 each; the best fares seen lately are about $1,200. Budgeted at $1,400 each, alert at $1,250. Search multi-city: YUL → BKK Thu Mar 11, KBV → YUL Fri Mar 19. If one ticket including Krabi costs about the same, take it: a late Krabi flight is then the airline's problem. Book the day an alert hits your target, even before Nov 30." },
    { kind: "BOOK", date: "2026-11-30", cost: 230, title: "Travel insurance (check your credit card first)" },
    { kind: "BOOK", date: "2026-12-15", cost: 210, title: "Bangkok 3-star hotel near a BTS stop, 3 nights (~$70/night)", note: "Free cancellation. Near a SkyTrain stop beats a fancy lobby: it saves a Grab every day." },
    { kind: "BOOK", date: "2026-12-15", cost: 400, title: "Ao Nang hotel with a pool, 4 nights (~$100/night)", note: "Ao Nang is half the price of Railay and Railay is 15 minutes away by longtail. Splurge one night on Railay only if the budget allows." },
    { kind: "BOOK", date: "2027-01-31", cost: 150, title: "Flight Bangkok DMK → Krabi, Mon Mar 15" },
    { kind: "BOOK", date: "2027-01-31", cost: 150, title: "Flight Krabi → Suvarnabhumi (BKK), Fri Mar 19", note: "Only if it isn't already on the long-haul ticket. Land at least 5 hours before the flight home: separate tickets mean a delay is yours to absorb." },
    { kind: "BOOK", date: "2027-02-20", title: "Four-islands boat tour for Tue Mar 16" },
    { kind: "BOOK", date: "2027-02-20", title: "Thai cooking class for Thu Mar 18" },

    // ---- to do ---------------------------------------------------------------
    { kind: "TODO", date: "2026-10-01", title: "Check both passports are valid until Sept 23, 2027" },
    { kind: "TODO", date: "2026-10-01", title: "Set Google Flights alerts: YUL → BKK Mar 11, KBV → YUL Mar 19" },
    { kind: "TODO", date: "2026-10-01", title: "Open the trip savings account + automatic transfer" },
    { kind: "TODO", date: "2026-11-15", title: "Check whether a credit card covers trip insurance", note: "Many Canadian travel cards include medical and cancellation cover when the flights are paid with the card. If one of yours does, that's $230 saved." },
    { kind: "TODO", date: "2027-02-15", title: "Travel clinic: hep A, typhoid, mosquito protection" },
    { kind: "TODO", date: "2027-03-01", title: "eSIM for Thailand" },
    { kind: "TODO", date: "2027-03-01", title: "Tell the bank you're travelling; no-FX-fee card" },
    { kind: "TODO", date: "2027-03-09", title: "TDAC arrival cards at tdac.immigration.go.th (free)", note: "Opens 72h before landing. Screenshot the confirmation." },
    { kind: "TODO", date: "2027-03-10", title: "About $100 in baht for the first night" },

    // ---- savings schedule, together (half each), $4,850 in all ----------------
    // Ahead of every payment: $3,050 saved by Nov 30 for $3,030 of flights +
    // insurance, $3,650 by Dec 15 for $3,640 with the hotels, $4,050 by Jan 31
    // for $3,940 with the Krabi flights. October stays as it was, since it may
    // already be done.
    { kind: "SAVE", date: "2026-10-01", cost: 1450, title: "October deposit ($725 each)" },
    { kind: "SAVE", date: "2026-11-01", cost: 1600, title: "November deposit ($800 each)" },
    { kind: "SAVE", date: "2026-12-01", cost: 600, title: "December deposit ($300 each)" },
    { kind: "SAVE", date: "2027-01-01", cost: 400, title: "January deposit ($200 each)" },
    { kind: "SAVE", date: "2027-02-01", cost: 400, title: "February deposit ($200 each)" },
    { kind: "SAVE", date: "2027-03-01", cost: 400, title: "March deposit ($200 each)" },

    // ---- where the money goes (estimates for two) ------------------------------
    { kind: "BUDGET", cost: 2800, title: "Long-haul flights (2 × ~$1,400)" },
    { kind: "BUDGET", cost: 610, title: "Hotels, 7 nights (3-star Bangkok, Ao Nang with a pool)" },
    { kind: "BUDGET", cost: 340, title: "Food, mostly street food (~$50 a day for two)" },
    { kind: "BUDGET", cost: 300, title: "Tours: islands boat, cooking class, massages" },
    { kind: "BUDGET", cost: 300, title: "Flights to Krabi and back to Bangkok" },
    { kind: "BUDGET", cost: 230, title: "Travel insurance" },
    { kind: "BUDGET", cost: 150, title: "Local transport (Grab, longtail boats)" },
    { kind: "BUDGET", cost: 120, title: "Small buffer" },

    // ---- good to know ----------------------------------------------------------
    {
      kind: "TIP",
      title: "Entry rules (Canadian passport)",
      note: "No visa needed: since Sept 15, 2026 Canadians get 30 days visa-free (it was 60), plenty for a week. Fill in the free TDAC arrival card within 72h before landing. Passports valid at least 6 months after arrival.",
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
      title: "Why fly to Krabi",
      note: "Bangkok has no beach, and Krabi is 800 km south. The flight is about 1h20 and $50–100 each; the overnight bus is about 12h and $35 each, which costs you a day of a 7-day trip. A closer beach (Koh Samet, 3–4h by van and ferry, about $25 each) works too, but the Krabi limestone cliffs are the postcard you came for.",
    },
    {
      kind: "TIP",
      title: "Where the $4,850 comes from",
      note: "Flights are more than half of it and barely move: catching a $1,250 fare saves $300. On the ground it's about $290 a day for two, hotel included. Street food is $2–4 a plate, a 1-hour Thai massage about $12, a beer about $3. Extras like a Phi Phi day trip (about $100 each) or the Muay Thai night aren't in the budget.",
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
    // from v2 (comfortable week)
    { kind: "BOOK", title: "Long-haul flights YUL → Bangkok, home from Krabi (≤ $1,300 each)" },
    { kind: "BOOK", title: "Bangkok hotel, 3 nights, free cancellation" },
    { kind: "BOOK", title: "Railay / Ao Nang hotel, 4 nights" },
    { kind: "SAVE", title: "November deposit ($725 each)" },
    { kind: "SAVE", title: "December deposit ($450 each)" },
    { kind: "SAVE", title: "December top-up ($50 each)" },
    { kind: "SAVE", title: "January deposit ($350 each)" },
    { kind: "SAVE", title: "February deposit ($300 each)" },
    { kind: "SAVE", title: "March deposit ($300 each)" },
    { kind: "BUDGET", title: "Long-haul flights (2 × ~$1,300)" },
    { kind: "BUDGET", title: "Hotels, 7 nights" },
    { kind: "BUDGET", title: "Food and drinks, 7 days" },
    { kind: "BUDGET", title: "Tours and activities" },
    { kind: "BUDGET", title: "Buffer for extras" },
    { kind: "TIP", title: "What the buffer is for" },
    // from v1 (Thailand + Vietnam)
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
    { title: "Put $1,600 aside for Thailand ($800 each)", due: "2026-11-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2026-12-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-01-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-02-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-03-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    {
      title: "Book the Thailand flights (last good date)",
      due: "2026-11-30",
      notes: "Multi-city: YUL → BKK Thu Mar 11, Krabi (KBV) → YUL Fri Mar 19. About $1,400 each is normal; book the day an alert hits $1,250 or less.",
      remind: [21, 14, 7, 3, 1],
    },
    { title: "Book the trip hotels (free cancellation)", due: "2026-12-15", notes: "Bangkok 3-star near a BTS stop, 3 nights (Mar 12–15, ~$70/night). Ao Nang with a pool, 4 nights (Mar 15–19, ~$100/night)." },
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
    // v2
    { title: "Put $1,450 aside for Thailand ($725 each)", due: "2026-11-01" },
    { title: "Put $900 aside for Thailand ($450 each)", due: "2026-12-01" },
    { title: "Put $100 more aside for Thailand ($50 each)", due: "2026-12-10" },
    { title: "Put $700 aside for Thailand ($350 each)", due: "2027-01-01" },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2027-02-01" },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2027-03-01" },
    // v1
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
