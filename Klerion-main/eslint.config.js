import adminopsConfig from "./packages/eslint-config/index.js";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "apps/web/**",
    ],
  },
  ...adminopsConfig,
];
