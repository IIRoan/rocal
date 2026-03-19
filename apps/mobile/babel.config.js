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
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
