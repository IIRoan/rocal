import { lightTheme, darkTheme, type CalendarColor } from "../index";

// ─── WCAG Helpers ────────────────────────────────────────────────────────────

function oklchToLinearSrgb(oklchStr: string): { r: number; g: number; b: number } {
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) return { r: 0.5, g: 0.5, b: 0.5 };

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = Math.max(0, +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const gLin = Math.max(0, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const bLin = Math.max(0, -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);

  return { r: Math.min(1, rLin), g: Math.min(1, gLin), b: Math.min(1, bLin) };
}

function wcagRelativeLuminance(oklchStr: string): number {
  const { r, g, b } = oklchToLinearSrgb(oklchStr);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fg: string, bg: string): number {
  const fgLum = wcagRelativeLuminance(fg);
  const bgLum = wcagRelativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

const ALL_CALENDAR_COLORS: CalendarColor[] = [
  "blue", "orange", "violet", "rose", "emerald", "red",
  "cyan", "lime", "amber", "indigo", "pink", "teal",
];

const WCAG_AA = 4.5;
const WCAG_AAA = 7.0;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("WCAG AA: semantic color pairs - light theme", () => {
  const c = lightTheme.colors;

  it("foreground on background ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("foreground on card ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.foreground, c.card)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("primaryForeground on primaryBase ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.primaryForeground, c.primaryBase)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("secondaryForeground on secondary ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.secondaryForeground, c.secondary)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("mutedForeground on background ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.mutedForeground, c.background)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("accentForeground on accent ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.accentForeground, c.accent)).toBeGreaterThanOrEqual(WCAG_AA);
  });

});

describe("WCAG AA: semantic color pairs - dark theme", () => {
  const c = darkTheme.colors;

  it("foreground on background ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("foreground on card ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.foreground, c.card)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("primaryForeground on primaryBase ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.primaryForeground, c.primaryBase)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("secondaryForeground on secondary ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.secondaryForeground, c.secondary)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("mutedForeground on background ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.mutedForeground, c.background)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("accentForeground on accent ≥ 4.5:1", () => {
    expect(wcagContrastRatio(c.accentForeground, c.accent)).toBeGreaterThanOrEqual(WCAG_AA);
  });
});

describe("WCAG AA: calendar event colors - light theme", () => {
  for (const color of ALL_CALENDAR_COLORS) {
    it(`${color}: fg on bg ≥ 4.5:1`, () => {
      const { fg, bg } = lightTheme.colors.calendar[color];
      expect(wcagContrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA);
    });
  }
});

describe("WCAG AA: calendar event colors - dark theme", () => {
  for (const color of ALL_CALENDAR_COLORS) {
    it(`${color}: fg on bg ≥ 4.5:1`, () => {
      const { fg, bg } = darkTheme.colors.calendar[color];
      expect(wcagContrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA);
    });
  }
});

describe("WCAG AAA: primary text pairs", () => {
  it("light theme: foreground on background ≥ 7:1", () => {
    const c = lightTheme.colors;
    expect(wcagContrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(WCAG_AAA);
  });

  it("dark theme: foreground on background ≥ 7:1", () => {
    const c = darkTheme.colors;
    expect(wcagContrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(WCAG_AAA);
  });
});
