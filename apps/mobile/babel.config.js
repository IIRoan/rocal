module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './',
            '@workspace/calendar-client': '../../packages/calendar-client/src/index.ts',
            '@workspace/calendar-core': '../../packages/calendar-core/src/index.ts',
            '@workspace/ui/components/calendar': '../../packages/ui/src/components/calendar/index.ts',
            '@workspace/ui/components/mobile': '../../packages/ui/src/components/mobile/index.ts',
            // Force platform extension resolution so mobile imports pick *.native.tsx
            '@workspace/ui/components/ui': '../../packages/ui/src/components/ui',
            '^@workspace/ui/components/ui/(.+)$': '../../packages/ui/src/components/ui/\\1',
          },
          extensions: [
            '.native.ts',
            '.native.tsx',
            '.ios.ts',
            '.ios.tsx',
            '.android.ts',
            '.android.tsx',
            '.native.js',
            '.native.jsx',
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.json',
          ],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
