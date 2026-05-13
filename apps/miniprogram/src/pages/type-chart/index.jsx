import { View, Text, ScrollView } from '@tarojs/components'
import { useState } from 'react'
import { TYPE_CHART, ALL_TYPE_OPTIONS, TYPE_COLORS } from '@pokemon-localdex/store-types/constants'
import './index.less'

function getEffLabel(val) {
  if (val === 2) return '2'
  if (val === 0.5) return '½'
  if (val === 0) return '0'
  return ''
}

function getEffClass(val) {
  if (val === 2) return 'eff-2'
  if (val === 0.5) return 'eff-05'
  if (val === 0) return 'eff-0'
  return 'eff-1'
}

export default function TypeChartPage() {
  const [highlightRow, setHighlightRow] = useState(-1)
  const [highlightCol, setHighlightCol] = useState(-1)

  const handleCellTap = (row, col) => {
    setHighlightRow(row === highlightRow ? -1 : row)
    setHighlightCol(col === highlightCol ? -1 : col)
  }

  return (
    <View className='type-chart-page'>
      <ScrollView scrollX className='chart-wrapper'>
        <View className='chart-table'>
          {/* 表头：角 + 防守方属性 */}
          <View style={{ display: 'flex' }}>
            <View className='corner-cell' style={{ width: '40px', minWidth: '40px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eee' }}>
              <Text style={{ fontSize: '9px', color: '#999' }}>攻↓防→</Text>
            </View>
            {ALL_TYPE_OPTIONS.map((type, ci) => (
              <View
                key={type}
                className='header-cell'
                style={{
                  width: '32px', minWidth: '32px', height: '32px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: TYPE_COLORS[type],
                  border: '1px solid #eee',
                  opacity: highlightCol >= 0 && highlightCol !== ci ? 0.4 : 1
                }}
              >
                <Text>{type.slice(0, 1)}</Text>
              </View>
            ))}
          </View>

          {/* 每一行：攻击方属性 */}
          {ALL_TYPE_OPTIONS.map((atkType, ri) => (
            <View
              key={atkType}
              style={{ display: 'flex', opacity: highlightRow >= 0 && highlightRow !== ri ? 0.4 : 1 }}
            >
              <View
                className='row-header'
                style={{
                  width: '40px', minWidth: '40px', height: '32px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: TYPE_COLORS[atkType],
                  border: '1px solid #eee'
                }}
              >
                <Text>{atkType.length > 2 ? atkType.slice(0, 2) : atkType}</Text>
              </View>
              {TYPE_CHART[atkType].map((val, ci) => (
                <View
                  key={ci}
                  className={`eff-cell ${getEffClass(val)}`}
                  style={{
                    width: '32px', minWidth: '32px', height: '32px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid #eee',
                    opacity: highlightCol >= 0 && highlightCol !== ci ? 0.4 : 1
                  }}
                  onClick={() => handleCellTap(ri, ci)}
                >
                  <Text>{getEffLabel(val)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className='legend'>
        <View className='legend-item'>
          <View className='dot dot-2'></View>
          <Text>效果拔群(2x)</Text>
        </View>
        <View className='legend-item'>
          <View className='dot dot-05'></View>
          <Text>效果不好(½)</Text>
        </View>
        <View className='legend-item'>
          <View className='dot dot-0'></View>
          <Text>无效(0)</Text>
        </View>
      </View>

      <View className='tips'>
        <Text>提示：横行为攻击方属性，纵列为防守方属性。点击格子可高亮对应行列。</Text>
      </View>
    </View>
  )
}
