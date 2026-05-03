const path = require('path')

// 读取 .env 文件中的环境变量（不覆盖已有的 process.env）
try {
  const envPath = path.resolve(__dirname, '..', '.env')
  require('dotenv').config({ path: envPath })
} catch (e) {
  // dotenv 不可用时静默跳过，依赖 process.env 中已有的值
}

const config = {
  projectName: 'pokemon-localdex-miniprogram',
  date: '2025-05-03',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-framework-react'],
  defineConstants: {
    SUPABASE_URL: JSON.stringify(process.env.SUPABASE_URL || ''),
    SUPABASE_ANON_KEY: JSON.stringify(process.env.SUPABASE_ANON_KEY || ''),
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false }
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: {
        enable: true,
        config: {}
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  }
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
