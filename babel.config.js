module.exports = function (api) {
  const isTest = api.env('test');
  const presets = [
    'module:metro-react-native-babel-preset',
    isTest && [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
      },
    ],
    '@babel/preset-typescript',
    isTest && 'babel-preset-jest',
  ].filter(Boolean);

  return {
    presets,
  };
};
