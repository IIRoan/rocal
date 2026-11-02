import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

type Rgba = [number, number, number, number];
type Vars = Record<string, string>;

const REPO = join(__dirname, "../../../..");
const WEB_CSS = readFileSync(join(REPO, "apps/web/app/globals.css"), "utf8");
const MAIL_CSS = readFileSync(join(REPO, "packages/ui/src/solace/theme.css"), "utf8");

function encode(linear: number): number {
  const x = Math.min(1, Math.max(0, linear));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function oklchToRgba(l: number, c: number, h: number, alpha: number): Rgba {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encode(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    encode(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    encode(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
    alpha,
  ];
}

function parseColor(raw: string, vars: Vars): Rgba {
  const value = raw.trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref?.[1]) return parseColor(resolve(vars, ref[1]), vars);
  const oklch = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (oklch) return oklchToRgba(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]), oklch[4] ? Number(oklch[4]) : 1);
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`Unparseable color ${value}`);
}

function resolve(vars: Vars, name: string): string {
  const value = vars[name];
  if (value === undefined) throw new Error(`Undefined token ${name}`);
  return value;
}

function block(css: string, selector: RegExp): Vars {
  const match = selector.exec(css);
  if (!match) throw new Error(`Missing block ${selector}`);
  const start = css.indexOf("{", match.index);
  let depth = 0;
  let end = start;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    else if (css[end] === "}" && --depth === 0) break;
  }
  const vars: Vars = {};
  for (const [, name, value] of css.slice(start + 1, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) vars[name] = value.replace(/\s+/g, " ").trim();
  }
  return vars;
}

function composite(fg: Rgba, bg: Rgba): Rgba {
  return [0, 1, 2].map((i) => (fg[i] ?? 0) * fg[3] + (bg[i] ?? 0) * (1 - fg[3])).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(vars: Vars, fg: string, bg: string, page: string): number {
  const base = parseColor(resolve(vars, page), vars);
  const background = composite(parseColor(resolve(vars, bg), vars), base);
  const foreground = composite(parseColor(resolve(vars, fg), vars), background);
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const webLight = block(WEB_CSS, /^:root\s*\{/m);
const webDark = { ...webLight, ...block(WEB_CSS, /^\.dark\s*\{/m) };
const mailLightBlock = block(MAIL_CSS, /^html:has\(\[data-solace\]/m);
const mailLight = { ...webLight, ...mailLightBlock };
const mailDark = { ...webDark, ...mailLightBlock, ...block(MAIL_CSS, /^html\.dark:has/m) };

const EVENTS = ["sky", "violet", "orange", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo", "pink", "teal"];
const SURFACES = ["--background", "--card", "--popover", "--muted"];

const WEB_TEXT: Array<[string, string[]]> = [
  ["--foreground", ["--background", "--card", "--popover"]],
  ["--muted-foreground", [...SURFACES, "--hover", "--input"]],
  ["--accent", [...SURFACES, "--hover"]],
  ["--accent-foreground", ["--accent"]],
  ["--secondary-foreground", ["--secondary"]],
  ["--hover-foreground", ["--hover"]],
  ["--destructive", [...SURFACES, "--hover"]],
  ["--destructive-foreground", ["--destructive"]],
  ["--success", SURFACES],
  ["--warning", SURFACES],
  ["--info", SURFACES],
  ["--sidebar-foreground", ["--sidebar"]],
  ["--sidebar-hover-foreground", ["--sidebar-hover"]],
  ...EVENTS.map((e): [string, string[]] => [`--event-${e}-foreground`, [`--event-${e}`]]),
];
const WEB_NON_TEXT: Array<[string, string[]]> = [
  ["--input-border", ["--background", "--card", "--popover"]],
  ["--ring", ["--background", "--card", "--popover"]],
];
const MAIL_BACKGROUNDS = ["--bg-main-container", "--bg-sidepanel", "--bg-l2-solid", "--bg-l3-solid", "--bg-cell-unread", "--bg-cell-hover", "--bg-cell-active"];
const MAIL_TEXT = ["--text-primary", "--text-secondary", "--text-tertiary", "--text-link", "--text-destructive"];
const MAIL_LABELS = ["orange", "green", "pink", "yellow", "blue", "red", "dark-blue"].map((c) => `--accent-${c}-primary`);

function cases(pairs: Array<[string, string[]]>) {
  return pairs.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg] as const));
}

describe.each([
  ["light", webLight],
  ["dark", webDark],
])("web tokens (%s)", (_theme, vars) => {
  it.each(cases(WEB_TEXT))("%s on %s reaches 4.5:1 (1.4.3)", (fg, bg) => {
    expect(contrast(vars, fg, bg, "--background")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(cases(WEB_NON_TEXT))("%s on %s reaches 3:1 (1.4.11)", (fg, bg) => {
    expect(contrast(vars, fg, bg, "--background")).toBeGreaterThanOrEqual(3);
  });
});

describe.each([
  ["light", mailLight],
  ["dark", mailDark],
])("mail tokens (%s)", (_theme, vars) => {
  it.each(MAIL_BACKGROUNDS.flatMap((bg) => [...MAIL_TEXT, ...MAIL_LABELS].map((fg) => [fg, bg] as const)))(
    "%s on %s reaches 4.5:1 (1.4.3)",
    (fg, bg) => {
      expect(contrast(vars, fg, bg, "--bg-main-container")).toBeGreaterThanOrEqual(4.5);
    },
  );
});
