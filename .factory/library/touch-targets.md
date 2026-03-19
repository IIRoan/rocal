# Touch Targets

When implementing interactive elements in React Native (such as `Pressable`), ensure they meet the minimum 44pt touch target requirement as defined in the mission guidelines.

For elements that visually need to remain smaller than 44x44pt (e.g., small grid cells, quarter-hour markers in calendar views), use the `hitSlop` property on React Native's `Pressable` rather than altering the layout or relying on margin/padding.

Example:
```tsx
<Pressable hitSlop={16} onPress={handlePress}>
  <View className="h-4 w-full" />
</Pressable>
```
