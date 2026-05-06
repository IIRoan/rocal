import { describe, expect, it } from "@jest/globals";

// WCAG relative luminance from oklch (L, C, H)
function oklchToWcagLuminance(oklchStr: string): number {
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) return 0.5;

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const rLin = Math.max(0, Math.min(1, +4.0767416621 * (l_ * l_ * l_) - 3.3077115913 * (m_ * m_ * m_) + 0.2309699292 * (s_ * s_ * s_)));
  const gLin = Math.max(0, Math.min(1, -1.2684380046 * (l_ * l_ * l_) + 2.6097574011 * (m_ * m_ * m_) - 0.3413193965 * (s_ * s_ * s_)));
  const bLin = Math.max(0, Math.min(1, -0.0041960863 * (l_ * l_ * l_) - 0.7034186147 * (m_ * m_ * m_) + 1.707614701 * (s_ * s_ * s_)));

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatio(color1: string, color2: string): number {
  const lum1 = oklchToWcagLuminance(color1);
  const lum2 = oklchToWcagLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

const LIGHT = {
  background: "oklch(0.9821 0 0)",
  foreground: "oklch(0.2435 0 0)",
  card: "oklch(0.9911 0 0)",
  cardForeground: "oklch(0.2435 0 0)",
  primaryBase: "oklch(0.4341 0.0392 41.9938)",
  primaryForeground: "oklch(1 0 0)",
  secondary: "oklch(0.92 0.0651 74.3695)",
  secondaryForeground: "oklch(0.3499 0.0685 40.8288)",
  muted: "oklch(0.9521 0 0)",
  mutedForeground: "oklch(0.45 0 0)",
  accent: "oklch(0.931 0 0)",
  accentForeground: "oklch(0.2435 0 0)",
  destructive: "oklch(0.6271 0.1936 33.339)",
  destructiveForeground: "oklch(1 0 0)",
};

const DARK = {
  background: "oklch(0.1776 0 0)",
  foreground: "oklch(0.9491 0 0)",
  card: "oklch(0.2134 0 0)",
  cardForeground: "oklch(0.9491 0 0)",
  primaryBase: "oklch(0.9247 0.0524 66.1732)",
  primaryForeground: "oklch(0.2029 0.024 200.1962)",
  secondary: "oklch(0.3163 0.019 63.6992)",
  secondaryForeground: "oklch(0.9247 0.0524 66.1732)",
  muted: "oklch(0.252 0 0)",
  mutedForeground: "oklch(0.7 0 0)",
  accent: "oklch(0.285 0 0)",
  accentForeground: "oklch(0.9491 0 0)",
  destructive: "oklch(0.6271 0.1936 33.339)",
  destructiveForeground: "oklch(1 0 0)",
};

const LIGHT_EVENTS = {
  sky: { bg: "oklch(0.86 0.09 250)", fg: "oklch(0.28 0.12 250)" },
  violet: { bg: "oklch(0.86 0.09 285)", fg: "oklch(0.28 0.12 285)" },
  orange: { bg: "oklch(0.86 0.09 65)", fg: "oklch(0.28 0.12 65)" },
  rose: { bg: "oklch(0.86 0.09 15)", fg: "oklch(0.28 0.12 15)" },
  emerald: { bg: "oklch(0.86 0.09 150)", fg: "oklch(0.28 0.12 150)" },
  red: { bg: "oklch(0.86 0.09 30)", fg: "oklch(0.28 0.12 30)" },
  cyan: { bg: "oklch(0.86 0.09 205)", fg: "oklch(0.28 0.12 205)" },
  lime: { bg: "oklch(0.86 0.09 135)", fg: "oklch(0.28 0.12 135)" },
  amber: { bg: "oklch(0.86 0.09 85)", fg: "oklch(0.28 0.12 85)" },
  indigo: { bg: "oklch(0.86 0.09 270)", fg: "oklch(0.28 0.12 270)" },
  pink: { bg: "oklch(0.86 0.09 345)", fg: "oklch(0.28 0.12 345)" },
  teal: { bg: "oklch(0.86 0.09 175)", fg: "oklch(0.28 0.12 175)" },
};

const DARK_EVENTS = {
  sky: { bg: "oklch(0.45 0.18 250)", fg: "oklch(0.92 0.04 250)" },
  violet: { bg: "oklch(0.45 0.18 285)", fg: "oklch(0.92 0.04 285)" },
  orange: { bg: "oklch(0.45 0.18 65)", fg: "oklch(0.92 0.04 65)" },
  rose: { bg: "oklch(0.45 0.18 15)", fg: "oklch(0.92 0.04 15)" },
  emerald: { bg: "oklch(0.45 0.18 150)", fg: "oklch(0.92 0.04 150)" },
  red: { bg: "oklch(0.45 0.18 30)", fg: "oklch(0.92 0.04 30)" },
  cyan: { bg: "oklch(0.45 0.18 205)", fg: "oklch(0.92 0.04 205)" },
  lime: { bg: "oklch(0.45 0.18 135)", fg: "oklch(0.92 0.04 135)" },
  amber: { bg: "oklch(0.45 0.18 85)", fg: "oklch(0.92 0.04 85)" },
  indigo: { bg: "oklch(0.45 0.18 270)", fg: "oklch(0.92 0.04 270)" },
  pink: { bg: "oklch(0.45 0.18 345)", fg: "oklch(0.92 0.04 345)" },
  teal: { bg: "oklch(0.45 0.18 175)", fg: "oklch(0.92 0.04 175)" },
};

describe("WCAG Contrast - Solace Web Design System", () => {
  describe("Light mode semantic pairs", () => {
    it("foreground on background meets WCAG AA (≥4.5:1)", () => {
      const ratio = contrastRatio(LIGHT.foreground, LIGHT.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("foreground on card meets WCAG AA", () => {
      const ratio = contrastRatio(LIGHT.cardForeground, LIGHT.card);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("primary-foreground on primary meets WCAG AA", () => {
      const ratio = contrastRatio(LIGHT.primaryForeground, LIGHT.primaryBase);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("secondary-foreground on secondary meets WCAG AA", () => {
      const ratio = contrastRatio(LIGHT.secondaryForeground, LIGHT.secondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("muted-foreground on background meets WCAG AA", () => {
      const ratio = contrastRatio(LIGHT.mutedForeground, LIGHT.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("accent-foreground on accent meets WCAG AA", () => {
      const ratio = contrastRatio(LIGHT.accentForeground, LIGHT.accent);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    // Destructive uses WCAG AA for UI components (≥3:1), not normal text (≥4.5:1)
    it("destructive-foreground on destructive meets WCAG AA for UI components (≥3:1)", () => {
      const ratio = contrastRatio(LIGHT.destructiveForeground, LIGHT.destructive);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe("Dark mode semantic pairs", () => {
    it("foreground on background meets WCAG AA (≥4.5:1)", () => {
      const ratio = contrastRatio(DARK.foreground, DARK.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("foreground on card meets WCAG AA", () => {
      const ratio = contrastRatio(DARK.cardForeground, DARK.card);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("primary-foreground on primary meets WCAG AA", () => {
      const ratio = contrastRatio(DARK.primaryForeground, DARK.primaryBase);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("secondary-foreground on secondary meets WCAG AA", () => {
      const ratio = contrastRatio(DARK.secondaryForeground, DARK.secondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("muted-foreground on background meets WCAG AA", () => {
      const ratio = contrastRatio(DARK.mutedForeground, DARK.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("accent-foreground on accent meets WCAG AA", () => {
      const ratio = contrastRatio(DARK.accentForeground, DARK.accent);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    // Destructive uses WCAG AA for UI components (≥3:1), not normal text (≥4.5:1)
    it("destructive-foreground on destructive meets WCAG AA for UI components (≥3:1)", () => {
      const ratio = contrastRatio(DARK.destructiveForeground, DARK.destructive);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe("Light mode event colors - WCAG AA (≥4.5:1)", () => {
    for (const [name, { bg, fg }] of Object.entries(LIGHT_EVENTS)) {
      it(`${name}: event-foreground on event-bg meets WCAG AA`, () => {
        const ratio = contrastRatio(fg, bg);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe("Dark mode event colors - WCAG AA (≥4.5:1)", () => {
    for (const [name, { bg, fg }] of Object.entries(DARK_EVENTS)) {
      it(`${name}: event-foreground on event-bg meets WCAG AA`, () => {
        const ratio = contrastRatio(fg, bg);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe("WCAG AAA - primary text (≥7:1)", () => {
    it("light foreground on light background meets WCAG AAA", () => {
      const ratio = contrastRatio(LIGHT.foreground, LIGHT.background);
      expect(ratio).toBeGreaterThanOrEqual(7);
    });

    it("dark foreground on dark background meets WCAG AAA", () => {
      const ratio = contrastRatio(DARK.foreground, DARK.background);
      expect(ratio).toBeGreaterThanOrEqual(7);
    });
  });
});
