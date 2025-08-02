# Design System

## Overview

This design system establishes a cohesive visual language for our calendar application, focusing on clarity, accessibility, and consistency across light and dark themes.

## Design Principles

### 1. Hierarchy Through Elevation

- **Background**: Base application surface
- **Card**: Elevated content containers (slightly above background)
- **Popover**: Floating elements with highest elevation
- **Input**: Distinct form element backgrounds

### 2. Semantic Color Usage

- **Primary**: Main brand actions and interactive elements
- **Secondary**: Supporting actions and less prominent elements
- **Accent**: Highlights, selections, and special emphasis
- **Muted**: Subtle backgrounds and secondary text
- **Destructive**: Error states and dangerous actions

### 3. Consistent Spacing & Typography

- **Radius**: Consistent border radius using CSS custom properties
- **Typography**: Clear hierarchy with proper contrast ratios
- **Spacing**: Harmonious spacing scale

## Color System

### Light Theme Philosophy

- Clean, warm, and inviting
- High contrast for accessibility
- Subtle warm undertones for comfort
- Clear elevation through lightness variations

### Dark Theme Philosophy

- Deep, rich backgrounds
- Excellent readability
- Consistent with light theme semantics
- Proper contrast for eye comfort

## Component-Specific Guidelines

### Cards

- Should have distinct background from main background
- Used for content grouping and organization
- Subtle elevation through background color difference

### Inputs

- Must have distinct background from cards
- Should indicate interactivity
- Clear focus states with ring indicators

### Buttons

- Primary: High contrast, main actions
- Secondary: Subtle, supporting actions
- Destructive: Clear danger indication

### Navigation (Sidebar)

- Consistent with main theme but distinct
- Clear active/inactive states
- Proper hover feedback

### Calendar-Specific Elements

- Working days: Subtle background indication
- Events: Clear color coding
- Time indicators: Muted but readable

## Accessibility Requirements

- WCAG AA contrast ratios minimum
- Clear focus indicators
- Consistent interactive states
- Proper semantic color usage

## Implementation Guidelines

- Use CSS custom properties for all colors
- Maintain semantic naming conventions
- Ensure both themes work consistently
- Test with actual content and various screen sizes

## Color Token Reference

### Base Colors

- `--background`: Main application background
- `--foreground`: Primary text color
- `--card`: Elevated content containers
- `--popover`: Floating elements (highest elevation)
- `--input`: Form element backgrounds (distinct from cards)

### Interactive Colors

- `--primary`: Main brand actions
- `--secondary`: Supporting actions
- `--accent`: Highlights and selections
- `--muted`: Subtle backgrounds and secondary text

### Utility Colors

- `--destructive`: Error states and dangerous actions
- `--success`: Success states and confirmations
- `--warning`: Warning states and cautions
- `--info`: Information states and notifications

### Event Colors

- `--event-sky`: Sky blue events
- `--event-violet`: Violet events
- `--event-orange`: Orange events
- `--event-rose`: Rose events
- `--event-emerald`: Emerald events
- `--event-default`: Default event color

### Calendar-Specific

- `--calendar-working-day`: Working day highlights
- `--calendar-accent`: Calendar-specific highlights
- `--calendar-accent-bg`: Calendar background accents

## Recent Improvements

1. **Fixed Input Backgrounds**: Inputs now use dedicated `--input` color instead of card backgrounds
2. **Themed Event Colors**: All event colors now use CSS custom properties for consistent theming
3. **Improved Info States**: Added proper info/notification color tokens
4. **Removed Hardcoded Colors**: Eliminated all hardcoded Tailwind color classes
5. **Enhanced Accessibility**: Improved contrast ratios and focus states
6. **Consistent Elevation**: Clear hierarchy through background color variations

## Latest Fixes Applied

### Working Day & Weekend Indicators

- **Issue**: Working day and weekend indicators were not visible in both light and dark modes
- **Solution**:
  - Added dedicated `--working-day` and `--weekend-day` color tokens
  - Increased contrast for better visibility
  - Updated all calendar components to use consistent theming
  - Light mode: Working days use warm beige, weekends use subtle purple
  - Dark mode: Working days use warm brown, weekends use darker purple

### Calendar Colors in Sidebar

- **Issue**: Calendar color indicators in sidebar were not showing
- **Solution**:
  - Fixed color mapping from Tailwind variables to our event color system
  - Updated sidebar to use `var(--color-event-{color})` format
  - Now properly displays calendar colors using our themed event colors

### Color Improvements

- Working days: `oklch(0.92 0.025 65)` light / `oklch(0.28 0.02 55)` dark
- Weekend days: `oklch(0.88 0.025 285)` light / `oklch(0.18 0.012 285)` dark
- Better contrast ratios for accessibility
- Consistent theming across all calendar views (month, week, day)

## Final Working Day/Weekend Indicator Solution

### Problem with Previous Approach

- Using distinct color tokens created too much visual noise in light mode
- Not enough contrast in dark mode
- Broke the visual hierarchy by introducing new color layers

### Improved Solution: Brightness Modifiers

Instead of separate colors, now using CSS brightness filters on the base background:

**Working Days**:

- Light mode: `brightness-[0.98]` (slightly darker)
- Dark mode: `brightness-[1.05]` (slightly brighter)

**Weekend Days**:

- Light mode: `brightness-[0.96]` (more noticeably darker)
- Dark mode: `brightness-[1.1]` (more noticeably brighter)

### Benefits

- ✅ Maintains the base color scheme integrity
- ✅ Subtle but visible indication in light mode
- ✅ Better contrast in dark mode
- ✅ No additional color tokens needed
- ✅ Consistent with the design system philosophy
- ✅ Works across all calendar views (month, week, day)

This approach respects the original calendar background while providing just enough visual differentiation to distinguish working days from weekends without overwhelming the interface.

## Final Refinements - Clear Weekend/Workday Distinction

### Changes Made:

1. **Removed all hover animations** - No more distracting background color changes on hover
2. **Clearer distinction between weekends and workdays**:
   - **Working days**: Normal `bg-background` (no modification)
   - **Weekend days**: More noticeable brightness difference
     - Light mode: `brightness-[0.92]` (8% darker - clearly visible)
     - Dark mode: `brightness-[1.15]` (15% brighter - clearly visible)

### Result:

- ✅ **Working days**: Clean, normal background
- ✅ **Weekend days**: Clearly distinguishable with noticeable brightness difference
- ✅ **No hover distractions**: Removed all hover background animations
- ✅ **Better UX**: Static, predictable visual hierarchy
- ✅ **Accessible**: Clear contrast between working and non-working days

This creates a clean, distraction-free calendar interface where weekends are clearly marked but working days maintain the pure background aesthetic.

## Balanced Working Day/Weekend Indicators - Final Solution

### Problem with Previous Attempt:

- Working days had no indicator at all
- Dark mode brightness changes weren't visible enough

### Final Balanced Solution:

Both working days and weekends now have subtle but visible indicators:

**Working Days (Mon-Fri)**:

- Light mode: `brightness-[0.97]` (3% darker - subtle indication)
- Dark mode: `brightness-[1.08]` (8% brighter - clearly visible)

**Weekend Days (Sat-Sun)**:

- Light mode: `brightness-[0.94]` (6% darker - more noticeable)
- Dark mode: `brightness-[1.16]` (16% brighter - clearly distinguishable)

### Result:

- ✅ **Both day types are indicated** - no more invisible working days
- ✅ **Clear distinction** - weekends are noticeably different from working days
- ✅ **Visible in dark mode** - increased brightness values for better contrast
- ✅ **Subtle in light mode** - not overwhelming, just enough to distinguish
- ✅ **No hover distractions** - clean, static interface

This creates a perfect balance where both working days and weekends are subtly indicated, with weekends being more prominent, and both being clearly visible in both light and dark modes.
