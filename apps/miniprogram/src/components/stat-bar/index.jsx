import { View, Text } from '@tarojs/components'
import { STAT_KEYS, STAT_LABELS_SHORT, STAT_COLORS } from '@pokemon-localdex/store-types/constants'
import './index.less'

export default function StatBar({ stats = {} }) {
  const total = STAT_KEYS.reduce((s, k) => s + (stats[k] || 0), 0)

  return (
    <View className='stat-bar-wrap'>
      {STAT_KEYS.map(key => {
        const val = stats[key] || 0
        const pct = Math.min((val / 200) * 100, 100)
        const color = STAT_COLORS[key]
        return (
          <View key={key} className='stat-row'>
            <Text className='stat-label' style={{ color }}>{STAT_LABELS_SHORT[key]}</Text>
            <Text className='stat-val'>{val}</Text>
            <View className='stat-track'>
              <View
                className='stat-fill'
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </View>
          </View>
        )
      })}
      <View className='stat-row stat-total'>
        <Text className='stat-label'>合计</Text>
        <Text className='stat-val stat-val-total'>{total}</Text>
        <View className='stat-track' />
      </View>
    </View>
  )
}
