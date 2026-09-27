import type { TripPlan } from "../trip-plan";

/**
 * Bangkok → Krabi → Hoi An, March 11–22 2027, for two, from Montréal.
 * Prices are estimates from fare searches in September 2026, not quotes.
 * Nothing personal in here: public prices, dates and places only.
 */
export const thailand2027: TripPlan = {
  budget: 6300,
  stops: [
    { name: "Bangkok", from: "2027-03-12", to: "2027-03-15" },
    { name: "Krabi / Railay", from: "2027-03-15", to: "2027-03-19" },
    { name: "Hoi An, Vietnam", from: "2027-03-19", to: "2027-03-22" },
  ],
  items: [
    // ---- day by day ---------------------------------------------------------
    { kind: "ACTIVITY", date: "2027-03-11", title: "Evening flight from YUL (one stop, ~22–26h)" },
    { kind: "ACTIVITY", date: "2027-03-11", title: "Submit the TDAC arrival cards before boarding" },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Land in Bangkok, Grab to the hotel" },
    { kind: "ACTIVITY", date: "2027-03-12", title: "Easy street-food walk, early night" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Grand Palace at 8:30 (cover shoulders + knees)" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Wat Pho, the reclining Buddha" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "5-baht ferry across to Wat Arun" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Pool + nap in the afternoon heat" },
    { kind: "ACTIVITY", date: "2027-03-13", title: "Sunset rooftop bar, then Chinatown (Yaowarat) dinner" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Chatuchak weekend market, early" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Thai massage, 1 hour (~$15 each)" },
    { kind: "ACTIVITY", date: "2027-03-14", title: "Longtail boat through the canals, or Jodd Fairs night market" },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Morning flight DMK → Krabi (1h20)" },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Longtail boat from Ao Nang to Railay" },
    { kind: "ACTIVITY", date: "2027-03-15", title: "Sunset on Railay West beach" },
    { kind: "ACTIVITY", date: "2027-03-16", title: "Four-islands boat tour: Phra Nang cave, Chicken Island, Tup sandbar" },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Kayak the Ao Thalane mangroves, or a beginner climbing class" },
    { kind: "ACTIVITY", date: "2027-03-17", title: "Couples massage" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Free beach day (optional Phi Phi day trip, ~$100 each)" },
    { kind: "ACTIVITY", date: "2027-03-18", title: "Thai cooking class" },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Fly Krabi → Bangkok → Da Nang, car to Hoi An (45 min)" },
    { kind: "ACTIVITY", date: "2027-03-19", title: "Lantern-lit old town, boat ride and float a lantern" },
    { kind: "ACTIVITY", date: "2027-03-20", title: "Pick a tailor and get measured" },
    { kind: "ACTIVITY", date: "2027-03-20", title: "Bike through the rice fields to An Bang beach" },
    { kind: "ACTIVITY", date: "2027-03-20", title: "Night market + cao lầu noodles" },
    { kind: "ACTIVITY", date: "2027-03-21", title: "Basket-boat ride, Cam Thanh coconut forest" },
    { kind: "ACTIVITY", date: "2027-03-21", title: "Marble Mountains + My Khe beach (or Ba Na Hills, ~$70 each)" },
    { kind: "ACTIVITY", date: "2027-03-21", title: "Final tailor fitting, farewell dinner" },
    { kind: "ACTIVITY", date: "2027-03-22", title: "Fly Da Nang → Bangkok → Montréal" },

    // ---- to book, with when --------------------------------------------------
    { kind: "BOOK", date: "2026-11-30", cost: 2600, title: "Long-haul flights YUL → BKK, back from DAD (≤ $1,300 each)" },
    { kind: "BOOK", date: "2026-11-30", cost: 230, title: "Travel insurance (check your credit card first)" },
    { kind: "BOOK", date: "2026-12-15", cost: 390, title: "Bangkok hotel, 3 nights, free cancellation" },
    { kind: "BOOK", date: "2026-12-15", cost: 600, title: "Railay / Ao Nang hotel, 4 nights" },
    { kind: "BOOK", date: "2026-12-15", cost: 360, title: "Hoi An hotel, 3 nights" },
    { kind: "BOOK", date: "2027-01-31", cost: 150, title: "Flight Bangkok DMK → Krabi, Mon Mar 15" },
    { kind: "BOOK", date: "2027-01-31", cost: 300, title: "Flights Krabi → Bangkok → Da Nang, Fri Mar 19" },
    { kind: "BOOK", date: "2027-02-20", title: "Four-islands boat tour for Tue Mar 16" },
    { kind: "BOOK", date: "2027-02-20", title: "Car from Da Nang airport to Hoi An" },
    { kind: "BOOK", date: "2027-02-20", title: "Thai cooking class for Thu Mar 18" },

    // ---- to do ---------------------------------------------------------------
    { kind: "TODO", date: "2026-10-01", title: "Check both passports are valid until Sept 23, 2027" },
    { kind: "TODO", date: "2026-10-01", title: "Set Google Flights alerts YUL → BKK, Mar 11–22" },
    { kind: "TODO", date: "2026-10-01", title: "Open the trip savings account + automatic transfer" },
    { kind: "TODO", date: "2027-02-10", cost: 70, title: "Vietnam e-visas at evisa.gov.vn only (entry: Da Nang)" },
    { kind: "TODO", date: "2027-02-15", title: "Travel clinic: hep A, typhoid, mosquito protection" },
    { kind: "TODO", date: "2027-03-01", title: "eSIM for Thailand + Vietnam" },
    { kind: "TODO", date: "2027-03-01", title: "Tell the bank you're travelling; no-FX-fee card" },
    { kind: "TODO", date: "2027-03-09", title: "TDAC arrival cards at tdac.immigration.go.th (free)" },
    { kind: "TODO", date: "2027-03-10", title: "About $100 in baht for the first night" },

    // ---- savings schedule, together (half each) --------------------------------
    { kind: "SAVE", date: "2026-10-01", cost: 1450, title: "October deposit ($725 each)" },
    { kind: "SAVE", date: "2026-11-01", cost: 1450, title: "November deposit ($725 each)" },
    { kind: "SAVE", date: "2026-12-01", cost: 900, title: "December deposit ($450 each)" },
    { kind: "SAVE", date: "2027-01-01", cost: 900, title: "January deposit ($450 each)" },
    { kind: "SAVE", date: "2027-02-01", cost: 800, title: "February deposit ($400 each)" },
    { kind: "SAVE", date: "2027-03-01", cost: 800, title: "March deposit ($400 each)" },

    // ---- packing ---------------------------------------------------------------
    { kind: "PACK", title: "Temple clothes (shoulders + knees covered)" },
    { kind: "PACK", title: "Reef-safe sunscreen + insect repellent" },
    { kind: "PACK", title: "Water shoes for the islands" },
    { kind: "PACK", title: "Universal adapter + power bank" },
    { kind: "PACK", title: "Passports, printed e-visas, TDAC screenshots" },
    { kind: "PACK", title: "Light rain jacket" },
    { kind: "PACK", title: "Room in the bag for Hoi An tailoring" },
  ],
};
