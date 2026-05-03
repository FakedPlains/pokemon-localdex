import { View, Text } from '@tarojs/components'
import './index.less'

// 中文属性名 → 英文 CSS 类名映射（WXSS 不支持中文选择器）
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

export default function TypeChip({ type }) {
  if (!type) return null
  const cls = TYPE_CLASS_MAP[type] || type
  return (
    <View className={`type-chip type-${cls}`}>
      <Text>{type}</Text>
    </View>
  )
}
