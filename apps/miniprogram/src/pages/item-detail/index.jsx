import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchItemDetail } from '../../utils/api'
import SafeImage from '../../components/safe-image'
import Loading from '../../components/loading'
import './index.less'

export default function ItemDetailPage() {
  const router = useRouter()
  const itemId = router.params.id

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!itemId) { setLoading(false); return }
    setLoading(true)
    fetchItemDetail(itemId).then(res => {
      setDetail(res.data)
      if (res.data) {
        Taro.setNavigationBarTitle({ title: res.data.nameZh || '道具详情' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [itemId])

  if (loading) return <Loading />
  if (!detail) {
    return (
      <View className='id-empty'>
        <Text>未找到该道具</Text>
      </View>
    )
  }

  return (
    <ScrollView scrollY className='id-page'>
      {/* Hero 区域 */}
      <View className='id-hero'>
        <View className='id-hero-circle1' />
        <View className='id-hero-circle2' />
        {detail.imageUrl && (
          <View className='id-hero-image-wrap'>
            <SafeImage className='id-hero-image' src={detail.imageUrl} mode='aspectFit' />
          </View>
        )}
        <Text className='id-hero-name'>{detail.nameZh}</Text>
        <Text className='id-hero-name-en'>{detail.nameEn || ''}</Text>
        <View className='id-hero-tags'>
          {detail.category && (
            <View className='id-hero-tag'>
              <Text>{detail.category}</Text>
            </View>
          )}
          {detail.introducedGeneration && (
            <View className='id-hero-tag'>
              <Text>第{detail.introducedGeneration}世代</Text>
            </View>
          )}
        </View>
      </View>

      {/* 效果摘要卡片 */}
      {detail.effectSummary && (
        <View className='id-glass-card'>
          <Text className='id-card-title'>效果</Text>
          <Text className='id-effect-text'>{detail.effectSummary}</Text>
        </View>
      )}

      {/* 详细效果卡片 */}
      {detail.effectDetail && detail.effectDetail !== detail.effectSummary && (
        <View className='id-glass-card'>
          <Text className='id-card-title'>详细说明</Text>
          <Text className='id-effect-text'>{detail.effectDetail}</Text>
        </View>
      )}

      {/* 世代变更时间线 */}
      {detail.generations?.length > 0 && (
        <View className='id-glass-card'>
          <Text className='id-card-title'>世代变更</Text>
          <View className='id-timeline'>
            {detail.generations.map((gen, i) => (
              <View key={i} className='id-timeline-item'>
                <View className={`id-timeline-dot ${i === 0 ? 'id-timeline-dot-first' : ''}`} />
                <View className={`id-timeline-gen ${i === 0 ? 'id-timeline-gen-first' : ''}`}>
                  <Text>第{gen.generation}世代</Text>
                </View>
                <Text className='id-timeline-desc'>{gen.description || '—'}</Text>
                {gen.notes && <Text className='id-timeline-detail'>{gen.notes}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      <View className='id-bottom-spacer' />
    </ScrollView>
  )
}
