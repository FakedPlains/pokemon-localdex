import { View, Text } from '@tarojs/components'
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { getTeams } from '../../utils/teamStorage'
import './index.less'

const TOOLS = [
  {
    key: 'damage',
    name: '伤害计算',
    desc: '模拟对战伤害',
    icon: '📊',
    iconClass: 'icon-damage',
    path: '/pages/damage/index'
  },
  {
    key: 'type-chart',
    name: '属性相克',
    desc: '18属性克制表',
    icon: '📋',
    iconClass: 'icon-type',
    path: '/pages/type-chart/index'
  },
  {
    key: 'speed',
    name: '速度线',
    desc: '敬请期待',
    icon: '⚡',
    iconClass: 'icon-speed',
    path: ''
  },
  {
    key: 'more',
    name: '更多工具',
    desc: '敬请期待',
    icon: '···',
    iconClass: 'icon-more',
    path: ''
  }
]

const SETTINGS = [
  {
    key: 'generation',
    label: '默认世代',
    icon: '⏱',
    iconClass: 'setting-icon-gen',
    value: '第九世代'
  },
  {
    key: 'image-quality',
    label: '图片质量',
    icon: '🖼',
    iconClass: 'setting-icon-img',
    value: '高清'
  },
  {
    key: 'clear-cache',
    label: '清除缓存',
    icon: '🗑',
    iconClass: 'setting-icon-cache',
    value: ''
  }
]

export default function ProfilePage() {
  const [teamCount, setTeamCount] = useState(0)
  const [cacheSize, setCacheSize] = useState('计算中...')

  // 每次页面展示时刷新数据
  useDidShow(() => {
    refreshStats()
  })

  useEffect(() => {
    refreshStats()
    calculateCacheSize()
  }, [])

  const refreshStats = () => {
    const teams = getTeams()
    setTeamCount(teams.length)
  }

  const calculateCacheSize = useCallback(() => {
    try {
      const res = Taro.getStorageInfoSync()
      const sizeKB = res.currentSize || 0
      if (sizeKB >= 1024) {
        setCacheSize(`${(sizeKB / 1024).toFixed(1)} MB`)
      } else {
        setCacheSize(`${sizeKB} KB`)
      }
    } catch {
      setCacheSize('未知')
    }
  }, [])

  const handleToolTap = (tool) => {
    if (!tool.path) {
      Taro.showToast({ title: '敬请期待', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: tool.path })
  }

  const handleSettingTap = (setting) => {
    if (setting.key === 'clear-cache') {
      Taro.showModal({
        title: '清除缓存',
        content: '确定要清除所有缓存数据吗？队伍数据不会被清除。',
        success(res) {
          if (res.confirm) {
            try {
              // 保留队伍数据，清除其他缓存
              const teams = Taro.getStorageSync('pokemon_teams')
              Taro.clearStorageSync()
              if (teams) {
                Taro.setStorageSync('pokemon_teams', teams)
              }
              calculateCacheSize()
              Taro.showToast({ title: '缓存已清除', icon: 'success' })
            } catch {
              Taro.showToast({ title: '清除失败', icon: 'none' })
            }
          }
        }
      })
      return
    }
    // 其他设置项暂不处理
    Taro.showToast({ title: '敬请期待', icon: 'none' })
  }

  const handleAboutTap = () => {
    Taro.showModal({
      title: '关于 LocalDex',
      content: 'Pokemon LocalDex 是一个本地优先的宝可梦工具集，提供图鉴查询、伤害计算、属性相克等实用功能。\n\n数据来源：52Poké Wiki',
      showCancel: false,
      confirmText: '知道了'
    })
  }

  return (
    <View className='profile-page'>
      {/* 用户信息卡片 */}
      <View className='user-card glass-card'>
        <View className='user-info'>
          <View className='avatar'>
            <Text className='avatar-icon'>◓</Text>
          </View>
          <View className='user-detail'>
            <Text className='user-name'>训练家</Text>
            <Text className='user-bio'>目标是宝可梦大师！</Text>
            <View className='user-stats'>
              <View className='stat-item'>
                <Text className='stat-num'>{teamCount}</Text>
                <Text className='stat-label'>队伍</Text>
              </View>
              <View className='stat-item'>
                <Text className='stat-num'>0</Text>
                <Text className='stat-label'>盒子</Text>
              </View>
              <View className='stat-item'>
                <Text className='stat-num'>0</Text>
                <Text className='stat-label'>收藏</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 对战工具 */}
      <View className='section'>
        <Text className='section-title'>对战工具</Text>
        <View className='tools-grid'>
          {TOOLS.map(tool => (
            <View
              key={tool.key}
              className='tool-card glass-card press-scale'
              onClick={() => handleToolTap(tool)}
            >
              <View className={`tool-icon-wrap ${tool.iconClass}`}>
                <Text className='tool-icon-text'>{tool.icon}</Text>
              </View>
              <Text className='tool-name'>{tool.name}</Text>
              <Text className='tool-desc'>{tool.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 设置 */}
      <View className='section'>
        <Text className='section-title'>设置</Text>
        <View className='settings-card glass-card'>
          {SETTINGS.map(setting => (
            <View
              key={setting.key}
              className='setting-row'
              onClick={() => handleSettingTap(setting)}
            >
              <View className='setting-left'>
                <View className={`setting-icon ${setting.iconClass}`}>
                  <Text>{setting.icon}</Text>
                </View>
                <Text className='setting-label'>{setting.label}</Text>
              </View>
              <View className='setting-right'>
                <Text className='setting-value'>
                  {setting.key === 'clear-cache' ? cacheSize : setting.value}
                </Text>
                <Text className='setting-arrow'>›</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 关于 */}
      <View className='section'>
        <View className='settings-card glass-card'>
          <View className='setting-row' onClick={handleAboutTap}>
            <View className='setting-left'>
              <View className='setting-icon setting-icon-about'>
                <Text>ℹ</Text>
              </View>
              <Text className='setting-label'>关于 LocalDex</Text>
            </View>
            <View className='setting-right'>
              <Text className='setting-arrow'>›</Text>
            </View>
          </View>
          <View className='setting-row setting-row-last'>
            <View className='setting-left'>
              <View className='setting-icon setting-icon-source'>
                <Text>⚑</Text>
              </View>
              <Text className='setting-label'>数据来源</Text>
            </View>
            <View className='setting-right'>
              <Text className='setting-value'>52Poké Wiki</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 版本号 */}
      <View className='footer'>
        <Text className='version-text'>Pokemon LocalDex v1.0.0</Text>
      </View>
    </View>
  )
}
