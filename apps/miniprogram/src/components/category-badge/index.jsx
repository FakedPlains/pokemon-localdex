import { View, Text, Image } from '@tarojs/components'
import './index.less'

// UI 原型中的分类配色（渐变背景 + 白字）
const CATEGORY_STYLE_MAP = {
  '物理': {
    background: 'linear-gradient(135deg, #E65C3A, #C74424)',
    color: '#FFFFFF',
    abbr: '物'
  },
  '特殊': {
    background: 'linear-gradient(135deg, #6E5BA8, #4F3D8E)',
    color: '#FFFFFF',
    abbr: '特'
  },
  '变化': {
    background: 'linear-gradient(135deg, #9E9E9E, #757575)',
    color: '#FFFFFF',
    abbr: '变'
  }
}

// 分类图标路径映射
const CATEGORY_ICON_MAP = {
  '物理': require('../../assets/type-icons/category-物理@sm.png'),
  '特殊': require('../../assets/type-icons/category-特殊@sm.png'),
  '变化': require('../../assets/type-icons/category-变化@sm.png')
}

/**
 * 招式分类标签组件
 * @param {string} category - 中文分类名：物理/特殊/变化
 * @param {string} size - 尺寸: 'sm'(小) | 'md'(默认)
 * @param {boolean} showIcon - 是否显示图标，默认 true
 * @param {string} variant - 'pill'(药丸形) | 'icon'(方形图标)，默认 'pill'
 */
export default function CategoryBadge({ category, size = 'md', showIcon = true, variant = 'pill' }) {
  if (!category) return null

  const style = CATEGORY_STYLE_MAP[category] || {
    background: 'linear-gradient(135deg, #9E9E9E, #757575)',
    color: '#FFFFFF',
    abbr: category[0]
  }
  const iconSrc = showIcon ? CATEGORY_ICON_MAP[category] : null

  // 方形图标模式（仿原型 .category-icon）
  if (variant === 'icon') {
    return (
      <View
        className={`category-icon category-icon-${size}`}
        style={{ background: style.background }}
      >
        <Text className='category-icon-text' style={{ color: style.color }}>
          {style.abbr}
        </Text>
      </View>
    )
  }

  // 药丸形标签模式
  return (
    <View
      className={`category-badge category-badge-${size}`}
      style={{ background: style.background }}
    >
      {iconSrc && (
        <Image
          className={`category-badge-icon category-badge-icon-${size}`}
          src={iconSrc}
          mode='aspectFit'
        />
      )}
      <Text className='category-badge-text' style={{ color: style.color }}>
        {category}
      </Text>
    </View>
  )
}
