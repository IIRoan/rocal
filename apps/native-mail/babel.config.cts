import type { ConfigAPI, TransformOptions } from "@babel/core";

const babelConfig = (api: ConfigAPI): TransformOptions => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};

module.exports = babelConfig;
