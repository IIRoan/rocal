# Architecture

## Design System Unification

The web app uses Tailwind CSS v4 with oklch-based CSS custom properties defined in `apps/web/app/globals.css`. The mobile app must use the SAME tokens via NativeWind v5 (which supports Tailwind v4).

**Token flow:** `global.css` (shared tokens) → Tailwind v4 `@theme` → NativeWind v5 → React Native styles

## Platform File Convention

- `component.tsx` — Web version (used by Next.js)
- `component.native.tsx` — React Native version (used by Expo via Metro resolver)

Metro automatically resolves `.native.tsx` over `.tsx` for React Native builds.

## Key Web Design Patterns

- Colors: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted/30`, `text-muted-foreground`, `bg-card`, `border-border/50`
- Radius: `rounded-xl`, `rounded-2xl`, `rounded-[32px]`, `rounded-full`
- Typography: `text-xl font-extrabold tracking-tight`, `text-[11px] font-bold uppercase tracking-[0.15em]`
- Interactive: `active:scale-90`, `active:scale-95`, `transition-all`
- Spacing: `px-6`, `py-2`, `gap-3`, `p-5`, `space-y-2`

## Web's oklch Color Palette (Light Mode)

- Background: `oklch(0.9821 0 0)` (warm near-white)
- Foreground: `oklch(0.2435 0 0)` (near-black)
- Primary: `oklch(0.4341 0.0392 41.9938)` (warm amber/ochre)
- Secondary: `oklch(0.92 0.0651 74.3695)` (warm cream/gold)
- Muted: `oklch(0.9521 0 0)`
- Card: `oklch(0.9911 0 0)` (pure white)
- Destructive: `oklch(0.6271 0.1936 33.339)`
- Border: `oklch(0.86 0 0)`

## Web Sidebar Structure

Desktop: Logo + "Workspace" header, NavUser footer, SidebarCalendar mini calendar, calendar list with visibility toggles, AI assistant textarea, "New Event" button, settings gear icon.
Mobile overlay: Logo + "Workspace" h1, user avatar dropdown, large circular "New" FAB, mini calendar widget, calendar list with toggles, AI assistant section.
