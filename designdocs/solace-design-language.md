# Solace Design Language

> Extracted April 15, 2026 across all product routes
> (~50,000 elements analyzed, 7 routes: /, /mail, /calendar, /drive, /pages, /pricing, /login)

---

## 1. Design Identity

Solace uses a **Tailwind CSS** design system with four custom font families and a coral-red primary color. The hallmark visual trait is **weight 380 headings with negative letter-spacing**, producing a tight editorial aesthetic. Each product sub-app shifts its dark-mode accent color to match its identity (mail = ice blue, calendar = green, drive = green, pages = teal), while light mode remains visually consistent.

---

## 2. Color System

### 2.1 Brand Colors

| Token | Hex | HSL | Role |
|-------|-----|-----|------|
| `primary` | `#ef5a3c` | hsl(10, 85%, 59%) | CTAs, brand emphasis, links |
| `secondary` | `#19c77f` | hsl(155, 78%, 44%) | Success, privacy, secondary CTAs |

### 2.2 Accent Palette

Each accent color maps to a product or semantic context:

| Token | Hex | Context |
|-------|-----|---------|
| `accent-pink` | `#ef95c2` | Calendar events, highlights |
| `accent-blue` | `#4ab7ee` | Info links, drive indicators |
| `accent-purple` | `#87afff` | Decorative, secondary UI |
| `accent-gold` | `#dfab0e` | Warnings, premium features |
| `accent-yellow` | `#ffcb30` | Badges, star indicators (mail) |
| `accent-teal` | `#2797cf` | Pages/editor links, pricing features |
| `accent-green` | `#00a05e` | Success states, check marks |

### 2.3 Neutral Scale

| Token | Hex | Use |
|-------|-----|-----|
| `neutral-0` | `#000000` | Primary text (10,000+ uses), borders |
| `neutral-50` | `#242424` | Dark surfaces, dark-mode cards |
| `neutral-100` | `#303030` | Dark surfaces, login card bg |
| `neutral-200` | `#505050` | Borders, pricing tier dividers |
| `neutral-300` | `#707070` | Muted text, placeholders, captions |
| `neutral-400` | `#8f8f8f` | Captions, disabled text |
| `neutral-500` | `#afafaf` | Subtle borders, light text on white |
| `neutral-600` | `#cfcfcf` | Dividers |
| `neutral-700` | `#dfdfdf` | Card borders (9,700+ uses) |
| `neutral-800` | `#ebebeb` | Light dividers |
| `neutral-900` | `#f5f5f5` | Page backgrounds |
| `neutral-950` | `#ffffff` | Card surfaces, text on dark |

### 2.4 Surface Colors

| Token | Hex | Role |
|-------|-----|------|
| `surface` | `#ffffff` | Default page background |
| `surface-alt` | `#ffffff` | Alt page background |
| `surface-subtle` | `#efefef` | Section background |
| `surface-dark` | `#000000` | Dark mode page background |
| `surface-card` | `#ffffff` | Card background |
| `surface-card-dark` | `#303030` | Dark card background (login) |
| `surface-elevated` | `#292929` | Elevated dark surfaces (pricing) |

### 2.5 Tinted Surfaces (per accent)

| Accent | Light bg | Light text | Derived from |
|--------|----------|------------|--------------|
| Primary | `#ffebe7` | `#ff8e78` | `#ef5a3c` |
| Primary-muted | `#ffc3b7` | — | `#ef5a3c` |
| Secondary | `#bfffe5` | `#7cf7c4` | `#19c77f` |
| Blue | `#dff4ff` | `#b7e7ff` | `#4ab7ee` |
| Pink | `#ffd7eb` | `#ef95c2` | `#ef95c2` |
| Red | `#ffd7d7` | — | error |

### 2.6 Gradients

```css
/* Primary CTA */
--gradient-primary: linear-gradient(180deg, #ef5a3c 0%, #ed4f2f 100%);

/* Secondary CTA */
--gradient-secondary: linear-gradient(180deg, #0fba5b 0%, #34ac80 100%);

/* Info / Blue */
--gradient-blue: linear-gradient(180deg, #51c4fe 0%, #31afee 100%);

/* Pink / Calendar */
--gradient-pink: linear-gradient(180deg, #ef95c2 0%, #f087bc 100%);

/* Hero fade */
--gradient-hero: linear-gradient(#fff, transparent 400px);

/* Emphasis overlay (dark mode) */
--gradient-emphasis: linear-gradient(0deg, hsla(0,0%,100%,.16), hsla(0,0%,100%,.16)), #000;
```

### 2.7 Dark-Mode Accent Shift

Each product overrides the dark-mode accent:

| Context | `--color-dark-primary` | `--color-dark-secondary` |
|---------|----------------------|------------------------|
| Default | `#ef5a3c` | — |
| Mail | `#b7e7ff` | `#ef5a3c` |
| Calendar | `#00a05e` | `#ef5a3c` |
| Drive | `#19c77f` | `#00a05e` |
| Pages | `#ef5a3c` | `#2797cf` |
| Pricing | `#ef5a3c` | `#2797cf` |

---

## 3. Typography

### 3.1 Font Families

| Token | Family | Role |
|-------|--------|------|
| `font-display` | `__solaceSansDisplay` | Hero headlines |
| `font-body` | `__solaceSansText` | Body text, UI labels |
| `font-mono` | `__solaceMono` | Code, monospace content |
| `font-pixel` | `__solacePixel` | Decorative/retro accents |
| `font-serif` (fallback) | `Times New Roman` | Fallback body |

### 3.2 Type Scale

| Token | Size | Weight | Line-height | Letter-spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `text-hero` | 80px / 5rem | 400 | 120px | normal | Oversized display |
| `text-display` | 76px / 4.75rem | 380 | 54px | -0.76px | Full-width headlines |
| `text-h1` | 64px / 4rem | 380 | 60.8px | -0.64px | Page headlines |
| `text-h2` | 48px / 3rem | 380 | 52.8px | -0.48px | Section headlines |
| `text-h3` | 36px / 2.25rem | 380 | 43.2px | normal | Subsection headlines |
| `text-h4` | 20px / 1.25rem | 470 | 27px | -0.2px | Feature titles |
| `text-h4-alt` | 19px / 1.1875rem | 520 | 24.7px | normal | Compact sub-headings |
| `text-subtitle` | 28px / 1.75rem | 520 | 33.6px | normal | Lead paragraphs |
| `text-medium` | 17px / 1.0625rem | 380 | 22.95px | -0.17px | Medium body |
| `text-body` | 14px / 0.875rem | 380 | 18.2px | -0.07px | Default body |
| `text-body-lg` | 15px / 0.9375rem | 380 | 22.5px | -0.15px | Login body, dense lists |
| `text-small` | 13px / 0.8125rem | 470 | 19.5px | normal | Small UI labels |
| `text-caption` | 11px / 0.6875rem | 380 | 12px | 0.11px | Captions, badges |
| `text-caption-strong` | 11px / 0.6875rem | 520 | 12px | 0.11px | Emphasized captions |

### 3.3 Fluid Typography (CSS Custom Properties)

```css
--f900: clamp(20px, 3rem, 64px);   /* Hero → h1 */
--f800: clamp(18px, 2rem, 24px);   /* h2 → large body */
--f600: clamp(12px, 0.8rem, 16px); /* medium → body */
--f200: clamp(10px, 0.5rem, 14px); /* small → body */
```

### 3.4 Weight System

| Weight | Token | Usage |
|--------|-------|-------|
| 380 | `font-light` | **Primary** — all headings, body, labels |
| 400 | `font-normal` | Fallback body (Times New Roman) |
| 470 | `font-medium` | h4 variants, sub-headings |
| 520 | `font-semibold` | Compact headings, small labels |
| 700 | `font-bold` | Rare — only 3 uses site-wide |

---

## 4. Spacing

**Base unit:** 2px. All tokens are multiples of 2.

| Token | Value | Rem | Role |
|-------|-------|-----|------|
| `space-0` | 1px | 0.0625rem | Hairline |
| `space-1` | 4px | 0.25rem | Tight gap, icon padding |
| `space-2` | 8px | 0.5rem | Inner component padding |
| `space-3` | 12px | 0.75rem | Button horizontal padding |
| `space-4` | 16px | 1rem | Standard padding |
| `space-5` | 20px | 1.25rem | Card gap |
| `space-6` | 24px | 1.5rem | Section gap |
| `space-7` | 28px | 1.75rem | Between sections |
| `space-8` | 32px | 2rem | Large section gap |
| `space-9` | 36px | 2.25rem | Spacious section |
| `space-10` | 40px | 2.5rem | Feature spacing |
| `space-11` | 44px | 2.75rem | Between features |
| `space-12` | 48px | 3rem | Major section break |
| `space-16` | 64px | 4rem | Hero spacing |
| `space-20` | 80px | 5rem | Page section |
| `space-24` | 96px | 6rem | Major page break |
| `space-26` | 104px | 6.5rem | Product-page vertical rhythm |
| `space-32` | 128px | 8rem | Page-level spacing |
| `space-35` | 140px | 8.75rem | Maximum section gap |
| `space-36` | 144px | 9rem | Product-page maximum |
| `space-40` | 160px | 10rem | Marketing-page maximum |
| `space-54` | 215px | 13.4375rem | Home/pricing hero |

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-xs` | 2px | Inputs, small elements (278 uses) |
| `radius-sm` | 4px | Login inputs |
| `radius-md` | 6px | Standard cards, inputs (98 uses) |
| `radius-lg` | 10px | Larger cards, product cards |
| `radius-xl` | 14px | Pricing cards, CTA buttons |
| `radius-2xl` | 16px | Login card |
| `radius-pill` | 9999px | Pills, avatars, badges, primary CTAs |

---

## 6. Shadows

```css
--shadow-xs:   rgba(0,0,0,0.05) 0px 1px 2px 0px;                           /* subtle */
--shadow-sm:   rgba(0,0,0,0.1)  0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px;   /* standard */
--shadow-md:   rgba(0,0,0,0.1)  0px 4px 6px -1px, rgba(0,0,0,0.1) 0px 2px 4px -2px;  /* elevated */
--shadow-lg:   rgba(0,0,0,0.1) 0px 10px 15px -3px, rgba(0,0,0,0.1) 0px 4px 6px -4px; /* modal */
--shadow-xl:   rgba(0,0,0,0.1) 0px 20px 25px -5px, rgba(0,0,0,0.1) 0px 8px 10px -6px;/* popover */

--shadow-card:  rgba(0,0,0,0.1) 0px 1px 0px 0px inset,
                rgba(0,0,0,0.1) 0px -1px 0px 1px inset;                    /* card bevel (light) */

--shadow-card-dark: hsla(0,0%,100%,0.08) 0px 1px 0px 0px inset,
                    hsla(0,0%,100%,0.08) 0px -1px 0px 1px inset;            /* card bevel (dark) */

--shadow-pricing-dark: rgba(255,255,255,0.08) 0px 1px 0px 0px inset,
                       rgba(255,255,255,0.08) 0px -1px 0px 1px inset;       /* pricing card dark glow */

--shadow-icon-bevel: inset 0px -3px 0px 1px rgba(0,0,0,0.1),
                     inset 0px 1px 0px 1px hsla(0,0%,100%,0.5);             /* icon depth */

--shadow-page: 0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px rgb(0 0 0/6%),
               inset 0px -1px 2px rgba(0,0,0,0.1);                          /* page container */

--shadow-inner-highlight: rgba(0,0,0,0.1) 1px 1px 0px 0px inset;           /* inner glow */
```

---

## 7. Components

### 7.1 Button

**Default**
```css
background: #ffffff;
color: #000000;
font-size: 16px;
font-weight: 400;
padding: 6px 12px;
border-radius: 12px;
```

**CTA (larger, pricing/marketing)**
```css
background: #ffffff;
color: #000000;
font-size: 16px;
font-weight: 400;
padding: 8px 16px;
border-radius: 14px;
```

**Primary (gradient pill)**
```css
background: linear-gradient(180deg, #ef5a3c 0%, #ed4f2f 100%);
color: #ffffff;
border-radius: 9999px;
```

**Secondary (gradient pill)**
```css
background: linear-gradient(180deg, #0fba5b 0%, #34ac80 100%);
color: #ffffff;
border-radius: 9999px;
```

### 7.2 Card

**Light mode**
```css
background: #ffffff;
border-radius: 4px;
box-shadow: var(--shadow-card);
padding: 0 8px;
```

**Dark (login)**
```css
background: #303030;
border-radius: 16px;
box-shadow: var(--shadow-xl);
padding: 4px;
```

### 7.3 Link

```css
color: #000000;
font-size: 16px;
font-weight: 400;
```

### 7.4 Toast (Sonner)

```css
/* Entrance */
@keyframes sonner-fade-in {
  0%   { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}

/* Exit */
@keyframes sonner-fade-out {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
}

/* Loading spinner */
@keyframes sonner-spin {
  0%   { opacity: 1; }
  100% { opacity: 0.15; }
}
```

---

## 8. Layout

### 8.1 Container Widths

| Token | Value | Use |
|-------|-------|-----|
| `container-narrow` | 672px | Blog, docs, text content |
| `container-content` | 800px | Product content areas |
| `container-default` | 1000px | Standard page container |
| `container-full` | 100% | Full-width hero sections |

### 8.2 Grid

| Pattern | Usage | Context |
|---------|-------|---------|
| 3-column | 20x | Feature grids, pricing tiers |
| 2-column | 6x | Comparison layouts, split content |
| 8-column | 5x | Complex feature grids |
| 4-column | 1-2x | Pricing feature lists |
| 7-column | 1x | Calendar week view |
| 1-column | 3x | Single content sections |

```css
/* Standard 2-col */
grid-template-columns: 1fr 1fr;
gap: 20px;
max-width: 1046px;

/* Wide 2-col */
grid-template-columns: 1fr 1fr;
gap: 48px;
max-width: 1006px;
```

### 8.3 Flex

| Pattern | Frequency |
|---------|-----------|
| `row / nowrap` | 570-601x |
| `column / nowrap` | 378-397x |
| `row / wrap` | 6-7x |

### 8.4 Common Gaps

| Gap | Context |
|-----|---------|
| 2-4px | Tight spacing (icons, chips) |
| 8-12px | Inner component spacing |
| 16-20px | Standard inter-element |
| 24px | Card gaps, section spacing |
| 32px | Section breaks |
| 48px | Major section gaps |
| 64-80px | Hero spacing |

---

## 9. Breakpoints

| Token | Value | Type |
|-------|-------|------|
| `sm` | 640px | min-width |
| `md` | 768px | min-width |
| `lg` | 1024px | min-width |
| `xl` | 1280px | min-width |
| `2xl` | 1536px | min-width |

A `max-width: 600px` breakpoint is also used for mobile-specific overrides.

---

## 10. Motion

### 10.1 Easing

```css
--ease-out: cubic-bezier(0, 0, 0.2, 1);        /* primary — deceleration */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);   /* secondary — smooth */
```

### 10.2 Duration

```css
--duration-fast: 0.15s;    /* color changes, hovers */
--duration-normal: 0.2s;   /* transforms, layout shifts */
```

### 10.3 Transition Patterns

```css
/* Simple (spare usage) */
transition: all;

/* Transform */
transition: 0.2s cubic-bezier(0, 0, 0.2, 1);

/* Color hover */
transition: color 0.15s var(--ease-in-out),
            background-color 0.15s var(--ease-in-out),
            border-color 0.15s var(--ease-in-out),
            fill 0.15s var(--ease-in-out),
            stroke 0.15s var(--ease-in-out);
```

### 10.4 Keyframes

```css
@keyframes spin { 100% { transform: rotate(1turn); } }
@keyframes rotate { 100% { --angle: 360deg; } }

@keyframes wave {
  0%   { transform: rotate(0deg); }
  10%  { transform: rotate(14deg); }
  20%  { transform: rotate(-8deg); }
  30%  { transform: rotate(14deg); }
  40%  { transform: rotate(-4deg); }
  50%  { transform: rotate(10deg); }
  60%  { transform: rotate(0deg); }
  100% { transform: rotate(0deg); }
}

@keyframes swipe-out {
  0%   { transform: translateY(calc(var(--lift)*var(--offset) + var(--swipe-amount))); opacity: 1; }
  100% { transform: translateY(calc(var(--lift)*var(--offset) + var(--swipe-amount) + var(--lift)*-100%)); opacity: 0; }
}
```

---

## 11. CSS Custom Properties (site-native)

```css
:root {
  /* Overlays */
  --bg-emphasis: linear-gradient(0deg, hsla(0,0%,100%,.16), hsla(0,0%,100%,.16)), #000;
  --bg-overlay-primary: rgba(0,0,0,.1);
  --bg-overlay-secondary: rgba(0,0,0,.08);
  --bg-overlay-tertiary: rgba(0,0,0,.04);

  /* Card shadows */
  --shadow-secondary: inset 0px 1px 0px rgba(0,0,0,.1), inset 0px -1px 0px 1px rgba(0,0,0,.1);
  --shadow-secondary-dark: inset 0px 1px 0px hsla(0,0%,100%,.08), inset 0px -1px 0px 1px hsla(0,0%,100%,.08);

  /* Focus ring */
  --tw-ring-color: rgba(39,151,207,.5);
  --tw-ring-offset-color: #fff;

  /* Sizing */
  --cellSize: 90px;
  --gridBase: 3;

  /* Fluid type */
  --f900: clamp(20px,3rem,64px);
  --f800: clamp(18px,2rem,24px);
  --f600: clamp(12px,0.8rem,16px);
  --f200: clamp(10px,0.5rem,14px);

  /* Shadows */
  --shadow-page: 0px 1px 3px rgba(0,0,0,.1), 0px 1px 2px rgb(0 0 0/6%), inset 0px -1px 2px rgba(0,0,0,.1);
  --shadow-icon-bevel: inset 0px -3px 0px 1px rgba(0,0,0,.1), inset 0px 1px 0px 1px hsla(0,0%,100%,.5);
}
```

---

## 12. Accessibility (WCAG 2.1)

**Site-wide score: 95-96%** across product pages; **75%** on login.

### 12.1 Mandatory Contrast Rules

**ALL text must meet WCAG AA minimum contrast (4.5:1 for normal text, 3:1 for large text). There are no exceptions.**

**Critical rule: Never place dark text on a dark background.** The following combinations are **FORBIDDEN** and must never appear in any generated page:

| FORBIDDEN Combination | Contrast | Why |
|-----------------------|----------|-----|
| `#000000` text on `#000000` bg | 1:1 | Invisible text |
| `#000000` text on `#242424` bg | 1.35:1 | Invisible on dark surfaces |
| `#000000` text on `#303030` bg | 1.59:1 | Invisible on dark cards |
| `#000000` text on `#292929` bg | ~1.5:1 | Invisible on elevated surfaces |
| `#000000` text on any neutral-0/50/100 bg | <2:1 | All fail AA |
| `#242424` text on `#303030` bg | ~1.3:1 | Near-invisible |
| `#ffffff` text on `#ef5a3c` bg | 3.39:1 | Fails AA for normal text |

**Instead, always use:**

| Correct Combination | Contrast | Use case |
|---------------------|----------|----------|
| `#ffffff` text on `#000000` bg | 21:1 | Dark hero sections, dark surfaces |
| `#ffffff` text on `#242424` bg | 13.1:1 | Dark-mode cards |
| `#ffffff` text on `#303030` bg | 12.63:1 | Dark cards, login card |
| `#ffffff` text on `#292929` bg | 12.1:1 | Elevated dark surfaces |
| `#000000` text on `#ef5a3c` bg | 6.2:1 | Primary CTA buttons |
| `#000000` text on `#19c77f` bg | 9.52:1 | Secondary CTA buttons |
| `#000000` text on `#ffffff` bg | 21:1 | Light surfaces, page panel |
| `#505050` text on `#ffffff` bg | 7.33:1 | Muted body text on white |

**Decision rule for any text placement:**
1. If the background is dark (neutral-0 through neutral-200, or any surface-dark/surface-card-dark/surface-elevated), **text color must be #ffffff**.
2. If the background is light (neutral-600 through neutral-950, or any white/tinted surface), **text color must be #000000 or #505050**.
3. If the background is a brand/accent color, **use #000000 text** (all brand colors are bright enough for black text at AA pass).
4. When in doubt, calculate the contrast ratio. It must be ≥4.5:1 for body text, ≥3:1 for large/heading text.

### 12.2 Historical Contrast Failures (Now Fixed)

| Foreground | Background | Ratio | Fix |
|------------|------------|-------|-----|
| `#000000` | `#303030` | ~~1.59:1~~ **Fixed** → use `#ffffff` text on dark surfaces |
| `#ffffff` | `#ef5a3c` | 3.39:1 | Use `#000000` text on primary (6.2:1 AA pass) |
| `#ef5a3c` | `#f5f5f5` | ~~3.11:1~~ **Fixed** → use `#ef5a3c` on `#ffffff` surface instead |
| `#000000` | `#242424` | 1.35:1 | Use `#ffffff` text |
| `#afafaf` | `#ffffff` | 2.19:1 | Darken to `#505050` (7.33:1 AAA) |

### 12.3 Pricing-specific Failures

| Foreground | Background | Ratio | Fix |
|------------|------------|-------|-----|
| `#2797cf` | `#dff4ff` | 2.89:1 | Darken text to `#0b79af` |
| `#00a05e` | `#bfffe5` | 3.01:1 | Darken text to `#005c3a` |

---

## 13. Page Architecture & Composition

### 13.1 Navbar (Optional)

The navbar style is **not enforced** — pages may use any navigation approach that fits the context (top bar, sidebar, inline links, or no visible nav at all). The floating island style described below is one available option, not a requirement.

**Floating island navbar** (optional style — a macOS-style centered pill):
```css
position: fixed;
z-index: 9999;
width: 100%;
display: flex;
align-items: center;
justify-content: center;
background: transparent;

/* Inner island */
margin-top: 16px;
width: fit-content;
max-width: 91.67%;
border-radius: 16px;
background: #303030;
border: 1px solid #505050;
box-shadow: rgba(0,0,0,0.1) 0px 20px 25px -5px,
            rgba(0,0,0,0.1) 0px 8px 10px -6px;
padding: 4px;
gap: 24px;
```

**Tailwind class:** `mt-4 flex w-11/12 gap-6 rounded-2xl border border-solid border-gray-700 bg-gray-800 p-1 shadow-xl md:w-fit`

**Nav items:** white text on dark pill, 16px / 400 weight, with dropdown triggers for "Product" and "Resources".

### 13.2 App Mockup Panel

Each product page (mail, calendar, drive, pages) features a **full-width interactive app mockup** — a white panel with rounded top corners that appears to rise up from the content below.

```css
width: 100%;
background: #ffffff;
border-radius: 16px 16px 0 0;  /* rounded-t-2xl — rounded top, flat bottom */
border: 1px solid rgba(0,0,0,0.1);
border-bottom: none;            /* no bottom border */
overflow: hidden;
```

**Tailwind class:** `rounded-t-2xl border border-b-0 border-black border-opacity-10 bg-white overflow-hidden`

This creates a visual metaphor of the app "emerging" from the page — the flat bottom edge merges seamlessly into the next section.

### 13.3 Product Title (Hero)

Each product page has a large decorative product label in the hero area:

```
SOLACE MAIL        (uppercase, 14px, weight 380, mono font, white)
01                 (large decorative number, pixel font, ~80px)
Private, End-to-End Encrypted Mail    (headline)
Solace Mail protects your inbox...     (body)
```

**Product title style:**
```css
font-size: 14px;
font-weight: 380;
letter-spacing: -0.07px;
color: #ffffff;
text-transform: uppercase;
font-family: __solaceMono, monospace;   /* body-small font-mono */
```

**Section number (01, 02, etc.):**
```css
font-size: ~80px;          /* rendered via parent px-12 pt-9 text-[80px] */
font-family: __solacePixel; /* decorative pixel font */
color: rgba(255,255,255,0.3); /* subtle/watermark style */
```

### 13.4 Page Section Rhythm

Product pages follow a consistent vertical rhythm of alternating sections:

1. **Dark hero** (black/transparent bg) — product title, section number, headline, description
2. **App mockup panel** (white, rounded top only) — interactive product demo
3. **Light text section** (#fff bg, 80px top / 40px bottom padding) — feature description
4. **Feature card grid** (transparent bg) — 2-column cards with `solace-border-raised`
5. **Tinted accent section** — product-colored background at ~8-12% opacity
   - Mail: `rgba(0,149,194,0.08)` — blue tint
   - Mail alt: `rgba(255,142,120,0.12)` — coral tint
6. **Dark or light footer** — links in 4-column layout

**The alternating pattern:**
```
[black hero] → [white mockup (rounded top)] → [white text section] → [cards on transparent] → [tinted accent] → [repeat]
```

### 13.5 Feature Card Pattern

Cards on product pages use the `solace-border-raised` custom class:

```css
background: #fff;            /* white surface (WCAG AA fix) */
border-radius: 12px;      /* rounded-xl */
box-shadow: none;         /* solace-border-raised adds inset bevel */
padding: 28px 28px 0;     /* no bottom padding — content fills to edge */

/* solace-border-raised applies: */
box-shadow: rgba(0,0,0,0.1) 0px 1px 0px 0px inset,
            rgba(0,0,0,0.1) 0px -1px 0px 1px inset;
/* This creates a subtle 3D "raised paper" bevel effect */
```

**List-item cards** (inside feature cards):
```css
background: #ffffff;
border-radius: 8px;       /* rounded-lg */
padding: 16px;
/* same solace-border-raised bevel */
```

**Tailwind class (feature card):** `solace-border-raised rounded-xl bg-white px-7 pt-6`
**Tailwind class (list item):** `solace-border-raised rounded-lg bg-white p-4`

### 13.6 Pricing Card Pattern

Pricing uses a **border-only** (no shadow) card style with alternating backgrounds:

```css
/* Standard tier */
background: #ffffff;       /* or #FAFAFA for free tier */
border: 1px solid #EFEFEF;
border-radius: 6px;       /* rounded-md */
padding: 16px;

/* Featured/dark tier (Business) */
background: #292929;      /* surface-elevated */
border: 1px solid #EFEFEF;
border-radius: 6px;
padding: 16px;
color: #ffffff;
```

**Tailwind class:** `rounded-md border border-solid border-gray-100 p-4`

Cards are arranged in a 4-column grid (Free, Essential, Pro, Business).

### 13.7 Login Card

The login page uses a **centered dark card on light page**:

```css
background: #303030;      /* dark surface */
border-radius: 16px;      /* 2xl */
box-shadow: rgba(0,0,0,0.1) 0px 20px 25px -5px,
            rgba(0,0,0,0.1) 0px 8px 10px -6px;
padding: 4px;
color: #ffffff;
```

No grid layout — purely flex-based, centered on page. The card contains the Solace logo, email input, and CTA button.

### 13.8 Footer

```css
background: transparent;
padding: 28px 40px;
gap: 48px;
display: flex;
/* flex-row on desktop, flex-col on mobile */
border-top: none;
```

**Footer structure:** 4 columns — Products, Resources, Developer, Legal. Each column has a bold heading and plain text links.

### 13.9 CTA Button Styles on Pages

```css
/* Standard page CTA (dark pages) */
background: rgba(255,255,255,0.04);
border: 1px solid currentColor;
border-radius: 14px;        /* xl */
padding: 8px 16px;
color: inherit;
/* hover: opacity 0.8 */
```

```css
/* Primary gradient CTA */
background: linear-gradient(180deg, #ef5a3c 0%, #ed4f2f 100%);
color: #ffffff;
border-radius: 9999px;     /* pill */
padding: 8px 20px;
```

### 13.10 Decorative Elements

- **Gradient fade at page top:** `linear-gradient(#fff, transparent 400px)` — white fade
- **Tinted accent sections:** colored at 8-12% opacity for visual variety without overwhelming
- **Icon bevels:** `inset -3px 1px` shadows give icons a tactile 3D feel
- **`solace-border-raised`:** custom utility class for the signature inset bevel on cards and list items

---

## 14. Anti-Patterns (Forbidden)

The following patterns are **explicitly forbidden** in any page generated from this design language. They are common AI-generation artifacts, accessibility violations, or engineering hazards that degrade visual quality, usability, and code integrity.

### 14.1 AI Visual Slops — Generic Aesthetic Anti-Patterns

These patterns immediately signal AI-generated design. **Never use them.**

- **Hero badge / announcement pill** — a small pill with a pulsing/animated dot followed by announcement text ("Now with passkey authentication"), placed above a hero headline. Ubiquitous AI artifact. Integrate announcements into headlines or body copy instead.
  ```html
  <!-- FORBIDDEN -->
  <div class="hero-badge anim-fade-up" aria-label="New">
    <span class="hero-badge-dot" aria-hidden="true"></span>
    Now with passkey authentication
  </div>
  ```
- **Gradient mesh backgrounds** behind heroes — overused AI aesthetic
- **"Trusted by X companies" logo walls** — generic credibility signal
- **Animated counters** ("10,000+ users and counting") — artificial social proof
- **Floating 3D product mockups** with glassmorphism — template-like
- **Typewriter effect on headlines** — cliché AI landing page effect
- **Purple gradients on white backgrounds** — the single most overused AI color scheme
- **Generic font families** — Inter, Roboto, Arial, system-ui as primary identity font. Use the Solace font stack (`__solaceSansDisplay`, `__solaceSansText`, `__solaceMono`) or distinctive alternatives. Never converge on Space Grotesk or similar "trendy" AI defaults.
- **Cookie-cutter layouts** — symmetric 3-column feature grids, identical card sizes, predictable spacing with no spatial drama. Use asymmetry, overlap, diagonal flow, or grid-breaking elements.
- **Timid, evenly-distributed color palettes** — dominant colors with sharp accents outperform uniform distribution.
- **Scattered micro-interactions** — one well-orchestrated page load with staggered reveals creates more delight than dozens of small hover effects everywhere.

### 14.2 Accessibility Anti-Patterns

These violate WCAG or basic usability. **Never ship them.**

- **`user-scalable=no` or `maximum-scale=1`** — disabling zoom is an accessibility violation
- **`outline-none` / `outline: none`** without a `focus-visible` replacement — removes keyboard focus indicator
- **Icon-only buttons without `aria-label`** — invisible to screen readers
- **Form inputs without `<label>` or `aria-label`** — users (and assistive tech) cannot identify fields
- **`<div>` or `<span>` with click handlers** — must be `<button>` for actions, `<a>`/`<Link>` for navigation
- **Inline `onClick` navigation without `<a>`** — breaks Cmd/Ctrl+click, middle-click, and accessibility
- **Images without explicit `width` and `height`** — causes layout shift (CLS)
- **Images without `alt`** (or `alt=""` for decorative) — screen readers announce filename
- **Decorative icons without `aria-hidden="true"`** — noise for assistive tech
- **`autoFocus` without clear justification** — disruptive on mobile, disorienting for screen reader users
- **Low-contrast text** — any text/background pair below 4.5:1 (normal text) or 3:1 (large text) is forbidden. See section 12.1 for the full forbidden/correct list.

### 14.3 Interaction & Engineering Anti-Patterns

These cause bugs, poor performance, or broken UX.

- **`transition: all`** — list properties explicitly to avoid unexpected transitions and performance hits
- **`onPaste` with `preventDefault`** — never block paste; it breaks password managers and user workflows
- **Large arrays `.map()` without virtualization** — lists >50 items must use virtualization (`content-visibility: auto`, or a virtual scroll library)
- **Blocking `prefers-reduced-motion`** — always honor it; provide reduced variant or disable animations entirely
- **`scroll-margin-top` missing on heading anchors** — fixed headers will obscure anchored content
- **Missing `touch-action: manipulation`** — causes 300ms double-tap zoom delay on mobile
- **Missing `overscroll-behavior: contain`** in modals/drawers/sheets — allows scroll chaining behind overlays
- **Layout reads in render** (`getBoundingClientRect`, `offsetHeight`, `offsetWidth`, `scrollTop`) — causes forced reflows
- **Controlled inputs with expensive per-keystroke computation** — prefer uncontrolled inputs where possible

### 14.4 Typography & Content Anti-Patterns

- **Three dots `...`** — always use ellipsis character `…`
- **Straight quotes** `" "` — always use curly quotes `\u201C` `\u201D`
- **Hardcoded date/number formats** — use `Intl.DateTimeFormat` and `Intl.NumberFormat` instead
- **`autoFocus` without clear justification** — desktop only, single primary input; never on mobile
- **Widowed/orphaned heading text** — use `text-wrap: balance` or `text-pretty` on headings
- **Missing `font-variant-numeric: tabular-nums`** in number columns or comparison layouts — digits will shift alignment

### 14.5 State & Navigation Anti-Patterns

- **URL does not reflect UI state** — filters, tabs, pagination, expanded panels must be in query params
- **Destructive actions without confirmation** — must have confirmation modal or undo window, never immediate
- **Submit buttons disabled before request starts** — keep enabled, show spinner during request, focus first error on failure
- **Missing unsaved-changes warning** — `beforeunload` or router guard before navigation with dirty forms

---

## 15. Quick Reference

```
Primary:    #ef5a3c    Secondary: #19c77f    Font: solaceSansDisplay/Text/Mono
Heading wt: 380        Body size: 14px       Base unit: 2px
Radii:      2/6/10/14/pill   Shadows: bevel inset   Breakpoints: 640/768/1024/1280/1536
Motion:     0.15-0.2s ease-out   Dark accents: vary per product
Nav:        Optional (floating island is one style, not enforced)
Cards:      solace-border-raised (12px, #fff) or bordered-md (pricing) or dark-2xl (login)
```
