//! `findNationalHolidayCalendarByUrl` in `@workspace/calendar-ics`: the Thunderbird holiday feeds the apps offer become public holiday calendars.

use url::Url;

use crate::http::zod::js_trim;

const FEED_PREFIX: &str = "https://www.thunderbird.net/media/caldata/autogen/";
/// Every catalog entry's `defaultColor`.
pub const DEFAULT_COLOR: &str = "#ef5a3c";

const FEEDS: [&str; 86] = [
    "AlbaniaHolidays",
    "AlgeriaHolidaysArabic",
    "AlgeriaHolidays",
    "ArgentinaHolidays",
    "ArmeniaHolidays",
    "AustraliaHolidays",
    "AustrianHolidays",
    "BelgianHolidays",
    "BelgianHolidaysFrench",
    "BoliviaHolidays",
    "BrazilHolidays",
    "BulgarianHolidays",
    "CanadaHolidays",
    "CanadaHolidaysFrench",
    "ChileHolidays",
    "ChinaHolidays",
    "ColombianHolidays",
    "CostaRicaHolidays",
    "CroatiaHolidays",
    "CzechHolidays",
    "DenmarkHolidays",
    "DominicanRepublicHolidays",
    "EstoniaHolidays",
    "FinlandHolidays",
    "FinlandHolidaysSwedish",
    "FrenchHolidays",
    "GermanHolidays",
    "GreeceHolidays",
    "GuyanaHolidays",
    "HaitiHolidays",
    "HongKongHolidays",
    "HungarianHolidays",
    "IcelandHolidays",
    "IndiaHolidays",
    "IndonesiaHolidays",
    "IrelandHolidays",
    "IrelandHolidaysIrish",
    "IsraelHolidays",
    "ItalianHolidays",
    "JapanHolidays",
    "KazakhstanHolidaysEnglish",
    "KenyaHolidays",
    "LatviaHolidays",
    "LebanonHolidays",
    "LiechtensteinHolidays",
    "LithuanianHolidays",
    "LuxembourgHolidaysFrench",
    "LuxembourgHolidaysGerman",
    "MalaysiaHolidays",
    "MaltaHolidays",
    "MexicoHolidays",
    "MoroccoHolidays",
    "NamibiaHolidays",
    "DutchHolidays",
    "DutchHolidaysEnglish",
    "DutchHolidaysFrench",
    "DutchHolidaysGerman",
    "NewZealandHolidays",
    "NicaraguaHolidays",
    "NorwegianHolidays",
    "PakistanHolidays",
    "PeruHolidays",
    "PhilippinesHolidays",
    "PolishHolidays",
    "PortugalHolidays",
    "PuertoRicoHolidays",
    "RomaniaHolidays",
    "RussiaHolidays",
    "SingaporeHolidays",
    "SlovakHolidays",
    "SlovenianHolidays",
    "SouthAfricaHolidays",
    "SouthKoreaHolidays",
    "SpainHolidays",
    "SriLankaHolidays",
    "SwedishHolidays",
    "SwissHolidays",
    "TaiwanHolidays",
    "ThailandHolidays",
    "TrinidadandTobagoHolidays",
    "TurkeyHolidays",
    "UkraineHolidays",
    "UKHolidays",
    "USHolidays",
    "UruguayHolidays",
    "VietnamHolidays",
];

/// Whether the URL, without query, fragment and trailing slashes, is a catalog feed.
pub fn is_national_holiday_calendar(raw: &str) -> bool {
    let Ok(mut url) = Url::parse(js_trim(raw)) else {
        return false;
    };
    url.set_fragment(None);
    url.set_query(None);
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(&path);
    url.as_str()
        .strip_prefix(FEED_PREFIX)
        .and_then(|file| file.strip_suffix(".ics"))
        .is_some_and(|name| FEEDS.contains(&name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_urls_match_after_normalizing() {
        for url in [
            "https://www.thunderbird.net/media/caldata/autogen/DutchHolidays.ics",
            " https://WWW.thunderbird.net:443/media/caldata/autogen/USHolidays.ics/?x=1#y ",
        ] {
            assert!(is_national_holiday_calendar(url), "{url}");
        }
        for url in [
            "webcal://www.thunderbird.net/media/caldata/autogen/DutchHolidays.ics",
            "https://www.thunderbird.net.example/media/caldata/autogen/DutchHolidays.ics",
            "https://user@www.thunderbird.net/media/caldata/autogen/DutchHolidays.ics",
            "https://www.thunderbird.net/media/caldata/autogen/Unknown.ics",
            "not a url",
        ] {
            assert!(!is_national_holiday_calendar(url), "{url}");
        }
    }
}
