import type { TripPlan } from "../trip-plan";
import { withFrench } from "./localise";
import { thailand2027Fr } from "./thailand-2027.fr";

/**
 * One week in Thailand, March 11–20 2027, for two, from Montréal:
 * seven nights in Ao Nang (Krabi), flying to Krabi and back on one ticket
 * through Bangkok. Prices are estimates from fare searches in September 2026,
 * not quotes. Nothing personal in here: public prices, dates and places only.
 *
 * Fourth version. v1 was Thailand + Vietnam (Hoi An weekend, home March 22,
 * $6,300); v2 was Bangkok 3 nights + Krabi 4 nights at a comfortable level
 * ($5,800); v3 was the same route on a budget ($4,850). This one drops
 * Bangkok: one hotel, no domestic flights ($4,750). `previous`, `retired`
 * and `retiredDeadlines` describe the earlier versions, so importing this
 * onto a trip made from any of them removes the old rows nobody has ticked
 * and moves the trip's dates and budget, while anything a person changed or
 * ticked is left alone. Activities kept from v3 keep their title and date,
 * because import matches on title and never moves an existing row.
 *
 * The French lives in thailand-2027.fr.ts, keyed by the English titles below:
 * rename one here and its key there has to follow (scripts/check-trip-plan.ts
 * fails otherwise). Text that names a day ("for Tue Mar 16") is written for
 * these dates; importing into a trip on other dates moves the rows but can't
 * rewrite the sentence.
 */
const english: TripPlan = {
  budget: 4750,
  trip: {
    title: "Thailand, one week",
    destination: "Krabi · Ao Nang",
    start: "2027-03-11",
    end: "2027-03-20",
    notes: "Seven nights in Ao Nang, one ticket to Krabi and back through Bangkok. Budget version for two: hotel with a pool, mostly street food, a small buffer. A solo day in Bangkok is optional.",
  },
  previous: [
    {
      title: "Thailand, one week",
      destination: "Bangkok · Krabi",
      start: "2027-03-11",
      end: "2027-03-20",
      budget: 4850,
      notes: "Bangkok 3 nights, Ao Nang/Railay 4 nights, home from Krabi. Budget version for two: 3-star hotels, mostly street food, a small buffer.",
    },
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
  stops: [{ name: "Ao Nang, Krabi", from: "2027-03-12", to: "2027-03-19" }],
  items: [
    // ---- day by day ---------------------------------------------------------
    { kind: "ACTIVITY", date: "2027-03-11", title: "Evening flight YUL → Krabi, connecting in Bangkok (~26–30h)", note: "One ticket all the way: usually Doha, Istanbul, Tokyo or Taipei, then Bangkok → Krabi. Your bags go straight through and a late connection is the airline's problem." },
    { kind: "ACTIVITY", date: "2027-03-11", title: "Submit the TDAC arrival cards before boarding" },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Land in Krabi, car to the Ao Nang hotel (~40 min)", note: "Airport taxi counter or a pre-booked car, about $20–25." },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Easy walk along Ao Nang beach, early night" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Slow first day: beach, pool, nap" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Thai massage, 1 hour (~$12 each)" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Sunset on Ao Nang beach, street food at the night market" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Tiger Cave Temple, early (1,260 steps; shoulders + knees covered)", note: "Go at 7 before the heat. The view over the cliffs is worth every step. About 30 min by car from Ao Nang." },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Krabi Town walking street night market (Sunday)", note: "Friday to Sunday evenings only. Cheap food stalls and live music." },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Longtail boat from Ao Nang to Railay", note: "15 minutes from the Ao Nang beach pier, about $4 each. No road reaches Railay, which is part of the magic." },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Sunset on Railay West beach", note: "Check the time of the last longtail back to Ao Nang (usually around sunset) or arrange a private one." },
    { kind: "ACTIVITY", date: "2027-03-16", title: "Four-islands boat tour: Phra Nang cave, Chicken Island, Tup sandbar", note: "The Tup sandbar is walkable at low tide. Bring reef-safe sunscreen and water shoes." },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Railay viewpoint trail, early morning", note: "Take the first longtail. Short but steep, with ropes and red mud: closed shoes, not flip-flops." },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Kayak the Ao Thalane mangroves, or a beginner climbing class" },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Couples massage" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Free beach day (optional Phi Phi day trip, ~$100 each)" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Thai cooking class", note: "In the evening, and you eat what you make." },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Last swim, check out by noon" },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Afternoon flight Krabi → Bangkok, connect to the flight home", note: "Same ticket, so the connection is protected. Most flights home leave Bangkok between 23:00 and 2:00." },
    { kind: "ACTIVITY", date: "2027-03-20", title: "Land in Montréal" },

    // ---- to book, with when --------------------------------------------------
    { kind: "BOOK", date: "2026-11-30", cost: 2900, title: "Flights YUL → Krabi and back, one ticket via Bangkok (alert at $1,300 each)", note: "Search a plain round trip YUL ⇄ KBV, Thu Mar 11 out, Fri Mar 19 back. Montréal–Bangkok averages about $1,550 each and the Krabi leg usually adds $50–100 on the same ticket; budgeted at $1,450 each. Book the day an alert hits $1,300, even before Nov 30. If you split tickets instead, leave at least 4 hours in Bangkok each way." },
    { kind: "BOOK", date: "2026-11-30", cost: 230, title: "Travel insurance (check your credit card first)" },
    { kind: "BOOK", date: "2026-12-15", cost: 630, title: "Ao Nang hotel with a pool, 7 nights (~$90/night)", note: "Free cancellation, walking distance to the beach and the longtail pier. Stay in Ao Nang rather than Railay: half the price, and the boats to Railay don't run early or late." },
    { kind: "BOOK", date: "2027-02-20", title: "Four-islands boat tour for Tue Mar 16" },
    { kind: "BOOK", date: "2027-02-20", title: "Thai cooking class for Thu Mar 18" },

    // ---- to do ---------------------------------------------------------------
    { kind: "TODO", date: "2026-10-01", title: "Check both passports are valid until Sept 23, 2027" },
    { kind: "TODO", date: "2026-10-01", title: "Set Google Flights alerts: YUL ⇄ Krabi (KBV), Mar 11 – Mar 19" },
    { kind: "TODO", date: "2026-10-01", title: "Open the trip savings account + automatic transfer" },
    { kind: "TODO", date: "2026-11-15", title: "Check whether a credit card covers trip insurance", note: "Many Canadian travel cards include medical and cancellation cover when the flights are paid with the card. If one of yours does, that's $230 saved." },
    { kind: "TODO", date: "2027-02-15", title: "Travel clinic: hep A, typhoid, mosquito protection" },
    { kind: "TODO", date: "2027-03-01", title: "eSIM for Thailand" },
    { kind: "TODO", date: "2027-03-01", title: "Tell the bank you're travelling; no-FX-fee card" },
    { kind: "TODO", date: "2027-03-09", title: "TDAC arrival cards at tdac.immigration.go.th (free)", note: "Opens 72h before landing. Screenshot the confirmation." },
    { kind: "TODO", date: "2027-03-10", title: "About $100 in baht for the first night" },

    // ---- savings schedule, together (half each), $4,750 in all ----------------
    // Ahead of every payment: $3,150 saved by Nov 30 for $3,130 of flights +
    // insurance, $3,850 by Dec 15 for $3,760 with the hotel. October stays as
    // it was, since it may already be done.
    { kind: "SAVE", date: "2026-10-01", cost: 1450, title: "October deposit ($725 each)" },
    { kind: "SAVE", date: "2026-11-01", cost: 1700, title: "November deposit ($850 each)" },
    { kind: "SAVE", date: "2026-12-01", cost: 700, title: "December deposit ($350 each)" },
    { kind: "SAVE", date: "2027-01-01", cost: 300, title: "January deposit ($150 each)" },
    { kind: "SAVE", date: "2027-02-01", cost: 300, title: "February deposit ($150 each)" },
    { kind: "SAVE", date: "2027-03-01", cost: 300, title: "March deposit ($150 each)" },

    // ---- where the money goes (estimates for two) ------------------------------
    { kind: "BUDGET", cost: 2900, title: "Flights to Krabi and back, one ticket (2 × ~$1,450)" },
    { kind: "BUDGET", cost: 630, title: "Ao Nang hotel with a pool, 7 nights" },
    { kind: "BUDGET", cost: 340, title: "Food, mostly street food (~$50 a day for two)" },
    { kind: "BUDGET", cost: 300, title: "Tours: islands boat, cooking class, massages" },
    { kind: "BUDGET", cost: 230, title: "Travel insurance" },
    { kind: "BUDGET", cost: 130, title: "Optional solo day in Bangkok (one person, return flight)" },
    { kind: "BUDGET", cost: 100, title: "Local transport (airport car, longtails, songthaews)" },
    { kind: "BUDGET", cost: 120, title: "Small buffer" },

    // ---- good to know ----------------------------------------------------------
    {
      kind: "TIP",
      title: "Entry rules (Canadian passport)",
      note: "No visa needed: since Sept 15, 2026 Canadians get 30 days visa-free (it was 60), plenty for a week. Fill in the free TDAC arrival card within 72h before landing. Passports valid at least 6 months after arrival.",
    },
    {
      kind: "TIP",
      title: "One ticket to Krabi",
      note: "Nothing flies from Montréal to Krabi directly, so you connect in Bangkok both ways. On one ticket you clear immigration in Bangkok, your bags are checked through, and a missed connection is rebooked for free. The return connects at Suvarnabhumi (BKK), not Don Mueang.",
    },
    {
      kind: "TIP",
      title: "A solo day in Bangkok (optional)",
      note: "Doable from Ao Nang: first flights leave Krabi around 6–7 am, the last ones back land around 8–9 pm, about $90–150 return without a checked bag. Leave the hotel around 5 am and you're back by 10–11 pm, with 7–8 hours in the city. Pick a day with nothing booked; the free beach day (Mar 18) works if you move the cooking class.",
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
      title: "Why Krabi only",
      note: "One hotel for the whole week: no packing, no domestic flight, no travel day. You trade Bangkok's temples and markets for a full week of cliffs and beaches, and save about $100.",
    },
    {
      kind: "TIP",
      title: "Where the $4,750 comes from",
      note: "Flights are more than half of it and barely move: catching a $1,300 fare saves $300. On the ground it's about $230 a day for two, hotel included. Street food is $2–4 a plate, a 1-hour Thai massage about $12, a beer about $3. A Phi Phi day trip (about $100 each) isn't in the budget.",
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

  // ---- rows from earlier versions --------------------------------------------
  retired: [
    // from v3 (Bangkok + Krabi, budget)
    { kind: "STOP", title: "Bangkok" },
    { kind: "STOP", title: "Krabi / Railay" },
    { kind: "ACTIVITY", title: "Evening flight from YUL (one stop, ~22–26h)" },
    { kind: "ACTIVITY", title: "Land in Bangkok, Grab to the hotel" },
    { kind: "ACTIVITY", title: "Easy street-food walk, early night" },
    { kind: "ACTIVITY", title: "Grand Palace at 8:30 (cover shoulders + knees)" },
    { kind: "ACTIVITY", title: "Wat Pho, the reclining Buddha" },
    { kind: "ACTIVITY", title: "5-baht ferry across to Wat Arun" },
    { kind: "ACTIVITY", title: "Pool + nap in the afternoon heat" },
    { kind: "ACTIVITY", title: "Sunset rooftop bar, then Chinatown (Yaowarat) dinner" },
    { kind: "ACTIVITY", title: "Chatuchak weekend market, early" },
    { kind: "ACTIVITY", title: "Thai massage, 1 hour (~$15 each)" },
    { kind: "ACTIVITY", title: "Longtail boat through the canals, or Jodd Fairs night market" },
    { kind: "ACTIVITY", title: "Muay Thai night at Rajadamnern Stadium (optional)" },
    { kind: "ACTIVITY", title: "Morning flight DMK → Krabi (1h20)" },
    { kind: "ACTIVITY", title: "Sunrise swim at Phra Nang beach, then check out" },
    { kind: "ACTIVITY", title: "Longtail to Ao Nang, car to Krabi airport (~40 min)" },
    { kind: "ACTIVITY", title: "Afternoon flight Krabi → Suvarnabhumi (BKK), late flight home" },
    { kind: "BOOK", title: "Long-haul flights YUL → Bangkok, home from Krabi (alert at $1,250 each)" },
    { kind: "BOOK", title: "Bangkok 3-star hotel near a BTS stop, 3 nights (~$70/night)" },
    { kind: "BOOK", title: "Ao Nang hotel with a pool, 4 nights (~$100/night)" },
    { kind: "BOOK", title: "Flight Bangkok DMK → Krabi, Mon Mar 15" },
    { kind: "BOOK", title: "Flight Krabi → Suvarnabhumi (BKK), Fri Mar 19" },
    { kind: "TODO", title: "Set Google Flights alerts: YUL → BKK Mar 11, KBV → YUL Mar 19" },
    { kind: "SAVE", title: "November deposit ($800 each)" },
    { kind: "SAVE", title: "December deposit ($300 each)" },
    { kind: "SAVE", title: "January deposit ($200 each)" },
    { kind: "SAVE", title: "February deposit ($200 each)" },
    { kind: "SAVE", title: "March deposit ($200 each)" },
    { kind: "BUDGET", title: "Long-haul flights (2 × ~$1,400)" },
    { kind: "BUDGET", title: "Hotels, 7 nights (3-star Bangkok, Ao Nang with a pool)" },
    { kind: "BUDGET", title: "Flights to Krabi and back to Bangkok" },
    { kind: "BUDGET", title: "Local transport (Grab, longtail boats)" },
    { kind: "TIP", title: "Bangkok has two airports" },
    { kind: "TIP", title: "Why this order" },
    { kind: "TIP", title: "Why fly to Krabi" },
    { kind: "TIP", title: "Where the $4,850 comes from" },
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
    { title: "Put $1,700 aside for Thailand ($850 each)", due: "2026-11-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $700 aside for Thailand ($350 each)", due: "2026-12-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $300 aside for Thailand ($150 each)", due: "2027-01-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $300 aside for Thailand ($150 each)", due: "2027-02-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    { title: "Put $300 aside for Thailand ($150 each)", due: "2027-03-01", notes: "Then tick it in the trip's booking calendar.", remind: [3, 1] },
    {
      title: "Book the Thailand flights (last good date)",
      due: "2026-11-30",
      notes: "One ticket, round trip YUL ⇄ Krabi (KBV) through Bangkok: out Thu Mar 11, back Fri Mar 19. About $1,450 each is normal; book the day an alert hits $1,300 or less.",
      remind: [21, 14, 7, 3, 1],
    },
    { title: "Book the trip hotels (free cancellation)", due: "2026-12-15", notes: "Ao Nang with a pool, 7 nights (Mar 12–19, ~$90/night), walking distance to the beach." },
    {
      title: "Submit the TDAC arrival cards",
      due: "2027-03-09",
      notes: "Free, at tdac.immigration.go.th, within 72h before landing. Screenshot the confirmation.",
      remind: [2, 1],
    },
  ],
  retiredDeadlines: [
    // v3
    { title: "Put $1,600 aside for Thailand ($800 each)", due: "2026-11-01" },
    { title: "Put $600 aside for Thailand ($300 each)", due: "2026-12-01" },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-01-01" },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-02-01" },
    { title: "Put $400 aside for Thailand ($200 each)", due: "2027-03-01" },
    { title: "Book the Krabi flights", due: "2027-01-31" },
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

export const thailand2027: TripPlan = withFrench(english, thailand2027Fr);
