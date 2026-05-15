module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  ignorePatterns: [
    "dist/",
    "apps/miniprogram/dist/",
    "node_modules/",
    "apps/**/node_modules/",
  ],
  rules: {
    "no-undef": "error",
  },
};
