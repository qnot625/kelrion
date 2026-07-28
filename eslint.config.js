import adminopsConfig from "@adminops/eslint-config";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo"] },
  ...adminopsConfig,
];
