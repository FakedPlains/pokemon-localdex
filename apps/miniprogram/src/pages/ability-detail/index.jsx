import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchAbilityDetail, fetchPokemonByAbility } from '../../utils/api'
import SafeImage from '../../components/safe-image'
import Loading from '../../components/loading'
import './index.less'

export default function AbilityDetailPage() {
  const router = useRouter()
  const abilityId = router.params.id

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pokemonList, setPokemonList] = useState([])
  const [pokemonLoading, setPokemonLoading] = useState(false)

  useEffect(() => {
    if (!abilityId) { setLoading(false); return }
    setLoading(true)
    fetchAbilityDetail(abilityId).then(res => {
      setDetail(res.data)
      if (res.data) {
        Taro.setNavigationBarTitle({ title: res.data.nameZh || '特性详情' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [abilityId])

  // 加载拥有该特性的宝可梦
  useEffect(() => {
    if (!detail?.id) return
    setPokemonLoading(true)
    fetchPokemonByAbility(detail.id, { limit: 30 }).then(res => {
      setPokemonList(res.data || [])
      setPokemonLoading(false)
    }).catch(() => setPokemonLoading(false))
  }, [detail?.id])

  if (loading) return <Loading />
  if (!detail) {
    return (
      <View className='ad-empty'>
        <Text>未找到该特性</Text>
      </View>
    )
  }

  return (
    <ScrollView scrollY className='ad-page'>
      {/* Hero 区域 */}
      <View className='ad-hero'>
        <View className='ad-hero-circle1' />
        <View className='ad-hero-circle2' />
        <Text className='ad-hero-name'>{detail.nameZh}</Text>
        <Text className='ad-hero-name-en'>{detail.nameEn || ''}</Text>
        {detail.introducedGeneration && (
          <View className='ad-hero-tag'>
            <Text>第{detail.introducedGeneration}世代</Text>
          </View>
        )}
      </View>

      {/* 效果说明卡片 */}
      {(detail.description || detail.effectDetail) && (
        <View className='ad-glass-card'>
          <Text className='ad-card-title'>效果</Text>
          <Text className='ad-effect-text'>{detail.effectDetail || detail.description}</Text>
        </View>
      )}

      {/* 世代变更时间线 */}
      {detail.generations?.length > 0 && (
        <View className='ad-glass-card'>
          <Text className='ad-card-title'>世代变更</Text>
          <View className='ad-timeline'>
            {detail.generations.map((gen, i) => (
              <View key={i} className='ad-timeline-item'>
                <View className={`ad-timeline-dot ${i === 0 ? 'ad-timeline-dot-first' : ''}`} />
                <View className={`ad-timeline-gen ${i === 0 ? 'ad-timeline-gen-first' : ''}`}>
                  <Text>第{gen.generation}世代</Text>
                </View>
                <Text className='ad-timeline-desc'>{gen.description || '—'}</Text>
                {gen.notes && <Text className='ad-timeline-detail'>{gen.notes}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 拥有该特性的宝可梦 */}
      <View className='ad-glass-card'>
        <Text className='ad-card-title'>拥有该特性的宝可梦</Text>
        {pokemonLoading ? (
          <Loading text='加载中…' />
        ) : pokemonList.length === 0 ? (
          <Text className='ad-muted'>暂无数据</Text>
        ) : (
          <ScrollView scrollX className='ad-pokemon-scroll-wrap'>
            <View className='ad-pokemon-scroll'>
              {pokemonList.map(p => (
                <View
                  key={p.id}
                  className='ad-pokemon-avatar-item'
                  onClick={() => Taro.navigateTo({ url: `/pages/pokemon-detail/index?id=${p.id}` })}
                >
                  <View className='ad-pokemon-avatar'>
                    <SafeImage className='ad-pokemon-avatar-img' src={p.image} mode='aspectFit' />
                  </View>
                  <Text className='ad-pokemon-avatar-name'>{p.nameZh}</Text>
                  {p.isHidden && <Text className='ad-pokemon-hidden-badge'>隐藏</Text>}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <View className='ad-bottom-spacer' />
    </ScrollView>
  )
}
