# NativeWind v5 Migration Reference

## Installation
```
bun install nativewind@preview react-native-css react-native-reanimated react-native-safe-area-context
bun install --dev tailwindcss @tailwindcss/postcss postcss
```

## Config Changes (v4 → v5)

### babel.config.js
Remove nativewind presets:
```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

### metro.config.js
Simplified — no second argument:
```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const config = getDefaultConfig(__dirname);
module.exports = withNativewind(config);
```

### postcss.config.mjs (NEW)
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

### global.css (Tailwind v4 syntax)
```css
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css";
@import "nativewind/theme";
```

### package.json overrides
```json
{ "overrides": { "lightningcss": "1.30.1" } }
```

### Remove
- `tailwind.config.js` (v3 format no longer needed)
- `.nativewind-cache/` directory

## Breaking Changes
- `shadow-*` classes now use `boxShadow` style instead of individual shadow properties
- Line height numeric values parsed as `em` units
- `rem` no longer exported / changeable at runtime
- `cssInterop`/`remapProps` deprecated → use `styled()`
- JSX transform replaced by import rewrites (no babel config needed)
- Animations now use Reanimated CSS animations
