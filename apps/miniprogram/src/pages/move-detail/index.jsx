import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchMoveDetail, fetchPokemonByMove } from '../../utils/api'
import SafeImage from '../../components/safe-image'
import Loading from '../../components/loading'
import './index.less'

/** 属性 → 渐变色映射 */
const TYPE_GRADIENT = {
  '一般': ['#a8a878', '#8a8a5c'],
  '火': ['#f08030', '#c6601a'],
  '水': ['#6890f0', '#4a70c8'],
  '电': ['#f8d030', '#c8a820'],
  '草': ['#78c850', '#5a9838'],
  '冰': ['#98d8d8', '#6cb8b8'],
  '格斗': ['#c03028', '#9c2420'],
  '毒': ['#a040a0', '#803080'],
  '地面': ['#e0c068', '#c9a03e'],
  '飞行': ['#a890f0', '#8870c8'],
  '超能力': ['#f85888', '#d04070'],
  '虫': ['#a8b820', '#889810'],
  '岩石': ['#b8a038', '#9c8828'],
  '幽灵': ['#705898', '#584078'],
  '龙': ['#7038f8', '#5828c8'],
  '恶': ['#705848', '#504038'],
  '钢': ['#b8b8d0', '#9898b0'],
  '妖精': ['#ee99ac', '#d07090']
}

export default function MoveDetailPage() {
  const router = useRouter()
  const moveId = router.params.id

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pokemonList, setPokemonList] = useState([])
  const [pokemonLoading, setPokemonLoading] = useState(false)

  useEffect(() => {
    if (!moveId) { setLoading(false); return }
    setLoading(true)
    fetchMoveDetail(moveId).then(res => {
      setDetail(res.data)
      if (res.data) {
        Taro.setNavigationBarTitle({ title: res.data.nameZh || '招式详情' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [moveId])

  // 加载可学习的宝可梦
  useEffect(() => {
    if (!detail?.id) return
    setPokemonLoading(true)
    fetchPokemonByMove(detail.id, { limit: 30 }).then(res => {
      setPokemonList(res.data || [])
      setPokemonLoading(false)
    }).catch(() => setPokemonLoading(false))
  }, [detail?.id])

  if (loading) return <Loading />
  if (!detail) {
    return (
      <View className='md-empty'>
        <Text>未找到该招式</Text>
      </View>
    )
  }

  const gradient = TYPE_GRADIENT[detail.type] || ['#a8a878', '#8a8a5c']

  return (
    <ScrollView scrollY className='md-page'>
      {/* Hero 区域 */}
      <View
        className='md-hero'
        style={{ background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)` }}
      >
        <View className='md-hero-circle1' />
        <View className='md-hero-circle2' />
        <Text className='md-hero-name'>{detail.nameZh}</Text>
        <Text className='md-hero-name-en'>{detail.nameEn || ''}</Text>
        <View className='md-hero-tags'>
          {detail.type && (
            <View className='md-hero-tag md-hero-tag-type'>
              <Text>{detail.type}</Text>
            </View>
          )}
          {detail.category && (
            <View className='md-hero-tag md-hero-tag-category'>
              <Text>{detail.category}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 基础数据卡片 */}
      <View className='md-glass-card'>
        <View className='md-stats-grid'>
          <View className='md-stat-item'>
            <Text className='md-stat-value'>{detail.power ?? '—'}</Text>
            <Text className='md-stat-label'>威力</Text>
          </View>
          <View className='md-stat-item'>
            <Text className='md-stat-value'>{detail.accuracy ?? '—'}</Text>
            <Text className='md-stat-label'>命中</Text>
          </View>
          <View className='md-stat-item'>
            <Text className='md-stat-value'>{detail.pp ?? '—'}</Text>
            <Text className='md-stat-label'>PP</Text>
          </View>
          <View className='md-stat-item'>
            <Text className='md-stat-value'>{detail.introducedGeneration ?? '—'}</Text>
            <Text className='md-stat-label'>初登场世代</Text>
          </View>
        </View>
      </View>

      {/* 效果说明卡片 */}
      {(detail.description || detail.effectDetail) && (
        <View className='md-glass-card'>
          <Text className='md-card-title'>效果</Text>
          <Text className='md-effect-text'>{detail.effectDetail || detail.description}</Text>
        </View>
      )}

      {/* 世代变更时间线 */}
      {detail.generations?.length > 0 && (
        <View className='md-glass-card'>
          <Text className='md-card-title'>世代变更</Text>
          <View className='md-timeline'>
            {detail.generations.map((gen, i) => (
              <View key={i} className='md-timeline-item'>
                <View className={`md-timeline-dot ${i === 0 ? 'md-timeline-dot-first' : ''}`} />
                <View className={`md-timeline-gen ${i === 0 ? 'md-timeline-gen-first' : ''}`}>
                  <Text>第{gen.generation}世代</Text>
                </View>
                <Text className='md-timeline-desc'>{gen.description || '—'}</Text>
                <Text className='md-timeline-detail'>
                  威力 {gen.power ?? '—'} · 命中 {gen.accuracy ?? '—'} · PP {gen.pp ?? '—'}
                  {gen.type && gen.type !== detail.type ? ` · 属性 ${gen.type}` : ''}
                  {gen.category && gen.category !== detail.category ? ` · ${gen.category}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 可学习的宝可梦 */}
      <View className='md-glass-card'>
        <Text className='md-card-title'>可学习的宝可梦</Text>
        {pokemonLoading ? (
          <Loading text='加载中…' />
        ) : pokemonList.length === 0 ? (
          <Text className='md-muted'>暂无数据</Text>
        ) : (
          <ScrollView scrollX className='md-pokemon-scroll-wrap'>
            <View className='md-pokemon-scroll'>
              {pokemonList.map(p => (
                <View
                  key={p.id}
                  className='md-pokemon-avatar-item'
                  onClick={() => Taro.navigateTo({ url: `/pages/pokemon-detail/index?id=${p.id}` })}
                >
                  <View className='md-pokemon-avatar'>
                    <SafeImage className='md-pokemon-avatar-img' src={p.image} mode='aspectFit' />
                  </View>
                  <Text className='md-pokemon-avatar-name'>{p.nameZh}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <View className='md-bottom-spacer' />
    </ScrollView>
  )
}
