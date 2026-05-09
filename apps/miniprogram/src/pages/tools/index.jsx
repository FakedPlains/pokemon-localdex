import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.less'

const TOOLS = [
  {
    key: 'type-chart',
    name: '属性相克表',
    desc: '查看 18 种属性之间的克制关系',
    icon: '⚡',
    iconClass: 'icon-type-chart',
    path: '/pages/type-chart/index'
  },
  {
    key: 'teams',
    name: '队伍构建',
    desc: '组建和管理你的宝可梦队伍',
    icon: '👥',
    iconClass: 'icon-teams',
    path: '/pages/teams/index'
  },
  {
    key: 'damage',
    name: '伤害计算',
    desc: '计算招式对目标的伤害范围',
    icon: '💥',
    iconClass: 'icon-damage',
    path: '/pages/damage/index'
  }
]

export default function ToolsPage() {
  const navigateTo = (path) => {
    Taro.navigateTo({ url: path })
  }

  return (
    <View className='tools-page'>
      <Text className='page-title'>工具箱</Text>
      <View className='tools-grid'>
        {TOOLS.map(tool => (
          <View key={tool.key} className='tool-card' onClick={() => navigateTo(tool.path)}>
            <View className={`tool-icon ${tool.iconClass}`}>
              <Text>{tool.icon}</Text>
            </View>
            <View className='tool-info'>
              <Text className='tool-name'>{tool.name}</Text>
              <Text className='tool-desc'>{tool.desc}</Text>
            </View>
            <Text className='tool-arrow'>›</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
