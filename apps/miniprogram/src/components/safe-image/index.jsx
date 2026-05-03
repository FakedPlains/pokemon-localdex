/**
 * SafeImage — 带图片代理和错误处理的 Image 组件
 *
 * 微信小程序对外部图片域名有白名单限制，
 * 通过 wsrv.nl 图片代理服务转发第三方域名的图片。
 *
 * wsrv.nl (images.weserv.nl) 是一个免费的图片代理/缓存服务，
 * 只需将其域名添加到微信后台的「downloadFile 合法域名」即可。
 */

import { useState, useMemo } from 'react'
import { View, Text, Image } from '@tarojs/components'

// 需要代理的域名列表（这些域名无法直接在小程序中加载）
const PROXY_DOMAINS = [
  's1.52poke.com',
  's2.52poke.com',
  'wiki.52poke.com',
  'raw.githubusercontent.com'
]

// 图片代理服务地址
const PROXY_BASE = 'https://wsrv.nl/?url='

/**
 * 判断 URL 是否需要代理
 */
function needsProxy(url) {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname
    return PROXY_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

/**
 * 生成代理后的 URL
 */
function getProxiedUrl(url) {
  if (!url) return ''
  if (!needsProxy(url)) return url
  return `${PROXY_BASE}${encodeURIComponent(url)}`
}

export default function SafeImage({ src, mode = 'aspectFit', className = '', style = {}, lazyLoad = false }) {
  const [errored, setErrored] = useState(false)

  const finalSrc = useMemo(() => getProxiedUrl(src), [src])

  if (!src || errored) {
    return (
      <View
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
          ...style
        }}
      >
        <Text style={{ fontSize: '48rpx', color: '#ccc' }}>?</Text>
      </View>
    )
  }

  return (
    <Image
      className={className}
      style={style}
      src={finalSrc}
      mode={mode}
      lazyLoad={lazyLoad}
      onError={() => setErrored(true)}
    />
  )
}
