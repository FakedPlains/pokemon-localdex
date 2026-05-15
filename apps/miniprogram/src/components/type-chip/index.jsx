import { View, Text, Image } from '@tarojs/components'
import './index.less'

// 中文属性名 → 英文 CSS 类名映射
const TYPE_CLASS_MAP = {
  '一般': 'normal',
  '火': 'fire',
  '水': 'water',
  '电': 'electric',
  '草': 'grass',
  '冰': 'ice',
  '格斗': 'fighting',
  '毒': 'poison',
  '地面': 'ground',
  '飞行': 'flying',
  '超能力': 'psychic',
  '虫': 'bug',
  '岩石': 'rock',
  '幽灵': 'ghost',
  '龙': 'dragon',
  '恶': 'dark',
  '钢': 'steel',
  '妖精': 'fairy'
}

// 属性图标路径映射
const TYPE_ICON_MAP = {
  '一般': require('../../assets/type-icons/type-一般@sm.png'),
  '火': require('../../assets/type-icons/type-火@sm.png'),
  '水': require('../../assets/type-icons/type-水@sm.png'),
  '电': require('../../assets/type-icons/type-电@sm.png'),
  '草': require('../../assets/type-icons/type-草@sm.png'),
  '冰': require('../../assets/type-icons/type-冰@sm.png'),
  '格斗': require('../../assets/type-icons/type-格斗@sm.png'),
  '毒': require('../../assets/type-icons/type-毒@sm.png'),
  '地面': require('../../assets/type-icons/type-地面@sm.png'),
  '飞行': require('../../assets/type-icons/type-飞行@sm.png'),
  '超能力': require('../../assets/type-icons/type-超能力@sm.png'),
  '虫': require('../../assets/type-icons/type-虫@sm.png'),
  '岩石': require('../../assets/type-icons/type-岩石@sm.png'),
  '幽灵': require('../../assets/type-icons/type-幽灵@sm.png'),
  '龙': require('../../assets/type-icons/type-龙@sm.png'),
  '恶': require('../../assets/type-icons/type-恶@sm.png'),
  '钢': require('../../assets/type-icons/type-钢@sm.png'),
  '妖精': require('../../assets/type-icons/type-妖精@sm.png')
}

/**
 * 属性标签组件
 * @param {string} type - 中文属性名
 * @param {string} size - 尺寸: 'sm'(小) | 'md'(默认) | 'lg'(大)
 * @param {boolean} showIcon - 是否显示图标，默认 true
 */
export default function TypeChip({ type, size = 'md', showIcon = true }) {
  if (!type) return null
  const cls = TYPE_CLASS_MAP[type] || type
  const iconSrc = showIcon ? TYPE_ICON_MAP[type] : null

  return (
    <View className={`type-chip type-${cls} type-chip-${size}`}>
      {iconSrc && (
        <Image
          className={`type-chip-icon type-chip-icon-${size}`}
          src={iconSrc}
          mode='aspectFit'
        />
      )}
      <Text>{type}</Text>
    </View>
  )
}
