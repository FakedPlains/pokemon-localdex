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
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      rules: {
        // 类型由 tsc 负责，no-undef 对 TS 文件会误报类型/全局，关闭交给 tsc
        "no-undef": "off",
        // 原生 no-unused-vars 无法识别类型/接口/类型导入，改用 TS 版本
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
  ],
};
