import type { ConfigAPI, TransformOptions } from "@babel/core";

const babelConfig = (api: ConfigAPI): TransformOptions => {
  const isTest = api.env("test");
  const presets = [
    isTest && [
      "@babel/preset-env",
      {
        targets: {
          node: "current",
        },
      },
    ],
    isTest && [
      "@babel/preset-react",
      {
        runtime: "automatic",
      },
    ],
    "@babel/preset-typescript",
    isTest && "babel-preset-jest",
  ].filter(Boolean);

  return {
    presets,
  };
};

module.exports = babelConfig;
