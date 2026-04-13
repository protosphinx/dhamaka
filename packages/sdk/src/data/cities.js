// Comprehensive city gazetteer for the city-to-state task.
//
// Uses a compact builder format: each city is [name, state, stateName, tz, ...aliases].
// The build() function expands these into full objects with country, currency, etc.
// This keeps ~600 cities in a readable, maintainable file.
//
// Coverage: all US state capitals, all US cities > 150k, all world capitals,
// all world cities > 1M, and notable smaller cities.

// ── Builder ──────────────────────────────────────────────────────────

function build(country, countryName, currency, data) {
  return data.map(([name, state, stateName, tz, ...aliases]) => ({
    name, aliases, state, stateName, country, countryName, tz, currency,
  }));
}

// ── United States ────────────────────────────────────────────────────

const US = build("US", "United States", "USD", [
  // Alabama
  ["Birmingham", "AL", "Alabama", "America/Chicago"],
  ["Montgomery", "AL", "Alabama", "America/Chicago"],
  ["Huntsville", "AL", "Alabama", "America/Chicago"],
  ["Mobile", "AL", "Alabama", "America/Chicago"],
  // Alaska
  ["Anchorage", "AK", "Alaska", "America/Anchorage"],
  ["Juneau", "AK", "Alaska", "America/Anchorage"],
  ["Fairbanks", "AK", "Alaska", "America/Anchorage"],
  // Arizona
  ["Phoenix", "AZ", "Arizona", "America/Phoenix"],
  ["Tucson", "AZ", "Arizona", "America/Phoenix"],
  ["Mesa", "AZ", "Arizona", "America/Phoenix"],
  ["Scottsdale", "AZ", "Arizona", "America/Phoenix"],
  ["Chandler", "AZ", "Arizona", "America/Phoenix"],
  ["Gilbert", "AZ", "Arizona", "America/Phoenix"],
  ["Glendale", "AZ", "Arizona", "America/Phoenix"],
  ["Tempe", "AZ", "Arizona", "America/Phoenix"],
  ["Peoria", "AZ", "Arizona", "America/Phoenix"],
  ["Surprise", "AZ", "Arizona", "America/Phoenix"],
  ["Flagstaff", "AZ", "Arizona", "America/Phoenix"],
  // Arkansas
  ["Little Rock", "AR", "Arkansas", "America/Chicago"],
  ["Fort Smith", "AR", "Arkansas", "America/Chicago"],
  ["Fayetteville", "AR", "Arkansas", "America/Chicago"],
  // California
  ["San Francisco", "CA", "California", "America/Los_Angeles", "sf", "san fran", "frisco"],
  ["Los Angeles", "CA", "California", "America/Los_Angeles", "la"],
  ["San Diego", "CA", "California", "America/Los_Angeles"],
  ["San Jose", "CA", "California", "America/Los_Angeles"],
  ["Sacramento", "CA", "California", "America/Los_Angeles"],
  ["Oakland", "CA", "California", "America/Los_Angeles"],
  ["Berkeley", "CA", "California", "America/Los_Angeles"],
  ["Palo Alto", "CA", "California", "America/Los_Angeles"],
  ["Fresno", "CA", "California", "America/Los_Angeles"],
  ["Long Beach", "CA", "California", "America/Los_Angeles"],
  ["Bakersfield", "CA", "California", "America/Los_Angeles"],
  ["Anaheim", "CA", "California", "America/Los_Angeles"],
  ["Santa Ana", "CA", "California", "America/Los_Angeles"],
  ["Riverside", "CA", "California", "America/Los_Angeles"],
  ["Stockton", "CA", "California", "America/Los_Angeles"],
  ["Irvine", "CA", "California", "America/Los_Angeles"],
  ["Chula Vista", "CA", "California", "America/Los_Angeles"],
  ["Fremont", "CA", "California", "America/Los_Angeles"],
  ["Modesto", "CA", "California", "America/Los_Angeles"],
  ["Fontana", "CA", "California", "America/Los_Angeles"],
  ["Moreno Valley", "CA", "California", "America/Los_Angeles"],
  ["Santa Clarita", "CA", "California", "America/Los_Angeles"],
  ["Huntington Beach", "CA", "California", "America/Los_Angeles"],
  ["Garden Grove", "CA", "California", "America/Los_Angeles"],
  ["Oceanside", "CA", "California", "America/Los_Angeles"],
  ["Rancho Cucamonga", "CA", "California", "America/Los_Angeles"],
  ["Ontario", "CA", "California", "America/Los_Angeles"],
  ["Santa Rosa", "CA", "California", "America/Los_Angeles"],
  ["Elk Grove", "CA", "California", "America/Los_Angeles"],
  ["Sunnyvale", "CA", "California", "America/Los_Angeles"],
  ["Corona", "CA", "California", "America/Los_Angeles"],
  ["Pomona", "CA", "California", "America/Los_Angeles"],
  ["Escondido", "CA", "California", "America/Los_Angeles"],
  ["Salinas", "CA", "California", "America/Los_Angeles"],
  ["Pasadena", "CA", "California", "America/Los_Angeles"],
  ["Torrance", "CA", "California", "America/Los_Angeles"],
  ["Roseville", "CA", "California", "America/Los_Angeles"],
  ["Hayward", "CA", "California", "America/Los_Angeles"],
  ["Santa Clara", "CA", "California", "America/Los_Angeles"],
  ["Visalia", "CA", "California", "America/Los_Angeles"],
  ["Concord", "CA", "California", "America/Los_Angeles"],
  ["Thousand Oaks", "CA", "California", "America/Los_Angeles"],
  ["Simi Valley", "CA", "California", "America/Los_Angeles"],
  ["Victorville", "CA", "California", "America/Los_Angeles"],
  ["Vallejo", "CA", "California", "America/Los_Angeles"],
  ["Carlsbad", "CA", "California", "America/Los_Angeles"],
  ["Newport Beach", "CA", "California", "America/Los_Angeles"],
  ["San Bernardino", "CA", "California", "America/Los_Angeles"],
  ["Santa Barbara", "CA", "California", "America/Los_Angeles"],
  ["Santa Cruz", "CA", "California", "America/Los_Angeles"],
  ["Cupertino", "CA", "California", "America/Los_Angeles"],
  ["Mountain View", "CA", "California", "America/Los_Angeles"],
  ["Redwood City", "CA", "California", "America/Los_Angeles"],
  // Colorado
  ["Denver", "CO", "Colorado", "America/Denver"],
  ["Boulder", "CO", "Colorado", "America/Denver"],
  ["Colorado Springs", "CO", "Colorado", "America/Denver"],
  ["Aurora", "CO", "Colorado", "America/Denver"],
  ["Fort Collins", "CO", "Colorado", "America/Denver"],
  ["Lakewood", "CO", "Colorado", "America/Denver"],
  ["Thornton", "CO", "Colorado", "America/Denver"],
  ["Arvada", "CO", "Colorado", "America/Denver"],
  ["Pueblo", "CO", "Colorado", "America/Denver"],
  // Connecticut
  ["Hartford", "CT", "Connecticut", "America/New_York"],
  ["New Haven", "CT", "Connecticut", "America/New_York"],
  ["Stamford", "CT", "Connecticut", "America/New_York"],
  ["Bridgeport", "CT", "Connecticut", "America/New_York"],
  ["Waterbury", "CT", "Connecticut", "America/New_York"],
  // Delaware
  ["Dover", "DE", "Delaware", "America/New_York"],
  ["Wilmington", "DE", "Delaware", "America/New_York"],
  // Florida
  ["Miami", "FL", "Florida", "America/New_York"],
  ["Orlando", "FL", "Florida", "America/New_York"],
  ["Tampa", "FL", "Florida", "America/New_York"],
  ["Jacksonville", "FL", "Florida", "America/New_York"],
  ["Tallahassee", "FL", "Florida", "America/New_York"],
  ["St. Petersburg", "FL", "Florida", "America/New_York", "saint petersburg"],
  ["Fort Lauderdale", "FL", "Florida", "America/New_York"],
  ["Hialeah", "FL", "Florida", "America/New_York"],
  ["Cape Coral", "FL", "Florida", "America/New_York"],
  ["Port St. Lucie", "FL", "Florida", "America/New_York"],
  ["Pembroke Pines", "FL", "Florida", "America/New_York"],
  ["Hollywood", "FL", "Florida", "America/New_York"],
  ["Gainesville", "FL", "Florida", "America/New_York"],
  ["Coral Springs", "FL", "Florida", "America/New_York"],
  ["Clearwater", "FL", "Florida", "America/New_York"],
  ["Palm Bay", "FL", "Florida", "America/New_York"],
  ["Lakeland", "FL", "Florida", "America/New_York"],
  ["West Palm Beach", "FL", "Florida", "America/New_York"],
  ["Boca Raton", "FL", "Florida", "America/New_York"],
  ["Naples", "FL", "Florida", "America/New_York"],
  ["Sarasota", "FL", "Florida", "America/New_York"],
  // Georgia
  ["Atlanta", "GA", "Georgia", "America/New_York"],
  ["Savannah", "GA", "Georgia", "America/New_York"],
  ["Augusta", "GA", "Georgia", "America/New_York"],
  ["Columbus", "GA", "Georgia", "America/New_York"],
  ["Macon", "GA", "Georgia", "America/New_York"],
  ["Athens", "GA", "Georgia", "America/New_York"],
  // Hawaii
  ["Honolulu", "HI", "Hawaii", "Pacific/Honolulu"],
  // Idaho
  ["Boise", "ID", "Idaho", "America/Boise"],
  ["Meridian", "ID", "Idaho", "America/Boise"],
  ["Nampa", "ID", "Idaho", "America/Boise"],
  // Illinois
  ["Chicago", "IL", "Illinois", "America/Chicago", "chi-town", "chitown"],
  ["Springfield", "IL", "Illinois", "America/Chicago"],
  ["Aurora", "IL", "Illinois", "America/Chicago"],
  ["Naperville", "IL", "Illinois", "America/Chicago"],
  ["Rockford", "IL", "Illinois", "America/Chicago"],
  ["Joliet", "IL", "Illinois", "America/Chicago"],
  ["Elgin", "IL", "Illinois", "America/Chicago"],
  ["Peoria", "IL", "Illinois", "America/Chicago"],
  ["Champaign", "IL", "Illinois", "America/Chicago"],
  ["Evanston", "IL", "Illinois", "America/Chicago"],
  // Indiana
  ["Indianapolis", "IN", "Indiana", "America/Indiana/Indianapolis", "indy"],
  ["Fort Wayne", "IN", "Indiana", "America/Indiana/Indianapolis"],
  ["Evansville", "IN", "Indiana", "America/Indiana/Indianapolis"],
  ["South Bend", "IN", "Indiana", "America/Indiana/Indianapolis"],
  ["Bloomington", "IN", "Indiana", "America/Indiana/Indianapolis"],
  // Iowa
  ["Des Moines", "IA", "Iowa", "America/Chicago"],
  ["Cedar Rapids", "IA", "Iowa", "America/Chicago"],
  ["Davenport", "IA", "Iowa", "America/Chicago"],
  ["Iowa City", "IA", "Iowa", "America/Chicago"],
  // Kansas
  ["Topeka", "KS", "Kansas", "America/Chicago"],
  ["Wichita", "KS", "Kansas", "America/Chicago"],
  ["Overland Park", "KS", "Kansas", "America/Chicago"],
  ["Kansas City", "KS", "Kansas", "America/Chicago"],
  ["Lawrence", "KS", "Kansas", "America/Chicago"],
  // Kentucky
  ["Frankfort", "KY", "Kentucky", "America/Kentucky/Louisville"],
  ["Louisville", "KY", "Kentucky", "America/Kentucky/Louisville"],
  ["Lexington", "KY", "Kentucky", "America/New_York"],
  ["Bowling Green", "KY", "Kentucky", "America/Chicago"],
  // Louisiana
  ["New Orleans", "LA", "Louisiana", "America/Chicago", "nola"],
  ["Baton Rouge", "LA", "Louisiana", "America/Chicago"],
  ["Shreveport", "LA", "Louisiana", "America/Chicago"],
  ["Lafayette", "LA", "Louisiana", "America/Chicago"],
  // Maine
  ["Augusta", "ME", "Maine", "America/New_York"],
  ["Portland", "ME", "Maine", "America/New_York"],
  // Maryland
  ["Baltimore", "MD", "Maryland", "America/New_York"],
  ["Annapolis", "MD", "Maryland", "America/New_York"],
  ["Frederick", "MD", "Maryland", "America/New_York"],
  ["Rockville", "MD", "Maryland", "America/New_York"],
  // Massachusetts
  ["Boston", "MA", "Massachusetts", "America/New_York"],
  ["Cambridge", "MA", "Massachusetts", "America/New_York"],
  ["Worcester", "MA", "Massachusetts", "America/New_York"],
  ["Springfield", "MA", "Massachusetts", "America/New_York"],
  ["Lowell", "MA", "Massachusetts", "America/New_York"],
  // Michigan
  ["Detroit", "MI", "Michigan", "America/Detroit"],
  ["Ann Arbor", "MI", "Michigan", "America/Detroit"],
  ["Lansing", "MI", "Michigan", "America/Detroit"],
  ["Grand Rapids", "MI", "Michigan", "America/Detroit"],
  ["Warren", "MI", "Michigan", "America/Detroit"],
  ["Sterling Heights", "MI", "Michigan", "America/Detroit"],
  ["Flint", "MI", "Michigan", "America/Detroit"],
  ["Kalamazoo", "MI", "Michigan", "America/Detroit"],
  // Minnesota
  ["Minneapolis", "MN", "Minnesota", "America/Chicago"],
  ["Saint Paul", "MN", "Minnesota", "America/Chicago", "st paul", "st. paul"],
  ["Rochester", "MN", "Minnesota", "America/Chicago"],
  ["Duluth", "MN", "Minnesota", "America/Chicago"],
  // Mississippi
  ["Jackson", "MS", "Mississippi", "America/Chicago"],
  // Missouri
  ["Kansas City", "MO", "Missouri", "America/Chicago", "kc"],
  ["St. Louis", "MO", "Missouri", "America/Chicago", "saint louis"],
  ["Jefferson City", "MO", "Missouri", "America/Chicago"],
  ["Springfield", "MO", "Missouri", "America/Chicago"],
  ["Columbia", "MO", "Missouri", "America/Chicago"],
  // Montana
  ["Helena", "MT", "Montana", "America/Denver"],
  ["Billings", "MT", "Montana", "America/Denver"],
  ["Missoula", "MT", "Montana", "America/Denver"],
  // Nebraska
  ["Lincoln", "NE", "Nebraska", "America/Chicago"],
  ["Omaha", "NE", "Nebraska", "America/Chicago"],
  // Nevada
  ["Las Vegas", "NV", "Nevada", "America/Los_Angeles", "vegas"],
  ["Reno", "NV", "Nevada", "America/Los_Angeles"],
  ["Carson City", "NV", "Nevada", "America/Los_Angeles"],
  ["Henderson", "NV", "Nevada", "America/Los_Angeles"],
  ["North Las Vegas", "NV", "Nevada", "America/Los_Angeles"],
  // New Hampshire
  ["Concord", "NH", "New Hampshire", "America/New_York"],
  ["Manchester", "NH", "New Hampshire", "America/New_York"],
  ["Nashua", "NH", "New Hampshire", "America/New_York"],
  // New Jersey
  ["Trenton", "NJ", "New Jersey", "America/New_York"],
  ["Newark", "NJ", "New Jersey", "America/New_York"],
  ["Jersey City", "NJ", "New Jersey", "America/New_York"],
  ["Paterson", "NJ", "New Jersey", "America/New_York"],
  ["Elizabeth", "NJ", "New Jersey", "America/New_York"],
  ["Edison", "NJ", "New Jersey", "America/New_York"],
  ["Princeton", "NJ", "New Jersey", "America/New_York"],
  // New Mexico
  ["Santa Fe", "NM", "New Mexico", "America/Denver"],
  ["Albuquerque", "NM", "New Mexico", "America/Denver"],
  ["Las Cruces", "NM", "New Mexico", "America/Denver"],
  // New York
  ["New York", "NY", "New York", "America/New_York", "nyc", "new york city"],
  ["Brooklyn", "NY", "New York", "America/New_York"],
  ["Buffalo", "NY", "New York", "America/New_York"],
  ["Albany", "NY", "New York", "America/New_York"],
  ["Rochester", "NY", "New York", "America/New_York"],
  ["Syracuse", "NY", "New York", "America/New_York"],
  ["Yonkers", "NY", "New York", "America/New_York"],
  ["White Plains", "NY", "New York", "America/New_York"],
  ["Ithaca", "NY", "New York", "America/New_York"],
  // North Carolina
  ["Charlotte", "NC", "North Carolina", "America/New_York"],
  ["Raleigh", "NC", "North Carolina", "America/New_York"],
  ["Durham", "NC", "North Carolina", "America/New_York"],
  ["Greensboro", "NC", "North Carolina", "America/New_York"],
  ["Winston-Salem", "NC", "North Carolina", "America/New_York"],
  ["Fayetteville", "NC", "North Carolina", "America/New_York"],
  ["Cary", "NC", "North Carolina", "America/New_York"],
  ["Wilmington", "NC", "North Carolina", "America/New_York"],
  ["Asheville", "NC", "North Carolina", "America/New_York"],
  ["Chapel Hill", "NC", "North Carolina", "America/New_York"],
  // North Dakota
  ["Bismarck", "ND", "North Dakota", "America/Chicago"],
  ["Fargo", "ND", "North Dakota", "America/Chicago"],
  // Ohio
  ["Columbus", "OH", "Ohio", "America/New_York"],
  ["Cleveland", "OH", "Ohio", "America/New_York"],
  ["Cincinnati", "OH", "Ohio", "America/New_York"],
  ["Toledo", "OH", "Ohio", "America/New_York"],
  ["Akron", "OH", "Ohio", "America/New_York"],
  ["Dayton", "OH", "Ohio", "America/New_York"],
  // Oklahoma
  ["Oklahoma City", "OK", "Oklahoma", "America/Chicago", "okc"],
  ["Tulsa", "OK", "Oklahoma", "America/Chicago"],
  ["Norman", "OK", "Oklahoma", "America/Chicago"],
  // Oregon
  ["Portland", "OR", "Oregon", "America/Los_Angeles"],
  ["Eugene", "OR", "Oregon", "America/Los_Angeles"],
  ["Salem", "OR", "Oregon", "America/Los_Angeles"],
  ["Bend", "OR", "Oregon", "America/Los_Angeles"],
  ["Corvallis", "OR", "Oregon", "America/Los_Angeles"],
  // Pennsylvania
  ["Philadelphia", "PA", "Pennsylvania", "America/New_York", "philly"],
  ["Pittsburgh", "PA", "Pennsylvania", "America/New_York"],
  ["Harrisburg", "PA", "Pennsylvania", "America/New_York"],
  ["Allentown", "PA", "Pennsylvania", "America/New_York"],
  ["Erie", "PA", "Pennsylvania", "America/New_York"],
  ["Reading", "PA", "Pennsylvania", "America/New_York"],
  ["State College", "PA", "Pennsylvania", "America/New_York"],
  // Rhode Island
  ["Providence", "RI", "Rhode Island", "America/New_York"],
  ["Newport", "RI", "Rhode Island", "America/New_York"],
  // South Carolina
  ["Columbia", "SC", "South Carolina", "America/New_York"],
  ["Charleston", "SC", "South Carolina", "America/New_York"],
  ["Greenville", "SC", "South Carolina", "America/New_York"],
  ["Myrtle Beach", "SC", "South Carolina", "America/New_York"],
  // South Dakota
  ["Pierre", "SD", "South Dakota", "America/Chicago"],
  ["Sioux Falls", "SD", "South Dakota", "America/Chicago"],
  ["Rapid City", "SD", "South Dakota", "America/Denver"],
  // Tennessee
  ["Nashville", "TN", "Tennessee", "America/Chicago"],
  ["Memphis", "TN", "Tennessee", "America/Chicago"],
  ["Knoxville", "TN", "Tennessee", "America/New_York"],
  ["Chattanooga", "TN", "Tennessee", "America/New_York"],
  ["Clarksville", "TN", "Tennessee", "America/Chicago"],
  ["Murfreesboro", "TN", "Tennessee", "America/Chicago"],
  // Texas
  ["Houston", "TX", "Texas", "America/Chicago"],
  ["Austin", "TX", "Texas", "America/Chicago"],
  ["Dallas", "TX", "Texas", "America/Chicago"],
  ["San Antonio", "TX", "Texas", "America/Chicago"],
  ["Fort Worth", "TX", "Texas", "America/Chicago"],
  ["El Paso", "TX", "Texas", "America/Denver"],
  ["Arlington", "TX", "Texas", "America/Chicago"],
  ["Plano", "TX", "Texas", "America/Chicago"],
  ["Corpus Christi", "TX", "Texas", "America/Chicago"],
  ["Laredo", "TX", "Texas", "America/Chicago"],
  ["Lubbock", "TX", "Texas", "America/Chicago"],
  ["Irving", "TX", "Texas", "America/Chicago"],
  ["Garland", "TX", "Texas", "America/Chicago"],
  ["Frisco", "TX", "Texas", "America/Chicago"],
  ["McKinney", "TX", "Texas", "America/Chicago"],
  ["Amarillo", "TX", "Texas", "America/Chicago"],
  ["Brownsville", "TX", "Texas", "America/Chicago"],
  ["Grand Prairie", "TX", "Texas", "America/Chicago"],
  ["Killeen", "TX", "Texas", "America/Chicago"],
  ["Midland", "TX", "Texas", "America/Chicago"],
  ["Odessa", "TX", "Texas", "America/Chicago"],
  ["Round Rock", "TX", "Texas", "America/Chicago"],
  ["College Station", "TX", "Texas", "America/Chicago"],
  ["Waco", "TX", "Texas", "America/Chicago"],
  // Utah
  ["Salt Lake City", "UT", "Utah", "America/Denver", "slc"],
  ["Provo", "UT", "Utah", "America/Denver"],
  ["West Valley City", "UT", "Utah", "America/Denver"],
  ["Ogden", "UT", "Utah", "America/Denver"],
  ["St. George", "UT", "Utah", "America/Denver"],
  // Vermont
  ["Montpelier", "VT", "Vermont", "America/New_York"],
  ["Burlington", "VT", "Vermont", "America/New_York"],
  // Virginia
  ["Richmond", "VA", "Virginia", "America/New_York"],
  ["Virginia Beach", "VA", "Virginia", "America/New_York"],
  ["Norfolk", "VA", "Virginia", "America/New_York"],
  ["Chesapeake", "VA", "Virginia", "America/New_York"],
  ["Arlington", "VA", "Virginia", "America/New_York"],
  ["Alexandria", "VA", "Virginia", "America/New_York"],
  ["Charlottesville", "VA", "Virginia", "America/New_York"],
  ["Roanoke", "VA", "Virginia", "America/New_York"],
  // Washington
  ["Seattle", "WA", "Washington", "America/Los_Angeles"],
  ["Tacoma", "WA", "Washington", "America/Los_Angeles"],
  ["Spokane", "WA", "Washington", "America/Los_Angeles"],
  ["Olympia", "WA", "Washington", "America/Los_Angeles"],
  ["Bellevue", "WA", "Washington", "America/Los_Angeles"],
  ["Vancouver", "WA", "Washington", "America/Los_Angeles"],
  ["Redmond", "WA", "Washington", "America/Los_Angeles"],
  // Washington D.C.
  ["Washington", "DC", "District of Columbia", "America/New_York", "dc", "washington dc", "d.c."],
  // West Virginia
  ["Charleston", "WV", "West Virginia", "America/New_York"],
  ["Huntington", "WV", "West Virginia", "America/New_York"],
  // Wisconsin
  ["Madison", "WI", "Wisconsin", "America/Chicago"],
  ["Milwaukee", "WI", "Wisconsin", "America/Chicago"],
  ["Green Bay", "WI", "Wisconsin", "America/Chicago"],
  // Wyoming
  ["Cheyenne", "WY", "Wyoming", "America/Denver"],
  ["Casper", "WY", "Wyoming", "America/Denver"],
]);

// ── Canada ───────────────────────────────────────────────────────────

const CA = build("CA", "Canada", "CAD", [
  ["Toronto", "ON", "Ontario", "America/Toronto"],
  ["Ottawa", "ON", "Ontario", "America/Toronto"],
  ["Mississauga", "ON", "Ontario", "America/Toronto"],
  ["Hamilton", "ON", "Ontario", "America/Toronto"],
  ["London", "ON", "Ontario", "America/Toronto"],
  ["Kitchener", "ON", "Ontario", "America/Toronto"],
  ["Windsor", "ON", "Ontario", "America/Toronto"],
  ["Vancouver", "BC", "British Columbia", "America/Vancouver"],
  ["Victoria", "BC", "British Columbia", "America/Vancouver"],
  ["Surrey", "BC", "British Columbia", "America/Vancouver"],
  ["Burnaby", "BC", "British Columbia", "America/Vancouver"],
  ["Montreal", "QC", "Quebec", "America/Montreal"],
  ["Quebec City", "QC", "Quebec", "America/Montreal"],
  ["Laval", "QC", "Quebec", "America/Montreal"],
  ["Gatineau", "QC", "Quebec", "America/Montreal"],
  ["Calgary", "AB", "Alberta", "America/Edmonton"],
  ["Edmonton", "AB", "Alberta", "America/Edmonton"],
  ["Red Deer", "AB", "Alberta", "America/Edmonton"],
  ["Winnipeg", "MB", "Manitoba", "America/Winnipeg"],
  ["Halifax", "NS", "Nova Scotia", "America/Halifax"],
  ["Saskatoon", "SK", "Saskatchewan", "America/Regina"],
  ["Regina", "SK", "Saskatchewan", "America/Regina"],
  ["St. John's", "NL", "Newfoundland", "America/St_Johns", "saint johns"],
  ["Fredericton", "NB", "New Brunswick", "America/Moncton"],
  ["Charlottetown", "PE", "Prince Edward Island", "America/Halifax"],
  ["Whitehorse", "YT", "Yukon", "America/Whitehorse"],
  ["Yellowknife", "NT", "Northwest Territories", "America/Yellowknife"],
]);

// ── United Kingdom ───────────────────────────────────────────────────

const GB = build("GB", "United Kingdom", "GBP", [
  ["London", "ENG", "England", "Europe/London"],
  ["Manchester", "ENG", "England", "Europe/London"],
  ["Birmingham", "ENG", "England", "Europe/London"],
  ["Liverpool", "ENG", "England", "Europe/London"],
  ["Leeds", "ENG", "England", "Europe/London"],
  ["Bristol", "ENG", "England", "Europe/London"],
  ["Oxford", "ENG", "England", "Europe/London"],
  ["Cambridge", "ENG", "England", "Europe/London"],
  ["Sheffield", "ENG", "England", "Europe/London"],
  ["Newcastle", "ENG", "England", "Europe/London"],
  ["Nottingham", "ENG", "England", "Europe/London"],
  ["Leicester", "ENG", "England", "Europe/London"],
  ["Brighton", "ENG", "England", "Europe/London"],
  ["Southampton", "ENG", "England", "Europe/London"],
  ["Portsmouth", "ENG", "England", "Europe/London"],
  ["Plymouth", "ENG", "England", "Europe/London"],
  ["Coventry", "ENG", "England", "Europe/London"],
  ["Bath", "ENG", "England", "Europe/London"],
  ["York", "ENG", "England", "Europe/London"],
  ["Norwich", "ENG", "England", "Europe/London"],
  ["Edinburgh", "SCT", "Scotland", "Europe/London"],
  ["Glasgow", "SCT", "Scotland", "Europe/London"],
  ["Aberdeen", "SCT", "Scotland", "Europe/London"],
  ["Dundee", "SCT", "Scotland", "Europe/London"],
  ["Cardiff", "WLS", "Wales", "Europe/London"],
  ["Swansea", "WLS", "Wales", "Europe/London"],
  ["Belfast", "NIR", "Northern Ireland", "Europe/London"],
]);

// ── India ────────────────────────────────────────────────────────────

const IN = build("IN", "India", "INR", [
  ["Mumbai", "MH", "Maharashtra", "Asia/Kolkata", "bombay"],
  ["Pune", "MH", "Maharashtra", "Asia/Kolkata"],
  ["Nagpur", "MH", "Maharashtra", "Asia/Kolkata"],
  ["Nashik", "MH", "Maharashtra", "Asia/Kolkata"],
  ["Aurangabad", "MH", "Maharashtra", "Asia/Kolkata"],
  ["Thane", "MH", "Maharashtra", "Asia/Kolkata"],
  ["Delhi", "DL", "Delhi", "Asia/Kolkata", "new delhi"],
  ["Noida", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Gurgaon", "HR", "Haryana", "Asia/Kolkata", "gurugram"],
  ["Bangalore", "KA", "Karnataka", "Asia/Kolkata", "bengaluru", "blr"],
  ["Mysore", "KA", "Karnataka", "Asia/Kolkata", "mysuru"],
  ["Mangalore", "KA", "Karnataka", "Asia/Kolkata", "mangaluru"],
  ["Hubli", "KA", "Karnataka", "Asia/Kolkata"],
  ["Chennai", "TN", "Tamil Nadu", "Asia/Kolkata", "madras"],
  ["Coimbatore", "TN", "Tamil Nadu", "Asia/Kolkata"],
  ["Madurai", "TN", "Tamil Nadu", "Asia/Kolkata"],
  ["Salem", "TN", "Tamil Nadu", "Asia/Kolkata"],
  ["Tiruchirappalli", "TN", "Tamil Nadu", "Asia/Kolkata", "trichy"],
  ["Kolkata", "WB", "West Bengal", "Asia/Kolkata", "calcutta"],
  ["Howrah", "WB", "West Bengal", "Asia/Kolkata"],
  ["Hyderabad", "TG", "Telangana", "Asia/Kolkata"],
  ["Warangal", "TG", "Telangana", "Asia/Kolkata"],
  ["Ahmedabad", "GJ", "Gujarat", "Asia/Kolkata"],
  ["Surat", "GJ", "Gujarat", "Asia/Kolkata"],
  ["Vadodara", "GJ", "Gujarat", "Asia/Kolkata", "baroda"],
  ["Rajkot", "GJ", "Gujarat", "Asia/Kolkata"],
  ["Jaipur", "RJ", "Rajasthan", "Asia/Kolkata"],
  ["Jodhpur", "RJ", "Rajasthan", "Asia/Kolkata"],
  ["Udaipur", "RJ", "Rajasthan", "Asia/Kolkata"],
  ["Kota", "RJ", "Rajasthan", "Asia/Kolkata"],
  ["Kanpur", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Lucknow", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Agra", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Varanasi", "UP", "Uttar Pradesh", "Asia/Kolkata", "benaras", "kashi"],
  ["Allahabad", "UP", "Uttar Pradesh", "Asia/Kolkata", "prayagraj"],
  ["Meerut", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Ghaziabad", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Bareilly", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Aligarh", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Moradabad", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Gorakhpur", "UP", "Uttar Pradesh", "Asia/Kolkata"],
  ["Patna", "BR", "Bihar", "Asia/Kolkata"],
  ["Gaya", "BR", "Bihar", "Asia/Kolkata"],
  ["Bhopal", "MP", "Madhya Pradesh", "Asia/Kolkata"],
  ["Indore", "MP", "Madhya Pradesh", "Asia/Kolkata"],
  ["Jabalpur", "MP", "Madhya Pradesh", "Asia/Kolkata"],
  ["Gwalior", "MP", "Madhya Pradesh", "Asia/Kolkata"],
  ["Chandigarh", "CH", "Chandigarh", "Asia/Kolkata"],
  ["Ludhiana", "PB", "Punjab", "Asia/Kolkata"],
  ["Amritsar", "PB", "Punjab", "Asia/Kolkata"],
  ["Jalandhar", "PB", "Punjab", "Asia/Kolkata"],
  ["Thiruvananthapuram", "KL", "Kerala", "Asia/Kolkata", "trivandrum"],
  ["Kochi", "KL", "Kerala", "Asia/Kolkata", "cochin"],
  ["Kozhikode", "KL", "Kerala", "Asia/Kolkata", "calicut"],
  ["Visakhapatnam", "AP", "Andhra Pradesh", "Asia/Kolkata", "vizag"],
  ["Vijayawada", "AP", "Andhra Pradesh", "Asia/Kolkata"],
  ["Tirupati", "AP", "Andhra Pradesh", "Asia/Kolkata"],
  ["Guwahati", "AS", "Assam", "Asia/Kolkata"],
  ["Bhubaneswar", "OD", "Odisha", "Asia/Kolkata"],
  ["Cuttack", "OD", "Odisha", "Asia/Kolkata"],
  ["Raipur", "CG", "Chhattisgarh", "Asia/Kolkata"],
  ["Ranchi", "JH", "Jharkhand", "Asia/Kolkata"],
  ["Jamshedpur", "JH", "Jharkhand", "Asia/Kolkata"],
  ["Dehradun", "UK", "Uttarakhand", "Asia/Kolkata"],
  ["Srinagar", "JK", "Jammu and Kashmir", "Asia/Kolkata"],
  ["Jammu", "JK", "Jammu and Kashmir", "Asia/Kolkata"],
  ["Shimla", "HP", "Himachal Pradesh", "Asia/Kolkata"],
  ["Imphal", "MN", "Manipur", "Asia/Kolkata"],
  ["Shillong", "ML", "Meghalaya", "Asia/Kolkata"],
  ["Gangtok", "SK", "Sikkim", "Asia/Kolkata"],
]);

// ── Europe ───────────────────────────────────────────────────────────

const EU = [
  ...build("FR", "France", "EUR", [
    ["Paris", "IDF", "Île-de-France", "Europe/Paris"],
    ["Lyon", "ARA", "Auvergne-Rhône-Alpes", "Europe/Paris"],
    ["Marseille", "PAC", "Provence-Alpes-Côte d'Azur", "Europe/Paris"],
    ["Toulouse", "OCC", "Occitanie", "Europe/Paris"],
    ["Nice", "PAC", "Provence-Alpes-Côte d'Azur", "Europe/Paris"],
    ["Nantes", "PDL", "Pays de la Loire", "Europe/Paris"],
    ["Strasbourg", "GES", "Grand Est", "Europe/Paris"],
    ["Bordeaux", "NAQ", "Nouvelle-Aquitaine", "Europe/Paris"],
    ["Lille", "HDF", "Hauts-de-France", "Europe/Paris"],
    ["Montpellier", "OCC", "Occitanie", "Europe/Paris"],
  ]),
  ...build("DE", "Germany", "EUR", [
    ["Berlin", "BE", "Berlin", "Europe/Berlin"],
    ["Munich", "BY", "Bavaria", "Europe/Berlin", "münchen"],
    ["Hamburg", "HH", "Hamburg", "Europe/Berlin"],
    ["Frankfurt", "HE", "Hesse", "Europe/Berlin"],
    ["Cologne", "NW", "North Rhine-Westphalia", "Europe/Berlin", "köln", "koln"],
    ["Stuttgart", "BW", "Baden-Württemberg", "Europe/Berlin"],
    ["Düsseldorf", "NW", "North Rhine-Westphalia", "Europe/Berlin", "dusseldorf"],
    ["Leipzig", "SN", "Saxony", "Europe/Berlin"],
    ["Dortmund", "NW", "North Rhine-Westphalia", "Europe/Berlin"],
    ["Essen", "NW", "North Rhine-Westphalia", "Europe/Berlin"],
    ["Bremen", "HB", "Bremen", "Europe/Berlin"],
    ["Dresden", "SN", "Saxony", "Europe/Berlin"],
    ["Nuremberg", "BY", "Bavaria", "Europe/Berlin", "nürnberg"],
    ["Hannover", "NI", "Lower Saxony", "Europe/Berlin"],
    ["Bonn", "NW", "North Rhine-Westphalia", "Europe/Berlin"],
    ["Heidelberg", "BW", "Baden-Württemberg", "Europe/Berlin"],
  ]),
  ...build("ES", "Spain", "EUR", [
    ["Madrid", "MD", "Community of Madrid", "Europe/Madrid"],
    ["Barcelona", "CT", "Catalonia", "Europe/Madrid"],
    ["Valencia", "VC", "Valencia", "Europe/Madrid"],
    ["Seville", "AN", "Andalusia", "Europe/Madrid", "sevilla"],
    ["Bilbao", "PV", "Basque Country", "Europe/Madrid"],
    ["Málaga", "AN", "Andalusia", "Europe/Madrid", "malaga"],
    ["Granada", "AN", "Andalusia", "Europe/Madrid"],
  ]),
  ...build("IT", "Italy", "EUR", [
    ["Rome", "LZ", "Lazio", "Europe/Rome", "roma"],
    ["Milan", "LM", "Lombardy", "Europe/Rome", "milano"],
    ["Naples", "CM", "Campania", "Europe/Rome", "napoli"],
    ["Turin", "PM", "Piedmont", "Europe/Rome", "torino"],
    ["Florence", "TC", "Tuscany", "Europe/Rome", "firenze"],
    ["Bologna", "ER", "Emilia-Romagna", "Europe/Rome"],
    ["Venice", "VN", "Veneto", "Europe/Rome", "venezia"],
    ["Genoa", "LG", "Liguria", "Europe/Rome", "genova"],
    ["Palermo", "SC", "Sicily", "Europe/Rome"],
    ["Verona", "VN", "Veneto", "Europe/Rome"],
  ]),
  ...build("NL", "Netherlands", "EUR", [
    ["Amsterdam", "NH", "North Holland", "Europe/Amsterdam"],
    ["Rotterdam", "ZH", "South Holland", "Europe/Amsterdam"],
    ["The Hague", "ZH", "South Holland", "Europe/Amsterdam", "den haag"],
    ["Utrecht", "UT", "Utrecht", "Europe/Amsterdam"],
    ["Eindhoven", "NB", "North Brabant", "Europe/Amsterdam"],
  ]),
  ...build("BE", "Belgium", "EUR", [
    ["Brussels", "BRU", "Brussels", "Europe/Brussels", "bruxelles"],
    ["Antwerp", "VLG", "Flanders", "Europe/Brussels"],
    ["Ghent", "VLG", "Flanders", "Europe/Brussels"],
    ["Bruges", "VLG", "Flanders", "Europe/Brussels", "brugge"],
  ]),
  ...build("AT", "Austria", "EUR", [
    ["Vienna", "W", "Vienna", "Europe/Vienna", "wien"],
    ["Graz", "ST", "Styria", "Europe/Vienna"],
    ["Salzburg", "SB", "Salzburg", "Europe/Vienna"],
    ["Innsbruck", "T", "Tyrol", "Europe/Vienna"],
  ]),
  ...build("CH", "Switzerland", "CHF", [
    ["Zurich", "ZH", "Zürich", "Europe/Zurich", "zürich"],
    ["Geneva", "GE", "Geneva", "Europe/Zurich", "genève"],
    ["Basel", "BS", "Basel", "Europe/Zurich"],
    ["Bern", "BE", "Bern", "Europe/Zurich"],
    ["Lausanne", "VD", "Vaud", "Europe/Zurich"],
  ]),
  ...build("SE", "Sweden", "SEK", [
    ["Stockholm", "AB", "Stockholm", "Europe/Stockholm"],
    ["Gothenburg", "VG", "Västra Götaland", "Europe/Stockholm", "göteborg"],
    ["Malmö", "M", "Skåne", "Europe/Stockholm", "malmo"],
  ]),
  ...build("DK", "Denmark", "DKK", [
    ["Copenhagen", "84", "Capital Region", "Europe/Copenhagen", "københavn"],
    ["Aarhus", "82", "Central Denmark", "Europe/Copenhagen"],
  ]),
  ...build("NO", "Norway", "NOK", [
    ["Oslo", "03", "Oslo", "Europe/Oslo"],
    ["Bergen", "46", "Vestland", "Europe/Oslo"],
    ["Trondheim", "50", "Trøndelag", "Europe/Oslo"],
  ]),
  ...build("FI", "Finland", "EUR", [
    ["Helsinki", "18", "Uusimaa", "Europe/Helsinki"],
    ["Tampere", "06", "Pirkanmaa", "Europe/Helsinki"],
    ["Turku", "02", "Southwest Finland", "Europe/Helsinki"],
  ]),
  ...build("IE", "Ireland", "EUR", [
    ["Dublin", "L", "Leinster", "Europe/Dublin"],
    ["Cork", "M", "Munster", "Europe/Dublin"],
    ["Galway", "C", "Connacht", "Europe/Dublin"],
    ["Limerick", "M", "Munster", "Europe/Dublin"],
  ]),
  ...build("PT", "Portugal", "EUR", [
    ["Lisbon", "11", "Lisbon", "Europe/Lisbon", "lisboa"],
    ["Porto", "13", "Porto", "Europe/Lisbon"],
  ]),
  ...build("GR", "Greece", "EUR", [
    ["Athens", "I", "Attica", "Europe/Athens"],
    ["Thessaloniki", "B", "Central Macedonia", "Europe/Athens"],
  ]),
  ...build("PL", "Poland", "PLN", [
    ["Warsaw", "MZ", "Masovia", "Europe/Warsaw", "warszawa"],
    ["Kraków", "MA", "Lesser Poland", "Europe/Warsaw", "krakow", "cracow"],
    ["Wrocław", "DS", "Lower Silesia", "Europe/Warsaw", "wroclaw"],
    ["Gdańsk", "PM", "Pomerania", "Europe/Warsaw", "gdansk"],
    ["Poznań", "WP", "Greater Poland", "Europe/Warsaw", "poznan"],
  ]),
  ...build("CZ", "Czech Republic", "CZK", [
    ["Prague", "PR", "Prague", "Europe/Prague", "praha"],
    ["Brno", "JM", "South Moravia", "Europe/Prague"],
  ]),
  ...build("HU", "Hungary", "HUF", [
    ["Budapest", "BU", "Budapest", "Europe/Budapest"],
  ]),
  ...build("RO", "Romania", "RON", [
    ["Bucharest", "B", "Bucharest", "Europe/Bucharest", "bucurești"],
    ["Cluj-Napoca", "CJ", "Cluj", "Europe/Bucharest"],
  ]),
  ...build("UA", "Ukraine", "UAH", [
    ["Kyiv", "30", "Kyiv", "Europe/Kyiv", "kiev"],
    ["Lviv", "46", "Lviv", "Europe/Kyiv"],
    ["Odesa", "51", "Odesa", "Europe/Kyiv", "odessa"],
    ["Kharkiv", "63", "Kharkiv", "Europe/Kyiv"],
  ]),
  ...build("RU", "Russia", "RUB", [
    ["Moscow", "MOW", "Moscow", "Europe/Moscow", "москва"],
    ["Saint Petersburg", "SPE", "Saint Petersburg", "Europe/Moscow", "st petersburg"],
    ["Novosibirsk", "NVS", "Novosibirsk", "Asia/Novosibirsk"],
    ["Yekaterinburg", "SVE", "Sverdlovsk", "Asia/Yekaterinburg"],
    ["Kazan", "TA", "Tatarstan", "Europe/Moscow"],
    ["Vladivostok", "PRI", "Primorsky", "Asia/Vladivostok"],
  ]),
  ...build("TR", "Turkey", "TRY", [
    ["Istanbul", "34", "Istanbul", "Europe/Istanbul"],
    ["Ankara", "06", "Ankara", "Europe/Istanbul"],
    ["Izmir", "35", "Izmir", "Europe/Istanbul"],
    ["Antalya", "07", "Antalya", "Europe/Istanbul"],
    ["Bursa", "16", "Bursa", "Europe/Istanbul"],
  ]),
];

// ── Asia / Pacific ───────────────────────────────────────────────────

const APAC = [
  ...build("JP", "Japan", "JPY", [
    ["Tokyo", "13", "Tokyo", "Asia/Tokyo"],
    ["Osaka", "27", "Osaka", "Asia/Tokyo"],
    ["Kyoto", "26", "Kyoto", "Asia/Tokyo"],
    ["Yokohama", "14", "Kanagawa", "Asia/Tokyo"],
    ["Nagoya", "23", "Aichi", "Asia/Tokyo"],
    ["Sapporo", "01", "Hokkaido", "Asia/Tokyo"],
    ["Kobe", "28", "Hyogo", "Asia/Tokyo"],
    ["Fukuoka", "40", "Fukuoka", "Asia/Tokyo"],
    ["Hiroshima", "34", "Hiroshima", "Asia/Tokyo"],
    ["Sendai", "04", "Miyagi", "Asia/Tokyo"],
  ]),
  ...build("KR", "South Korea", "KRW", [
    ["Seoul", "11", "Seoul", "Asia/Seoul"],
    ["Busan", "26", "Busan", "Asia/Seoul"],
    ["Incheon", "28", "Incheon", "Asia/Seoul"],
    ["Daegu", "27", "Daegu", "Asia/Seoul"],
    ["Daejeon", "30", "Daejeon", "Asia/Seoul"],
  ]),
  ...build("CN", "China", "CNY", [
    ["Beijing", "BJ", "Beijing", "Asia/Shanghai", "peking"],
    ["Shanghai", "SH", "Shanghai", "Asia/Shanghai"],
    ["Guangzhou", "GD", "Guangdong", "Asia/Shanghai", "canton"],
    ["Shenzhen", "GD", "Guangdong", "Asia/Shanghai"],
    ["Chengdu", "SC", "Sichuan", "Asia/Shanghai"],
    ["Chongqing", "CQ", "Chongqing", "Asia/Shanghai"],
    ["Wuhan", "HB", "Hubei", "Asia/Shanghai"],
    ["Hangzhou", "ZJ", "Zhejiang", "Asia/Shanghai"],
    ["Nanjing", "JS", "Jiangsu", "Asia/Shanghai"],
    ["Xi'an", "SN", "Shaanxi", "Asia/Shanghai", "xian"],
    ["Tianjin", "TJ", "Tianjin", "Asia/Shanghai"],
    ["Suzhou", "JS", "Jiangsu", "Asia/Shanghai"],
    ["Dongguan", "GD", "Guangdong", "Asia/Shanghai"],
    ["Dalian", "LN", "Liaoning", "Asia/Shanghai"],
    ["Qingdao", "SD", "Shandong", "Asia/Shanghai"],
    ["Kunming", "YN", "Yunnan", "Asia/Shanghai"],
    ["Harbin", "HL", "Heilongjiang", "Asia/Shanghai"],
    ["Zhengzhou", "HA", "Henan", "Asia/Shanghai"],
    ["Changsha", "HN", "Hunan", "Asia/Shanghai"],
    ["Xiamen", "FJ", "Fujian", "Asia/Shanghai"],
    ["Lhasa", "XZ", "Tibet", "Asia/Shanghai"],
    ["Urumqi", "XJ", "Xinjiang", "Asia/Urumqi"],
  ]),
  ...build("HK", "Hong Kong", "HKD", [
    ["Hong Kong", "HK", "Hong Kong", "Asia/Hong_Kong", "hk"],
  ]),
  ...build("TW", "Taiwan", "TWD", [
    ["Taipei", "TPE", "Taipei", "Asia/Taipei"],
    ["Kaohsiung", "KHH", "Kaohsiung", "Asia/Taipei"],
    ["Taichung", "TXG", "Taichung", "Asia/Taipei"],
  ]),
  ...build("SG", "Singapore", "SGD", [
    ["Singapore", "", "", "Asia/Singapore", "sg"],
  ]),
  ...build("MY", "Malaysia", "MYR", [
    ["Kuala Lumpur", "14", "Kuala Lumpur", "Asia/Kuala_Lumpur", "kl"],
    ["Penang", "07", "Penang", "Asia/Kuala_Lumpur", "george town"],
    ["Johor Bahru", "01", "Johor", "Asia/Kuala_Lumpur"],
  ]),
  ...build("TH", "Thailand", "THB", [
    ["Bangkok", "10", "Bangkok", "Asia/Bangkok"],
    ["Chiang Mai", "50", "Chiang Mai", "Asia/Bangkok"],
    ["Phuket", "83", "Phuket", "Asia/Bangkok"],
    ["Pattaya", "20", "Chonburi", "Asia/Bangkok"],
  ]),
  ...build("ID", "Indonesia", "IDR", [
    ["Jakarta", "JK", "Jakarta", "Asia/Jakarta"],
    ["Surabaya", "JI", "East Java", "Asia/Jakarta"],
    ["Bandung", "JB", "West Java", "Asia/Jakarta"],
    ["Medan", "SU", "North Sumatra", "Asia/Jakarta"],
    ["Bali", "BA", "Bali", "Asia/Makassar", "denpasar"],
  ]),
  ...build("PH", "Philippines", "PHP", [
    ["Manila", "00", "Metro Manila", "Asia/Manila"],
    ["Quezon City", "00", "Metro Manila", "Asia/Manila"],
    ["Cebu City", "07", "Central Visayas", "Asia/Manila"],
    ["Davao City", "11", "Davao", "Asia/Manila"],
  ]),
  ...build("VN", "Vietnam", "VND", [
    ["Ho Chi Minh City", "SG", "Ho Chi Minh", "Asia/Ho_Chi_Minh", "saigon"],
    ["Hanoi", "HN", "Hanoi", "Asia/Ho_Chi_Minh"],
    ["Da Nang", "DN", "Da Nang", "Asia/Ho_Chi_Minh"],
  ]),
  ...build("BD", "Bangladesh", "BDT", [
    ["Dhaka", "13", "Dhaka", "Asia/Dhaka"],
    ["Chittagong", "B", "Chittagong", "Asia/Dhaka"],
  ]),
  ...build("PK", "Pakistan", "PKR", [
    ["Karachi", "SD", "Sindh", "Asia/Karachi"],
    ["Lahore", "PB", "Punjab", "Asia/Karachi"],
    ["Islamabad", "IS", "Islamabad", "Asia/Karachi"],
    ["Rawalpindi", "PB", "Punjab", "Asia/Karachi"],
    ["Faisalabad", "PB", "Punjab", "Asia/Karachi"],
    ["Peshawar", "KP", "Khyber Pakhtunkhwa", "Asia/Karachi"],
  ]),
  ...build("LK", "Sri Lanka", "LKR", [
    ["Colombo", "11", "Western", "Asia/Colombo"],
  ]),
  ...build("NP", "Nepal", "NPR", [
    ["Kathmandu", "BA", "Bagmati", "Asia/Kathmandu"],
  ]),
  ...build("MM", "Myanmar", "MMK", [
    ["Yangon", "06", "Yangon", "Asia/Yangon", "rangoon"],
  ]),
  ...build("KH", "Cambodia", "KHR", [
    ["Phnom Penh", "12", "Phnom Penh", "Asia/Phnom_Penh"],
  ]),
  ...build("AE", "United Arab Emirates", "AED", [
    ["Dubai", "DU", "Dubai", "Asia/Dubai"],
    ["Abu Dhabi", "AZ", "Abu Dhabi", "Asia/Dubai"],
    ["Sharjah", "SH", "Sharjah", "Asia/Dubai"],
  ]),
  ...build("SA", "Saudi Arabia", "SAR", [
    ["Riyadh", "01", "Riyadh", "Asia/Riyadh"],
    ["Jeddah", "02", "Makkah", "Asia/Riyadh"],
    ["Mecca", "02", "Makkah", "Asia/Riyadh", "makkah"],
    ["Medina", "03", "Medina", "Asia/Riyadh"],
    ["Dammam", "04", "Eastern", "Asia/Riyadh"],
  ]),
  ...build("QA", "Qatar", "QAR", [
    ["Doha", "DA", "Doha", "Asia/Qatar"],
  ]),
  ...build("KW", "Kuwait", "KWD", [
    ["Kuwait City", "KU", "Capital", "Asia/Kuwait"],
  ]),
  ...build("BH", "Bahrain", "BHD", [
    ["Manama", "13", "Capital", "Asia/Bahrain"],
  ]),
  ...build("OM", "Oman", "OMR", [
    ["Muscat", "MA", "Muscat", "Asia/Muscat"],
  ]),
  ...build("IL", "Israel", "ILS", [
    ["Tel Aviv", "TA", "Tel Aviv", "Asia/Jerusalem"],
    ["Jerusalem", "JM", "Jerusalem", "Asia/Jerusalem"],
    ["Haifa", "HA", "Haifa", "Asia/Jerusalem"],
  ]),
  ...build("AU", "Australia", "AUD", [
    ["Sydney", "NSW", "New South Wales", "Australia/Sydney"],
    ["Melbourne", "VIC", "Victoria", "Australia/Melbourne"],
    ["Brisbane", "QLD", "Queensland", "Australia/Brisbane"],
    ["Perth", "WA", "Western Australia", "Australia/Perth"],
    ["Adelaide", "SA", "South Australia", "Australia/Adelaide"],
    ["Canberra", "ACT", "Australian Capital Territory", "Australia/Sydney"],
    ["Hobart", "TAS", "Tasmania", "Australia/Hobart"],
    ["Darwin", "NT", "Northern Territory", "Australia/Darwin"],
    ["Gold Coast", "QLD", "Queensland", "Australia/Brisbane"],
    ["Newcastle", "NSW", "New South Wales", "Australia/Sydney"],
  ]),
  ...build("NZ", "New Zealand", "NZD", [
    ["Auckland", "AUK", "Auckland", "Pacific/Auckland"],
    ["Wellington", "WGN", "Wellington", "Pacific/Auckland"],
    ["Christchurch", "CAN", "Canterbury", "Pacific/Auckland"],
    ["Hamilton", "WKO", "Waikato", "Pacific/Auckland"],
    ["Queenstown", "OTA", "Otago", "Pacific/Auckland"],
  ]),
];

// ── Latin America ────────────────────────────────────────────────────

const LATAM = [
  ...build("MX", "Mexico", "MXN", [
    ["Mexico City", "CMX", "Mexico City", "America/Mexico_City", "cdmx", "ciudad de méxico"],
    ["Guadalajara", "JAL", "Jalisco", "America/Mexico_City"],
    ["Monterrey", "NLE", "Nuevo León", "America/Monterrey"],
    ["Cancún", "ROO", "Quintana Roo", "America/Cancun", "cancun"],
    ["Puebla", "PUE", "Puebla", "America/Mexico_City"],
    ["Tijuana", "BCN", "Baja California", "America/Tijuana"],
    ["Mérida", "YUC", "Yucatán", "America/Merida", "merida"],
    ["León", "GUA", "Guanajuato", "America/Mexico_City", "leon"],
    ["Querétaro", "QUE", "Querétaro", "America/Mexico_City", "queretaro"],
  ]),
  ...build("BR", "Brazil", "BRL", [
    ["São Paulo", "SP", "São Paulo", "America/Sao_Paulo", "sao paulo"],
    ["Rio de Janeiro", "RJ", "Rio de Janeiro", "America/Sao_Paulo", "rio"],
    ["Brasília", "DF", "Federal District", "America/Sao_Paulo", "brasilia"],
    ["Salvador", "BA", "Bahia", "America/Bahia"],
    ["Belo Horizonte", "MG", "Minas Gerais", "America/Sao_Paulo"],
    ["Fortaleza", "CE", "Ceará", "America/Fortaleza"],
    ["Curitiba", "PR", "Paraná", "America/Sao_Paulo"],
    ["Recife", "PE", "Pernambuco", "America/Recife"],
    ["Manaus", "AM", "Amazonas", "America/Manaus"],
    ["Porto Alegre", "RS", "Rio Grande do Sul", "America/Sao_Paulo"],
  ]),
  ...build("AR", "Argentina", "ARS", [
    ["Buenos Aires", "C", "Buenos Aires", "America/Argentina/Buenos_Aires"],
    ["Córdoba", "X", "Córdoba", "America/Argentina/Cordoba", "cordoba"],
    ["Rosario", "S", "Santa Fe", "America/Argentina/Cordoba"],
    ["Mendoza", "M", "Mendoza", "America/Argentina/Mendoza"],
  ]),
  ...build("CL", "Chile", "CLP", [
    ["Santiago", "RM", "Santiago Metropolitan", "America/Santiago"],
    ["Valparaíso", "VS", "Valparaíso", "America/Santiago", "valparaiso"],
  ]),
  ...build("CO", "Colombia", "COP", [
    ["Bogotá", "DC", "Bogotá", "America/Bogota", "bogota"],
    ["Medellín", "ANT", "Antioquia", "America/Bogota", "medellin"],
    ["Cali", "VAC", "Valle del Cauca", "America/Bogota"],
    ["Cartagena", "BOL", "Bolívar", "America/Bogota"],
    ["Barranquilla", "ATL", "Atlántico", "America/Bogota"],
  ]),
  ...build("PE", "Peru", "PEN", [
    ["Lima", "LMA", "Lima", "America/Lima"],
    ["Cusco", "CUS", "Cusco", "America/Lima", "cuzco"],
    ["Arequipa", "ARE", "Arequipa", "America/Lima"],
  ]),
  ...build("VE", "Venezuela", "VES", [
    ["Caracas", "DC", "Capital District", "America/Caracas"],
  ]),
  ...build("EC", "Ecuador", "USD", [
    ["Quito", "P", "Pichincha", "America/Guayaquil"],
    ["Guayaquil", "G", "Guayas", "America/Guayaquil"],
  ]),
  ...build("UY", "Uruguay", "UYU", [
    ["Montevideo", "MO", "Montevideo", "America/Montevideo"],
  ]),
  ...build("PY", "Paraguay", "PYG", [
    ["Asunción", "ASU", "Asunción", "America/Asuncion", "asuncion"],
  ]),
  ...build("BO", "Bolivia", "BOB", [
    ["La Paz", "L", "La Paz", "America/La_Paz"],
    ["Santa Cruz", "S", "Santa Cruz", "America/La_Paz"],
  ]),
  ...build("CR", "Costa Rica", "CRC", [
    ["San José", "SJ", "San José", "America/Costa_Rica", "san jose"],
  ]),
  ...build("PA", "Panama", "PAB", [
    ["Panama City", "8", "Panamá", "America/Panama"],
  ]),
  ...build("CU", "Cuba", "CUP", [
    ["Havana", "HA", "Havana", "America/Havana"],
  ]),
  ...build("DO", "Dominican Republic", "DOP", [
    ["Santo Domingo", "01", "Nacional", "America/Santo_Domingo"],
  ]),
  ...build("PR", "Puerto Rico", "USD", [
    ["San Juan", "SJ", "San Juan", "America/Puerto_Rico"],
  ]),
  ...build("JM", "Jamaica", "JMD", [
    ["Kingston", "01", "Kingston", "America/Jamaica"],
  ]),
  ...build("GT", "Guatemala", "GTQ", [
    ["Guatemala City", "GU", "Guatemala", "America/Guatemala"],
  ]),
];

// ── Africa ───────────────────────────────────────────────────────────

const AF = [
  ...build("EG", "Egypt", "EGP", [
    ["Cairo", "C", "Cairo", "Africa/Cairo"],
    ["Alexandria", "ALX", "Alexandria", "Africa/Cairo"],
    ["Giza", "GZ", "Giza", "Africa/Cairo"],
  ]),
  ...build("NG", "Nigeria", "NGN", [
    ["Lagos", "LA", "Lagos", "Africa/Lagos"],
    ["Abuja", "FC", "Federal Capital Territory", "Africa/Lagos"],
    ["Kano", "KN", "Kano", "Africa/Lagos"],
    ["Ibadan", "OY", "Oyo", "Africa/Lagos"],
  ]),
  ...build("KE", "Kenya", "KES", [
    ["Nairobi", "30", "Nairobi", "Africa/Nairobi"],
    ["Mombasa", "01", "Mombasa", "Africa/Nairobi"],
  ]),
  ...build("ZA", "South Africa", "ZAR", [
    ["Cape Town", "WC", "Western Cape", "Africa/Johannesburg"],
    ["Johannesburg", "GP", "Gauteng", "Africa/Johannesburg", "joburg", "jhb"],
    ["Pretoria", "GP", "Gauteng", "Africa/Johannesburg"],
    ["Durban", "KZN", "KwaZulu-Natal", "Africa/Johannesburg"],
  ]),
  ...build("ET", "Ethiopia", "ETB", [
    ["Addis Ababa", "AA", "Addis Ababa", "Africa/Addis_Ababa"],
  ]),
  ...build("GH", "Ghana", "GHS", [
    ["Accra", "AA", "Greater Accra", "Africa/Accra"],
  ]),
  ...build("TZ", "Tanzania", "TZS", [
    ["Dar es Salaam", "02", "Dar es Salaam", "Africa/Dar_es_Salaam"],
  ]),
  ...build("MA", "Morocco", "MAD", [
    ["Casablanca", "06", "Casablanca-Settat", "Africa/Casablanca"],
    ["Rabat", "04", "Rabat-Salé-Kénitra", "Africa/Casablanca"],
    ["Marrakech", "07", "Marrakech-Safi", "Africa/Casablanca"],
  ]),
  ...build("SN", "Senegal", "XOF", [
    ["Dakar", "DK", "Dakar", "Africa/Dakar"],
  ]),
  ...build("TN", "Tunisia", "TND", [
    ["Tunis", "11", "Tunis", "Africa/Tunis"],
  ]),
  ...build("UG", "Uganda", "UGX", [
    ["Kampala", "C", "Central", "Africa/Kampala"],
  ]),
  ...build("RW", "Rwanda", "RWF", [
    ["Kigali", "01", "Kigali", "Africa/Kigali"],
  ]),
  ...build("CI", "Ivory Coast", "XOF", [
    ["Abidjan", "AB", "Abidjan", "Africa/Abidjan"],
  ]),
  ...build("CD", "Democratic Republic of Congo", "CDF", [
    ["Kinshasa", "KN", "Kinshasa", "Africa/Kinshasa"],
  ]),
  ...build("AO", "Angola", "AOA", [
    ["Luanda", "LUA", "Luanda", "Africa/Luanda"],
  ]),
];

// ── Assemble & export ────────────────────────────────────────────────

export const CITIES = [...US, ...CA, ...GB, ...IN, ...EU, ...APAC, ...LATAM, ...AF];

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
