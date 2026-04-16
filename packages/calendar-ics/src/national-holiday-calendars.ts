export type CalendarKind = "owned" | "subscribed" | "public_holiday";

export interface NationalHolidayCalendarCatalogEntry {
  id: string;
  label: string;
  countryName: string;
  language?: string;
  provider: "thunderbird";
  kind: "public_holiday";
  url: string;
  defaultColor: string;
}

const THUNDERBIRD_BASE_URL = "https://www.thunderbird.net";
const DEFAULT_PUBLIC_HOLIDAY_COLOR = "#ef5a3c";

function entry(
  id: string,
  label: string,
  countryName: string,
  path: string,
  language?: string,
): NationalHolidayCalendarCatalogEntry {
  return {
    id,
    label,
    countryName,
    language,
    provider: "thunderbird",
    kind: "public_holiday",
    url: `${THUNDERBIRD_BASE_URL}${path}`,
    defaultColor: DEFAULT_PUBLIC_HOLIDAY_COLOR,
  };
}

export const NATIONAL_HOLIDAY_CALENDARS: readonly NationalHolidayCalendarCatalogEntry[] =
  [
    entry(
      "thunderbird-albania",
      "Albania",
      "Albania",
      "/media/caldata/autogen/AlbaniaHolidays.ics",
    ),
    entry(
      "thunderbird-algeria-arabic",
      "Algeria (Arabic)",
      "Algeria",
      "/media/caldata/autogen/AlgeriaHolidaysArabic.ics",
      "Arabic",
    ),
    entry(
      "thunderbird-algeria-french",
      "Algeria (French)",
      "Algeria",
      "/media/caldata/autogen/AlgeriaHolidays.ics",
      "French",
    ),
    entry(
      "thunderbird-argentina",
      "Argentina",
      "Argentina",
      "/media/caldata/autogen/ArgentinaHolidays.ics",
    ),
    entry(
      "thunderbird-armenia",
      "Armenia",
      "Armenia",
      "/media/caldata/autogen/ArmeniaHolidays.ics",
    ),
    entry(
      "thunderbird-australia",
      "Australia",
      "Australia",
      "/media/caldata/autogen/AustraliaHolidays.ics",
    ),
    entry(
      "thunderbird-austria",
      "Austria",
      "Austria",
      "/media/caldata/autogen/AustrianHolidays.ics",
    ),
    entry(
      "thunderbird-belgium-dutch",
      "Belgium (Dutch)",
      "Belgium",
      "/media/caldata/autogen/BelgianHolidays.ics",
      "Dutch",
    ),
    entry(
      "thunderbird-belgium-french",
      "Belgium (French)",
      "Belgium",
      "/media/caldata/autogen/BelgianHolidaysFrench.ics",
      "French",
    ),
    entry(
      "thunderbird-bolivia",
      "Bolivia",
      "Bolivia",
      "/media/caldata/autogen/BoliviaHolidays.ics",
    ),
    entry(
      "thunderbird-brazil",
      "Brazil",
      "Brazil",
      "/media/caldata/autogen/BrazilHolidays.ics",
    ),
    entry(
      "thunderbird-bulgaria",
      "Bulgaria",
      "Bulgaria",
      "/media/caldata/autogen/BulgarianHolidays.ics",
    ),
    entry(
      "thunderbird-canada-english",
      "Canada (English)",
      "Canada",
      "/media/caldata/autogen/CanadaHolidays.ics",
      "English",
    ),
    entry(
      "thunderbird-canada-french",
      "Canada (French)",
      "Canada",
      "/media/caldata/autogen/CanadaHolidaysFrench.ics",
      "French",
    ),
    entry(
      "thunderbird-chile",
      "Chile",
      "Chile",
      "/media/caldata/autogen/ChileHolidays.ics",
    ),
    entry(
      "thunderbird-china",
      "China",
      "China",
      "/media/caldata/autogen/ChinaHolidays.ics",
    ),
    entry(
      "thunderbird-colombia",
      "Colombia",
      "Colombia",
      "/media/caldata/autogen/ColombianHolidays.ics",
    ),
    entry(
      "thunderbird-costa-rica",
      "Costa Rica",
      "Costa Rica",
      "/media/caldata/autogen/CostaRicaHolidays.ics",
    ),
    entry(
      "thunderbird-croatia",
      "Croatia",
      "Croatia",
      "/media/caldata/autogen/CroatiaHolidays.ics",
    ),
    entry(
      "thunderbird-czech-republic",
      "Czech Republic",
      "Czech Republic",
      "/media/caldata/autogen/CzechHolidays.ics",
    ),
    entry(
      "thunderbird-denmark",
      "Denmark",
      "Denmark",
      "/media/caldata/autogen/DenmarkHolidays.ics",
    ),
    entry(
      "thunderbird-dominican-republic",
      "Dominican Republic",
      "Dominican Republic",
      "/media/caldata/autogen/DominicanRepublicHolidays.ics",
    ),
    entry(
      "thunderbird-estonia",
      "Estonia",
      "Estonia",
      "/media/caldata/autogen/EstoniaHolidays.ics",
    ),
    entry(
      "thunderbird-finland-finnish",
      "Finland (Finnish)",
      "Finland",
      "/media/caldata/autogen/FinlandHolidays.ics",
      "Finnish",
    ),
    entry(
      "thunderbird-finland-swedish",
      "Finland (Swedish)",
      "Finland",
      "/media/caldata/autogen/FinlandHolidaysSwedish.ics",
      "Swedish",
    ),
    entry(
      "thunderbird-france",
      "France",
      "France",
      "/media/caldata/autogen/FrenchHolidays.ics",
    ),
    entry(
      "thunderbird-germany",
      "Germany",
      "Germany",
      "/media/caldata/autogen/GermanHolidays.ics",
    ),
    entry(
      "thunderbird-greece",
      "Greece",
      "Greece",
      "/media/caldata/autogen/GreeceHolidays.ics",
    ),
    entry(
      "thunderbird-guyana",
      "Guyana",
      "Guyana",
      "/media/caldata/autogen/GuyanaHolidays.ics",
    ),
    entry(
      "thunderbird-haiti",
      "Haiti",
      "Haiti",
      "/media/caldata/autogen/HaitiHolidays.ics",
    ),
    entry(
      "thunderbird-hong-kong",
      "Hong Kong",
      "Hong Kong",
      "/media/caldata/autogen/HongKongHolidays.ics",
    ),
    entry(
      "thunderbird-hungary",
      "Hungary",
      "Hungary",
      "/media/caldata/autogen/HungarianHolidays.ics",
    ),
    entry(
      "thunderbird-iceland",
      "Iceland",
      "Iceland",
      "/media/caldata/autogen/IcelandHolidays.ics",
    ),
    entry(
      "thunderbird-india",
      "India",
      "India",
      "/media/caldata/autogen/IndiaHolidays.ics",
    ),
    entry(
      "thunderbird-indonesia",
      "Indonesia",
      "Indonesia",
      "/media/caldata/autogen/IndonesiaHolidays.ics",
    ),
    entry(
      "thunderbird-ireland-english",
      "Ireland (English)",
      "Ireland",
      "/media/caldata/autogen/IrelandHolidays.ics",
      "English",
    ),
    entry(
      "thunderbird-ireland-irish",
      "Ireland (Irish)",
      "Ireland",
      "/media/caldata/autogen/IrelandHolidaysIrish.ics",
      "Irish",
    ),
    entry(
      "thunderbird-israel",
      "Israel",
      "Israel",
      "/media/caldata/autogen/IsraelHolidays.ics",
    ),
    entry(
      "thunderbird-italy",
      "Italy",
      "Italy",
      "/media/caldata/autogen/ItalianHolidays.ics",
    ),
    entry(
      "thunderbird-japan",
      "Japan",
      "Japan",
      "/media/caldata/autogen/JapanHolidays.ics",
    ),
    entry(
      "thunderbird-kazakhstan",
      "Kazakhstan",
      "Kazakhstan",
      "/media/caldata/autogen/KazakhstanHolidaysEnglish.ics",
    ),
    entry(
      "thunderbird-kenya",
      "Kenya",
      "Kenya",
      "/media/caldata/autogen/KenyaHolidays.ics",
    ),
    entry(
      "thunderbird-latvia",
      "Latvia",
      "Latvia",
      "/media/caldata/autogen/LatviaHolidays.ics",
    ),
    entry(
      "thunderbird-lebanon",
      "Lebanon",
      "Lebanon",
      "/media/caldata/autogen/LebanonHolidays.ics",
    ),
    entry(
      "thunderbird-liechtenstein",
      "Liechtenstein",
      "Liechtenstein",
      "/media/caldata/autogen/LiechtensteinHolidays.ics",
    ),
    entry(
      "thunderbird-lithuania",
      "Lithuania",
      "Lithuania",
      "/media/caldata/autogen/LithuanianHolidays.ics",
    ),
    entry(
      "thunderbird-luxembourg-french",
      "Luxembourg (French)",
      "Luxembourg",
      "/media/caldata/autogen/LuxembourgHolidaysFrench.ics",
      "French",
    ),
    entry(
      "thunderbird-luxembourg-german",
      "Luxembourg (German)",
      "Luxembourg",
      "/media/caldata/autogen/LuxembourgHolidaysGerman.ics",
      "German",
    ),
    entry(
      "thunderbird-malaysia",
      "Malaysia",
      "Malaysia",
      "/media/caldata/autogen/MalaysiaHolidays.ics",
    ),
    entry(
      "thunderbird-malta",
      "Malta",
      "Malta",
      "/media/caldata/autogen/MaltaHolidays.ics",
    ),
    entry(
      "thunderbird-mexico",
      "Mexico",
      "Mexico",
      "/media/caldata/autogen/MexicoHolidays.ics",
    ),
    entry(
      "thunderbird-morocco",
      "Morocco",
      "Morocco",
      "/media/caldata/autogen/MoroccoHolidays.ics",
    ),
    entry(
      "thunderbird-namibia",
      "Namibia",
      "Namibia",
      "/media/caldata/autogen/NamibiaHolidays.ics",
    ),
    entry(
      "thunderbird-netherlands-dutch",
      "Netherlands (Dutch)",
      "Netherlands",
      "/media/caldata/autogen/DutchHolidays.ics",
      "Dutch",
    ),
    entry(
      "thunderbird-netherlands-english",
      "Netherlands (English)",
      "Netherlands",
      "/media/caldata/autogen/DutchHolidaysEnglish.ics",
      "English",
    ),
    entry(
      "thunderbird-netherlands-french",
      "Netherlands (French)",
      "Netherlands",
      "/media/caldata/autogen/DutchHolidaysFrench.ics",
      "French",
    ),
    entry(
      "thunderbird-netherlands-german",
      "Netherlands (German)",
      "Netherlands",
      "/media/caldata/autogen/DutchHolidaysGerman.ics",
      "German",
    ),
    entry(
      "thunderbird-new-zealand",
      "New Zealand",
      "New Zealand",
      "/media/caldata/autogen/NewZealandHolidays.ics",
    ),
    entry(
      "thunderbird-nicaragua",
      "Nicaragua",
      "Nicaragua",
      "/media/caldata/autogen/NicaraguaHolidays.ics",
    ),
    entry(
      "thunderbird-norway",
      "Norway",
      "Norway",
      "/media/caldata/autogen/NorwegianHolidays.ics",
    ),
    entry(
      "thunderbird-pakistan",
      "Pakistan",
      "Pakistan",
      "/media/caldata/autogen/PakistanHolidays.ics",
    ),
    entry(
      "thunderbird-peru",
      "Peru",
      "Peru",
      "/media/caldata/autogen/PeruHolidays.ics",
    ),
    entry(
      "thunderbird-philippines",
      "Philippines",
      "Philippines",
      "/media/caldata/autogen/PhilippinesHolidays.ics",
    ),
    entry(
      "thunderbird-poland",
      "Poland",
      "Poland",
      "/media/caldata/autogen/PolishHolidays.ics",
    ),
    entry(
      "thunderbird-portugal",
      "Portugal",
      "Portugal",
      "/media/caldata/autogen/PortugalHolidays.ics",
    ),
    entry(
      "thunderbird-puerto-rico",
      "Puerto Rico",
      "Puerto Rico",
      "/media/caldata/autogen/PuertoRicoHolidays.ics",
    ),
    entry(
      "thunderbird-romania",
      "Romania",
      "Romania",
      "/media/caldata/autogen/RomaniaHolidays.ics",
    ),
    entry(
      "thunderbird-russia",
      "Russia",
      "Russia",
      "/media/caldata/autogen/RussiaHolidays.ics",
    ),
    entry(
      "thunderbird-singapore",
      "Singapore",
      "Singapore",
      "/media/caldata/autogen/SingaporeHolidays.ics",
    ),
    entry(
      "thunderbird-slovakia",
      "Slovakia",
      "Slovakia",
      "/media/caldata/autogen/SlovakHolidays.ics",
    ),
    entry(
      "thunderbird-slovenia",
      "Slovenia",
      "Slovenia",
      "/media/caldata/autogen/SlovenianHolidays.ics",
    ),
    entry(
      "thunderbird-south-africa",
      "South Africa",
      "South Africa",
      "/media/caldata/autogen/SouthAfricaHolidays.ics",
    ),
    entry(
      "thunderbird-south-korea",
      "South Korea",
      "South Korea",
      "/media/caldata/autogen/SouthKoreaHolidays.ics",
    ),
    entry(
      "thunderbird-spain",
      "Spain",
      "Spain",
      "/media/caldata/autogen/SpainHolidays.ics",
    ),
    entry(
      "thunderbird-sri-lanka",
      "Sri Lanka",
      "Sri Lanka",
      "/media/caldata/autogen/SriLankaHolidays.ics",
    ),
    entry(
      "thunderbird-sweden",
      "Sweden",
      "Sweden",
      "/media/caldata/autogen/SwedishHolidays.ics",
    ),
    entry(
      "thunderbird-switzerland",
      "Switzerland",
      "Switzerland",
      "/media/caldata/autogen/SwissHolidays.ics",
    ),
    entry(
      "thunderbird-taiwan",
      "Taiwan",
      "Taiwan",
      "/media/caldata/autogen/TaiwanHolidays.ics",
    ),
    entry(
      "thunderbird-thailand",
      "Thailand",
      "Thailand",
      "/media/caldata/autogen/ThailandHolidays.ics",
    ),
    entry(
      "thunderbird-trinidad-and-tobago",
      "Trinidad and Tobago",
      "Trinidad and Tobago",
      "/media/caldata/autogen/TrinidadandTobagoHolidays.ics",
    ),
    entry(
      "thunderbird-turkey",
      "Turkey",
      "Turkey",
      "/media/caldata/autogen/TurkeyHolidays.ics",
    ),
    entry(
      "thunderbird-ukraine",
      "Ukraine",
      "Ukraine",
      "/media/caldata/autogen/UkraineHolidays.ics",
    ),
    entry(
      "thunderbird-united-kingdom",
      "United Kingdom",
      "United Kingdom",
      "/media/caldata/autogen/UKHolidays.ics",
    ),
    entry(
      "thunderbird-united-states",
      "United States",
      "United States",
      "/media/caldata/autogen/USHolidays.ics",
    ),
    entry(
      "thunderbird-uruguay",
      "Uruguay",
      "Uruguay",
      "/media/caldata/autogen/UruguayHolidays.ics",
    ),
    entry(
      "thunderbird-vietnam",
      "Vietnam",
      "Vietnam",
      "/media/caldata/autogen/VietnamHolidays.ics",
    ),
  ];

const normalizeCatalogUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
};

const NATIONAL_HOLIDAY_CALENDAR_BY_URL = new Map(
  NATIONAL_HOLIDAY_CALENDARS.map((holidayCalendar) => [
    normalizeCatalogUrl(holidayCalendar.url),
    holidayCalendar,
  ]),
);

export function findNationalHolidayCalendarByUrl(
  url: string,
): NationalHolidayCalendarCatalogEntry | undefined {
  try {
    return NATIONAL_HOLIDAY_CALENDAR_BY_URL.get(
      normalizeCatalogUrl(url.trim()),
    );
  } catch {
    return undefined;
  }
}
