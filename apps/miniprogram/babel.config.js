module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: false
    }]
  ],
  overrides: [
    {
      // monorepo 共享包导出原始 .ts 文件，需要 TypeScript preset 来编译
      test: /packages[\\/]store[\\/]shared-types[\\/].*\.ts$/,
      presets: ['@babel/preset-typescript'],
    }
  ]
}
