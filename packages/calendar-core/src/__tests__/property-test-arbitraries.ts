import fc from "fast-check";

const MIN_BASE_DATE_MS = new Date(2000, 0, 1).getTime();
const MAX_BASE_DATE_MS = new Date(2099, 11, 31, 23, 59, 59, 999).getTime();

/**
 * Calendar dates for property tests. Uses integer timestamps instead of
 * `fc.date()` so invalid Date values (NaN) never reach date-fns helpers.
 */
export const validBaseDateArb: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_BASE_DATE_MS, max: MAX_BASE_DATE_MS })
  .map((ms) => {
    const normalized = new Date(ms);
    normalized.setHours(12, 0, 0, 0);
    return normalized;
  });

const HOSTILE_HTML_TOKENS = [
  "<a ", "<img ", "<div>", "</div>", "<p>", "<table ", "<td ", "<span ", "<font ", "<blockquote>",
  "<style>", "</style>", "<script>", "</script>", "<svg>", "</svg>", "<math>", "<iframe ", "</iframe>",
  "<template>", "</template>", "<noscript>", "</noscript>", "<plaintext>", "<base ", "<meta ", "<form ",
  "<textarea>", "<title>", "</", "<", ">", "/>", "<!--", "-->", "<![CDATA[", "]]>", "<?", "<!",
  " href=", " src=", " background=", " cite=", " style=", " onclick=", " onerror=", " srcset=",
  " formaction=", " xlink:href=", " data-x=", " title=", "=", "\"", "'", " ",
  "javascript:", "java\tscript:", "&#106;avascript:", "&#x6a;", "&colon;", "&Tab;", "JaVaScRiPt:",
  "vbscript:", "data:text/html,", "data:image/png;base64,AA", "data:image/svg+xml,", "https://e.test/?utm_source=x",
  "//e.test", "\\\\e.test", "cid:x", "blob:x", "mailto:a@b.test", "tel:1",
  "expression(", "url(", "\\3c", "\\65 xpression(", "-moz-binding", "behavior:", "/*", "*/", "{", "}",
  "\u0000", " ", "&amp;", "&lt;", "&quot;",
];

/** Markup soup mixing tags, attributes, script URLs and CSS vectors with random text. */
export const hostileHtmlArb: fc.Arbitrary<string> = fc
  .array(fc.oneof(fc.constantFrom(...HOSTILE_HTML_TOKENS), fc.string({ maxLength: 8 })), { maxLength: 60 })
  .map((parts) => parts.join(""));

const MIME_SOUP_TOKENS = [
  'Content-Type: multipart/mixed; boundary="b"\r\n',
  "Content-Type: multipart/alternative; boundary=b\r\n",
  'Content-Type: multipart/related; boundary="b"\r\n',
  'Content-Type: multipart/mixed; boundary="b"; boundary="c"\r\n',
  "Content-Type: text/plain; charset=utf-8\r\n",
  "Content-Type: text/html; charset=iso-8859-1\r\n",
  "Content-Type: text/plain; format=flowed; delsp=yes\r\n",
  "Content-Type: message/rfc822\r\n",
  'Content-Type: application/pdf; name="=?utf-8?B?w6k=?="\r\n',
  "Content-Disposition: attachment; filename*=utf-8''%C3%A9\r\n",
  'Content-Disposition: attachment; filename*0="a"; filename*1="b"\r\n',
  "Content-Disposition: inline\r\n",
  "Content-ID: <x>\r\n",
  "Content-Transfer-Encoding: base64\r\n",
  "Content-Transfer-Encoding: quoted-printable\r\n",
  "Content-Transfer-Encoding: 8bit\r\n",
  "--b\r\n", "--b--\r\n", "--c\r\n", "\r\n", "\r\n\r\n", "\n", " ", "\t",
  "=\r\n", "=C3=A9", "=3", "=?utf-8?Q?caf=C3=A9?=", "=?utf-8?B?Y2Fmw6k=?=", "=?bogus?X?y?=",
  "SGVsbG8=", "<p>hi</p>", "<!--", "x".repeat(200), "é", "😀", "\ud83d",
];

/** MIME fragments: headers, boundaries, transfer encodings, encoded words and long lines. */
export const mimeSoupArb: fc.Arbitrary<string> = fc
  .array(fc.oneof(fc.constantFrom(...MIME_SOUP_TOKENS), fc.string({ maxLength: 8 })), { maxLength: 40 })
  .map((parts) => parts.join(""));

const ICS_TEXT_UNIT = fc.oneof(
  fc.constantFrom(",", ";", "\\", "\n", ":", " ", "é", "😀", "\u{1f1f3}\u{1f1f1}"),
  fc.string({ minLength: 1, maxLength: 1 }),
);
const icsTextArb = fc.array(ICS_TEXT_UNIT, { maxLength: 40 }).map((parts) => parts.join(""));
const ICS_ROUND_TRIP_TIMEZONES = [
  "UTC", "Europe/Amsterdam", "America/New_York", "Asia/Kolkata",
  "America/St_Johns", "Australia/Lord_Howe", "Pacific/Chatham",
] as const;
const MINUTE_MS = 60_000;
const ICS_START_MIN = Date.UTC(2000, 0, 1) / MINUTE_MS;
const ICS_START_MAX = Date.UTC(2099, 11, 1) / MINUTE_MS;

/** `IcsBuildEventInput` values within the range a Solace event can hold. */
export const icsEventArb = fc
  .record({
    title: icsTextArb.filter((value) => value.trim().length > 0),
    description: icsTextArb,
    location: icsTextArb,
    startMinute: fc.integer({ min: ICS_START_MIN, max: ICS_START_MAX }),
    durationMinutes: fc.integer({ min: 1, max: 10_080 }),
    allDay: fc.boolean(),
    timezone: fc.constantFrom(...ICS_ROUND_TRIP_TIMEZONES),
    recurrence: fc.option(
      fc.record({
        frequency: fc.constantFrom("daily" as const, "weekly" as const, "monthly" as const, "yearly" as const),
        interval: fc.integer({ min: 1, max: 4 }),
        end: fc.oneof(
          fc.record({ count: fc.integer({ min: 1, max: 20 }) }),
          fc.record({ untilDays: fc.integer({ min: 1, max: 400 }) }),
        ),
        byWeekDay: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 7 }),
      }),
      { nil: undefined },
    ),
  })
  .map(({ startMinute, durationMinutes, recurrence, ...event }) => {
    const start = new Date(startMinute * MINUTE_MS);
    return {
      ...event,
      start,
      end: new Date(start.getTime() + durationMinutes * MINUTE_MS),
      recurrence: recurrence && {
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        count: "count" in recurrence.end ? recurrence.end.count : undefined,
        until:
          "untilDays" in recurrence.end
            ? new Date(start.getTime() + recurrence.end.untilDays * 86_400_000).toISOString()
            : undefined,
        byWeekDay: recurrence.byWeekDay.length > 0 ? [...recurrence.byWeekDay].sort((a, b) => a - b) : undefined,
      },
    };
  });
