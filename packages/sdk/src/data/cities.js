// A small gazetteer for the city-to-state task. This is deliberately
// not a full database — it's the "rules-first" fast path for the 80-90%
// of real inputs that match a known major city. The LLM fallback handles
// the long tail (villages, misspellings, abbreviations).
//
// Format: one entry per city. Columns:
//   name          canonical display name
//   aliases       alternate spellings / abbreviations the user might type
//   state         ISO-3166-2 subdivision code (US/CA/AU) or full name
//   stateName     human-readable state/province name
//   country       ISO-3166-1 alpha-2
//   countryName   human-readable country name
//   tz            IANA time zone
//   currency      ISO-4217
//
// Real product would ship ~10k entries. This ships a curated ~100 for
// the demo.

export const CITIES = [
  // ── United States ────────────────────────────────────────────────────
  { name: "San Francisco", aliases: ["sf", "san fran", "frisco"],          state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Los Angeles",   aliases: ["la"],                                 state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "San Diego",     aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "San Jose",      aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Sacramento",    aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Oakland",       aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Berkeley",      aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Palo Alto",     aliases: [],                                     state: "CA", stateName: "California",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "New York",      aliases: ["nyc", "new york city"],              state: "NY", stateName: "New York",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Brooklyn",      aliases: [],                                     state: "NY", stateName: "New York",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Buffalo",       aliases: [],                                     state: "NY", stateName: "New York",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Albany",        aliases: [],                                     state: "NY", stateName: "New York",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Chicago",       aliases: ["chi-town", "chitown"],               state: "IL", stateName: "Illinois",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Springfield",   aliases: [],                                     state: "IL", stateName: "Illinois",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Houston",       aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Austin",        aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Dallas",        aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "San Antonio",   aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "El Paso",       aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Denver",      currency: "USD" },
  { name: "Seattle",       aliases: [],                                     state: "WA", stateName: "Washington",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Tacoma",        aliases: [],                                     state: "WA", stateName: "Washington",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Spokane",       aliases: [],                                     state: "WA", stateName: "Washington",    country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Portland",      aliases: [],                                     state: "OR", stateName: "Oregon",        country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Eugene",        aliases: [],                                     state: "OR", stateName: "Oregon",        country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Salem",         aliases: [],                                     state: "OR", stateName: "Oregon",        country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Boston",        aliases: [],                                     state: "MA", stateName: "Massachusetts", country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Cambridge",     aliases: [],                                     state: "MA", stateName: "Massachusetts", country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Worcester",     aliases: [],                                     state: "MA", stateName: "Massachusetts", country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Miami",         aliases: [],                                     state: "FL", stateName: "Florida",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Orlando",       aliases: [],                                     state: "FL", stateName: "Florida",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Tampa",         aliases: [],                                     state: "FL", stateName: "Florida",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Jacksonville",  aliases: [],                                     state: "FL", stateName: "Florida",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Atlanta",       aliases: [],                                     state: "GA", stateName: "Georgia",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Savannah",      aliases: [],                                     state: "GA", stateName: "Georgia",       country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Denver",        aliases: [],                                     state: "CO", stateName: "Colorado",      country: "US", countryName: "United States", tz: "America/Denver",      currency: "USD" },
  { name: "Boulder",       aliases: [],                                     state: "CO", stateName: "Colorado",      country: "US", countryName: "United States", tz: "America/Denver",      currency: "USD" },
  { name: "Colorado Springs", aliases: [],                                   state: "CO", stateName: "Colorado",      country: "US", countryName: "United States", tz: "America/Denver",      currency: "USD" },
  { name: "Phoenix",       aliases: [],                                     state: "AZ", stateName: "Arizona",       country: "US", countryName: "United States", tz: "America/Phoenix",     currency: "USD" },
  { name: "Tucson",        aliases: [],                                     state: "AZ", stateName: "Arizona",       country: "US", countryName: "United States", tz: "America/Phoenix",     currency: "USD" },
  { name: "Scottsdale",    aliases: [],                                     state: "AZ", stateName: "Arizona",       country: "US", countryName: "United States", tz: "America/Phoenix",     currency: "USD" },
  { name: "Las Vegas",     aliases: ["vegas"],                              state: "NV", stateName: "Nevada",        country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Reno",          aliases: [],                                     state: "NV", stateName: "Nevada",        country: "US", countryName: "United States", tz: "America/Los_Angeles", currency: "USD" },
  { name: "Philadelphia",  aliases: ["philly"],                             state: "PA", stateName: "Pennsylvania",  country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Pittsburgh",    aliases: [],                                     state: "PA", stateName: "Pennsylvania",  country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Detroit",       aliases: [],                                     state: "MI", stateName: "Michigan",      country: "US", countryName: "United States", tz: "America/Detroit",     currency: "USD" },
  { name: "Ann Arbor",     aliases: [],                                     state: "MI", stateName: "Michigan",      country: "US", countryName: "United States", tz: "America/Detroit",     currency: "USD" },
  { name: "Minneapolis",   aliases: [],                                     state: "MN", stateName: "Minnesota",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Saint Paul",    aliases: ["st paul", "st. paul"],                state: "MN", stateName: "Minnesota",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Washington",    aliases: ["dc", "washington dc", "d.c."],        state: "DC", stateName: "District of Columbia", country: "US", countryName: "United States", tz: "America/New_York", currency: "USD" },
  { name: "Baltimore",     aliases: [],                                     state: "MD", stateName: "Maryland",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Honolulu",      aliases: [],                                     state: "HI", stateName: "Hawaii",        country: "US", countryName: "United States", tz: "Pacific/Honolulu",    currency: "USD" },
  { name: "Anchorage",     aliases: [],                                     state: "AK", stateName: "Alaska",        country: "US", countryName: "United States", tz: "America/Anchorage",   currency: "USD" },
  { name: "New Orleans",   aliases: ["nola"],                               state: "LA", stateName: "Louisiana",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Nashville",     aliases: [],                                     state: "TN", stateName: "Tennessee",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Memphis",       aliases: [],                                     state: "TN", stateName: "Tennessee",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Charlotte",     aliases: [],                                     state: "NC", stateName: "North Carolina", country: "US", countryName: "United States", tz: "America/New_York",   currency: "USD" },
  { name: "Raleigh",       aliases: [],                                     state: "NC", stateName: "North Carolina", country: "US", countryName: "United States", tz: "America/New_York",   currency: "USD" },
  { name: "Charleston",    aliases: [],                                     state: "SC", stateName: "South Carolina", country: "US", countryName: "United States", tz: "America/New_York",   currency: "USD" },
  { name: "Newport",        aliases: [],                                     state: "RI", stateName: "Rhode Island",  country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Providence",    aliases: [],                                     state: "RI", stateName: "Rhode Island",  country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Arlington",     aliases: [],                                     state: "TX", stateName: "Texas",         country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Columbus",      aliases: [],                                     state: "OH", stateName: "Ohio",          country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Cleveland",     aliases: [],                                     state: "OH", stateName: "Ohio",          country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Cincinnati",    aliases: [],                                     state: "OH", stateName: "Ohio",          country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Indianapolis",  aliases: ["indy"],                               state: "IN", stateName: "Indiana",       country: "US", countryName: "United States", tz: "America/Indiana/Indianapolis", currency: "USD" },
  { name: "Kansas City",   aliases: ["kc"],                                 state: "MO", stateName: "Missouri",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "St. Louis",     aliases: ["saint louis"],                        state: "MO", stateName: "Missouri",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Richmond",      aliases: [],                                     state: "VA", stateName: "Virginia",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Virginia Beach", aliases: [],                                    state: "VA", stateName: "Virginia",      country: "US", countryName: "United States", tz: "America/New_York",    currency: "USD" },
  { name: "Madison",       aliases: [],                                     state: "WI", stateName: "Wisconsin",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Milwaukee",     aliases: [],                                     state: "WI", stateName: "Wisconsin",     country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Omaha",         aliases: [],                                     state: "NE", stateName: "Nebraska",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Louisville",    aliases: [],                                     state: "KY", stateName: "Kentucky",      country: "US", countryName: "United States", tz: "America/Kentucky/Louisville", currency: "USD" },
  { name: "Oklahoma City", aliases: ["okc"],                                state: "OK", stateName: "Oklahoma",      country: "US", countryName: "United States", tz: "America/Chicago",     currency: "USD" },
  { name: "Salt Lake City", aliases: ["slc"],                                state: "UT", stateName: "Utah",          country: "US", countryName: "United States", tz: "America/Denver",      currency: "USD" },

  // ── Canada ───────────────────────────────────────────────────────────
  { name: "Toronto",       aliases: [],                                     state: "ON", stateName: "Ontario",       country: "CA", countryName: "Canada",        tz: "America/Toronto",     currency: "CAD" },
  { name: "Ottawa",        aliases: [],                                     state: "ON", stateName: "Ontario",       country: "CA", countryName: "Canada",        tz: "America/Toronto",     currency: "CAD" },
  { name: "Vancouver",     aliases: [],                                     state: "BC", stateName: "British Columbia", country: "CA", countryName: "Canada",     tz: "America/Vancouver",   currency: "CAD" },
  { name: "Victoria",      aliases: [],                                     state: "BC", stateName: "British Columbia", country: "CA", countryName: "Canada",     tz: "America/Vancouver",   currency: "CAD" },
  { name: "Montreal",      aliases: [],                                     state: "QC", stateName: "Quebec",        country: "CA", countryName: "Canada",        tz: "America/Montreal",    currency: "CAD" },
  { name: "Quebec City",   aliases: [],                                     state: "QC", stateName: "Quebec",        country: "CA", countryName: "Canada",        tz: "America/Montreal",    currency: "CAD" },
  { name: "Calgary",       aliases: [],                                     state: "AB", stateName: "Alberta",       country: "CA", countryName: "Canada",        tz: "America/Edmonton",    currency: "CAD" },
  { name: "Edmonton",      aliases: [],                                     state: "AB", stateName: "Alberta",       country: "CA", countryName: "Canada",        tz: "America/Edmonton",    currency: "CAD" },
  { name: "Winnipeg",      aliases: [],                                     state: "MB", stateName: "Manitoba",      country: "CA", countryName: "Canada",        tz: "America/Winnipeg",    currency: "CAD" },
  { name: "Halifax",       aliases: [],                                     state: "NS", stateName: "Nova Scotia",   country: "CA", countryName: "Canada",        tz: "America/Halifax",     currency: "CAD" },

  // ── United Kingdom ──────────────────────────────────────────────────
  { name: "London",        aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Manchester",    aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Birmingham",    aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Liverpool",     aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Leeds",         aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Bristol",       aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Oxford",        aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Cambridge",     aliases: [],                                     state: "ENG", stateName: "England",      country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Edinburgh",     aliases: [],                                     state: "SCT", stateName: "Scotland",     country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Glasgow",       aliases: [],                                     state: "SCT", stateName: "Scotland",     country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Cardiff",       aliases: [],                                     state: "WLS", stateName: "Wales",        country: "GB", countryName: "United Kingdom", tz: "Europe/London",      currency: "GBP" },
  { name: "Belfast",       aliases: [],                                     state: "NIR", stateName: "Northern Ireland", country: "GB", countryName: "United Kingdom", tz: "Europe/London",  currency: "GBP" },

  // ── Europe ──────────────────────────────────────────────────────────
  { name: "Paris",         aliases: [],                                     state: "IDF", stateName: "Île-de-France", country: "FR", countryName: "France",       tz: "Europe/Paris",       currency: "EUR" },
  { name: "Lyon",          aliases: [],                                     state: "ARA", stateName: "Auvergne-Rhône-Alpes", country: "FR", countryName: "France", tz: "Europe/Paris",     currency: "EUR" },
  { name: "Marseille",     aliases: [],                                     state: "PAC", stateName: "Provence-Alpes-Côte d'Azur", country: "FR", countryName: "France", tz: "Europe/Paris", currency: "EUR" },
  { name: "Berlin",        aliases: [],                                     state: "BE", stateName: "Berlin",        country: "DE", countryName: "Germany",       tz: "Europe/Berlin",      currency: "EUR" },
  { name: "Munich",        aliases: ["münchen"],                            state: "BY", stateName: "Bavaria",       country: "DE", countryName: "Germany",       tz: "Europe/Berlin",      currency: "EUR" },
  { name: "Hamburg",       aliases: [],                                     state: "HH", stateName: "Hamburg",       country: "DE", countryName: "Germany",       tz: "Europe/Berlin",      currency: "EUR" },
  { name: "Frankfurt",     aliases: [],                                     state: "HE", stateName: "Hesse",         country: "DE", countryName: "Germany",       tz: "Europe/Berlin",      currency: "EUR" },
  { name: "Cologne",       aliases: ["köln", "koln"],                       state: "NW", stateName: "North Rhine-Westphalia", country: "DE", countryName: "Germany", tz: "Europe/Berlin",   currency: "EUR" },
  { name: "Madrid",        aliases: [],                                     state: "MD", stateName: "Community of Madrid", country: "ES", countryName: "Spain",   tz: "Europe/Madrid",      currency: "EUR" },
  { name: "Barcelona",     aliases: [],                                     state: "CT", stateName: "Catalonia",     country: "ES", countryName: "Spain",         tz: "Europe/Madrid",      currency: "EUR" },
  { name: "Rome",          aliases: ["roma"],                               state: "LZ", stateName: "Lazio",         country: "IT", countryName: "Italy",         tz: "Europe/Rome",        currency: "EUR" },
  { name: "Milan",         aliases: ["milano"],                             state: "LM", stateName: "Lombardy",      country: "IT", countryName: "Italy",         tz: "Europe/Rome",        currency: "EUR" },
  { name: "Amsterdam",     aliases: [],                                     state: "NH", stateName: "North Holland", country: "NL", countryName: "Netherlands",   tz: "Europe/Amsterdam",   currency: "EUR" },
  { name: "Brussels",      aliases: ["bruxelles"],                          state: "BRU", stateName: "Brussels",     country: "BE", countryName: "Belgium",       tz: "Europe/Brussels",    currency: "EUR" },
  { name: "Vienna",        aliases: ["wien"],                               state: "W",   stateName: "Vienna",       country: "AT", countryName: "Austria",       tz: "Europe/Vienna",      currency: "EUR" },
  { name: "Zurich",        aliases: ["zürich"],                             state: "ZH",  stateName: "Zürich",       country: "CH", countryName: "Switzerland",   tz: "Europe/Zurich",      currency: "CHF" },
  { name: "Geneva",        aliases: ["genève"],                             state: "GE",  stateName: "Geneva",       country: "CH", countryName: "Switzerland",   tz: "Europe/Zurich",      currency: "CHF" },
  { name: "Stockholm",     aliases: [],                                     state: "AB",  stateName: "Stockholm",    country: "SE", countryName: "Sweden",        tz: "Europe/Stockholm",   currency: "SEK" },
  { name: "Copenhagen",    aliases: ["københavn"],                          state: "84",  stateName: "Capital Region", country: "DK", countryName: "Denmark",     tz: "Europe/Copenhagen",  currency: "DKK" },
  { name: "Oslo",          aliases: [],                                     state: "03",  stateName: "Oslo",         country: "NO", countryName: "Norway",        tz: "Europe/Oslo",        currency: "NOK" },
  { name: "Helsinki",      aliases: [],                                     state: "18",  stateName: "Uusimaa",      country: "FI", countryName: "Finland",       tz: "Europe/Helsinki",    currency: "EUR" },
  { name: "Dublin",        aliases: [],                                     state: "L",   stateName: "Leinster",     country: "IE", countryName: "Ireland",       tz: "Europe/Dublin",      currency: "EUR" },
  { name: "Lisbon",        aliases: ["lisboa"],                             state: "11",  stateName: "Lisbon",       country: "PT", countryName: "Portugal",      tz: "Europe/Lisbon",      currency: "EUR" },
  { name: "Athens",        aliases: [],                                     state: "I",   stateName: "Attica",       country: "GR", countryName: "Greece",        tz: "Europe/Athens",      currency: "EUR" },
  { name: "Warsaw",        aliases: ["warszawa"],                           state: "MZ",  stateName: "Masovia",      country: "PL", countryName: "Poland",        tz: "Europe/Warsaw",      currency: "PLN" },
  { name: "Prague",        aliases: ["praha"],                              state: "PR",  stateName: "Prague",       country: "CZ", countryName: "Czech Republic", tz: "Europe/Prague",     currency: "CZK" },
  { name: "Budapest",      aliases: [],                                     state: "BU",  stateName: "Budapest",     country: "HU", countryName: "Hungary",       tz: "Europe/Budapest",    currency: "HUF" },

  // ── Asia / Pacific ──────────────────────────────────────────────────
  { name: "Tokyo",         aliases: [],                                     state: "13",  stateName: "Tokyo",        country: "JP", countryName: "Japan",         tz: "Asia/Tokyo",         currency: "JPY" },
  { name: "Osaka",         aliases: [],                                     state: "27",  stateName: "Osaka",        country: "JP", countryName: "Japan",         tz: "Asia/Tokyo",         currency: "JPY" },
  { name: "Kyoto",         aliases: [],                                     state: "26",  stateName: "Kyoto",        country: "JP", countryName: "Japan",         tz: "Asia/Tokyo",         currency: "JPY" },
  { name: "Seoul",         aliases: [],                                     state: "11",  stateName: "Seoul",        country: "KR", countryName: "South Korea",   tz: "Asia/Seoul",         currency: "KRW" },
  { name: "Beijing",       aliases: ["peking"],                             state: "BJ",  stateName: "Beijing",      country: "CN", countryName: "China",         tz: "Asia/Shanghai",      currency: "CNY" },
  { name: "Shanghai",      aliases: [],                                     state: "SH",  stateName: "Shanghai",     country: "CN", countryName: "China",         tz: "Asia/Shanghai",      currency: "CNY" },
  { name: "Hong Kong",     aliases: ["hk"],                                 state: "HK",  stateName: "Hong Kong",    country: "HK", countryName: "Hong Kong",     tz: "Asia/Hong_Kong",     currency: "HKD" },
  { name: "Singapore",     aliases: ["sg"],                                 state: "",    stateName: "",             country: "SG", countryName: "Singapore",     tz: "Asia/Singapore",     currency: "SGD" },
  { name: "Taipei",        aliases: [],                                     state: "TPE", stateName: "Taipei",       country: "TW", countryName: "Taiwan",        tz: "Asia/Taipei",        currency: "TWD" },
  { name: "Bangkok",       aliases: [],                                     state: "10",  stateName: "Bangkok",      country: "TH", countryName: "Thailand",      tz: "Asia/Bangkok",       currency: "THB" },
  { name: "Kuala Lumpur",  aliases: ["kl"],                                 state: "14",  stateName: "Kuala Lumpur", country: "MY", countryName: "Malaysia",      tz: "Asia/Kuala_Lumpur",  currency: "MYR" },
  { name: "Jakarta",       aliases: [],                                     state: "JK",  stateName: "Jakarta",      country: "ID", countryName: "Indonesia",     tz: "Asia/Jakarta",       currency: "IDR" },
  { name: "Manila",        aliases: [],                                     state: "00",  stateName: "Metro Manila", country: "PH", countryName: "Philippines",   tz: "Asia/Manila",        currency: "PHP" },
  { name: "Mumbai",        aliases: ["bombay"],                             state: "MH",  stateName: "Maharashtra",  country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Delhi",         aliases: ["new delhi"],                          state: "DL",  stateName: "Delhi",        country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Bangalore",     aliases: ["bengaluru", "blr"],                   state: "KA",  stateName: "Karnataka",    country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Chennai",       aliases: ["madras"],                             state: "TN",  stateName: "Tamil Nadu",   country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Kolkata",       aliases: ["calcutta"],                           state: "WB",  stateName: "West Bengal",  country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Hyderabad",     aliases: [],                                     state: "TG",  stateName: "Telangana",    country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Pune",          aliases: [],                                     state: "MH",  stateName: "Maharashtra",  country: "IN", countryName: "India",         tz: "Asia/Kolkata",       currency: "INR" },
  { name: "Dubai",         aliases: [],                                     state: "DU",  stateName: "Dubai",        country: "AE", countryName: "United Arab Emirates", tz: "Asia/Dubai",  currency: "AED" },
  { name: "Abu Dhabi",     aliases: [],                                     state: "AZ",  stateName: "Abu Dhabi",    country: "AE", countryName: "United Arab Emirates", tz: "Asia/Dubai",  currency: "AED" },
  { name: "Tel Aviv",      aliases: [],                                     state: "TA",  stateName: "Tel Aviv",     country: "IL", countryName: "Israel",        tz: "Asia/Jerusalem",     currency: "ILS" },
  { name: "Sydney",        aliases: [],                                     state: "NSW", stateName: "New South Wales", country: "AU", countryName: "Australia",  tz: "Australia/Sydney",   currency: "AUD" },
  { name: "Melbourne",     aliases: [],                                     state: "VIC", stateName: "Victoria",     country: "AU", countryName: "Australia",     tz: "Australia/Melbourne", currency: "AUD" },
  { name: "Brisbane",      aliases: [],                                     state: "QLD", stateName: "Queensland",   country: "AU", countryName: "Australia",     tz: "Australia/Brisbane", currency: "AUD" },
  { name: "Perth",         aliases: [],                                     state: "WA",  stateName: "Western Australia", country: "AU", countryName: "Australia", tz: "Australia/Perth",  currency: "AUD" },
  { name: "Auckland",      aliases: [],                                     state: "AUK", stateName: "Auckland",     country: "NZ", countryName: "New Zealand",   tz: "Pacific/Auckland",   currency: "NZD" },
  { name: "Wellington",    aliases: [],                                     state: "WGN", stateName: "Wellington",   country: "NZ", countryName: "New Zealand",   tz: "Pacific/Auckland",   currency: "NZD" },

  // ── Latin America ───────────────────────────────────────────────────
  { name: "Mexico City",   aliases: ["cdmx", "ciudad de méxico"],           state: "CMX", stateName: "Mexico City",  country: "MX", countryName: "Mexico",        tz: "America/Mexico_City", currency: "MXN" },
  { name: "Guadalajara",   aliases: [],                                     state: "JAL", stateName: "Jalisco",      country: "MX", countryName: "Mexico",        tz: "America/Mexico_City", currency: "MXN" },
  { name: "Monterrey",     aliases: [],                                     state: "NLE", stateName: "Nuevo León",   country: "MX", countryName: "Mexico",        tz: "America/Monterrey",   currency: "MXN" },
  { name: "São Paulo",     aliases: ["sao paulo"],                          state: "SP",  stateName: "São Paulo",    country: "BR", countryName: "Brazil",        tz: "America/Sao_Paulo",   currency: "BRL" },
  { name: "Rio de Janeiro", aliases: ["rio"],                                state: "RJ",  stateName: "Rio de Janeiro", country: "BR", countryName: "Brazil",     tz: "America/Sao_Paulo",   currency: "BRL" },
  { name: "Brasília",      aliases: ["brasilia"],                           state: "DF",  stateName: "Federal District", country: "BR", countryName: "Brazil",   tz: "America/Sao_Paulo",   currency: "BRL" },
  { name: "Buenos Aires",  aliases: [],                                     state: "C",   stateName: "Buenos Aires", country: "AR", countryName: "Argentina",     tz: "America/Argentina/Buenos_Aires", currency: "ARS" },
  { name: "Santiago",      aliases: [],                                     state: "RM",  stateName: "Santiago Metropolitan", country: "CL", countryName: "Chile", tz: "America/Santiago",  currency: "CLP" },
  { name: "Bogotá",        aliases: ["bogota"],                             state: "DC",  stateName: "Bogotá",       country: "CO", countryName: "Colombia",      tz: "America/Bogota",      currency: "COP" },
  { name: "Lima",          aliases: [],                                     state: "LMA", stateName: "Lima",         country: "PE", countryName: "Peru",          tz: "America/Lima",        currency: "PEN" },

  // ── Africa ──────────────────────────────────────────────────────────
  { name: "Cairo",         aliases: [],                                     state: "C",   stateName: "Cairo",        country: "EG", countryName: "Egypt",         tz: "Africa/Cairo",        currency: "EGP" },
  { name: "Lagos",         aliases: [],                                     state: "LA",  stateName: "Lagos",        country: "NG", countryName: "Nigeria",       tz: "Africa/Lagos",        currency: "NGN" },
  { name: "Nairobi",       aliases: [],                                     state: "30",  stateName: "Nairobi",      country: "KE", countryName: "Kenya",         tz: "Africa/Nairobi",      currency: "KES" },
  { name: "Cape Town",     aliases: [],                                     state: "WC",  stateName: "Western Cape", country: "ZA", countryName: "South Africa",  tz: "Africa/Johannesburg", currency: "ZAR" },
  { name: "Johannesburg",  aliases: ["joburg", "jhb"],                      state: "GP",  stateName: "Gauteng",      country: "ZA", countryName: "South Africa",  tz: "Africa/Johannesburg", currency: "ZAR" },
];

// Build a lookup map for O(1) exact-name matching. Keys are normalized:
// lowercased, punctuation stripped, whitespace collapsed.
const lookup = new Map();
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const city of CITIES) {
  lookup.set(normalize(city.name), city);
  for (const alias of city.aliases) {
    lookup.set(normalize(alias), city);
  }
}

export function findCity(query) {
  return lookup.get(normalize(query)) ?? null;
}

/**
 * Fuzzy fallback: find the closest city by Levenshtein distance, capped at
 * `maxDistance`. Returns null if nothing is within the cap.
 */
export function findCityFuzzy(query, { maxDistance = 2 } = {}) {
  const q = normalize(query);
  if (!q) return null;
  if (lookup.has(q)) return lookup.get(q);

  // Scale max distance by query length: short inputs (< 5 chars) only
  // get distance-1 matches. This prevents spurious matches like
  // "new" → "nyc" (distance 2, but a completely wrong city).
  const effectiveMax = q.length < 5 ? Math.min(maxDistance, 1) : maxDistance;

  let best = null;
  let bestDist = effectiveMax + 1;
  for (const [key, city] of lookup.entries()) {
    // Length guard: skip if the lengths are too far apart.
    if (Math.abs(key.length - q.length) > effectiveMax) continue;
    const d = levenshtein(q, key);
    if (d < bestDist) {
      bestDist = d;
      best = city;
      if (d === 0) break;
    }
  }
  return best;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
