module.exports = function (api) {
  const isTest = api.env('test');
  const presets = [
    isTest && [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
      },
    ],
    isTest && [
      '@babel/preset-react',
      {
        runtime: 'automatic',
      },
    ],
    '@babel/preset-typescript',
    isTest && 'babel-preset-jest',
  ].filter(Boolean);

  return {
    presets,
  };
};
