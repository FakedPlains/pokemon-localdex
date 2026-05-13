import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { fetchAbilitiesList, fetchAbilityDetail } from '../../utils/api'
import { PAGE_SIZE } from '../../utils/config'
import { GENERATION_OPTIONS } from '@pokemon-localdex/store-types/constants'
import Loading from '../../components/loading'
import './index.less'

export default function AbilitiesPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [genFilter, setGenFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [detailCache, setDetailCache] = useState({})

  const offsetRef = useRef(0)

  const loadData = useCallback(async (reset = false) => {
    if (reset) {
      offsetRef.current = 0
      setList([])
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const res = await fetchAbilitiesList({
        q: keyword || undefined,
        generation: genFilter || undefined,
        limit: PAGE_SIZE,
        offset: offsetRef.current
      })
      const items = res.data || []
      if (reset) {
        setList(items)
      } else {
        setList(prev => [...prev, ...items])
      }
      setTotal(res.total || 0)
      setHasMore(res.hasMore ?? false)
      offsetRef.current = (offsetRef.current || 0) + items.length
    } catch (e) {
      console.error('fetchAbilitiesList error', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [keyword, genFilter])

  useEffect(() => { loadData(true) }, [keyword, genFilter])

  const onSearch = useCallback((e) => {
    setKeyword(e.detail.value.trim())
  }, [])

  const onScrollToLower = useCallback(() => {
    if (!loadingMore && hasMore) loadData(false)
  }, [loadingMore, hasMore, loadData])

  const loadDetail = useCallback((id) => {
    if (detailCache[id]) return
    fetchAbilityDetail(id).then(res => {
      setDetailCache(prev => ({ ...prev, [id]: res.data }))
    }).catch(e => {
      console.error('fetchAbilityDetail error', e)
    })
  }, [detailCache])

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => {
      if (prev === id) return null
      loadDetail(id)
      return id
    })
  }, [loadDetail])

  return (
    <View className='abilities-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <Input
          className='search-input'
          placeholder='搜索特性名称…'
          confirmType='search'
          onConfirm={onSearch}
        />
      </View>

      {/* 世代筛选 */}
      <View className='filter-bar'>
        <ScrollView scrollX className='filter-scroll'>
          <View className='filter-row'>
            {GENERATION_OPTIONS.map(g => (
              <View
                key={g}
                className={`filter-chip ${genFilter === String(g) ? 'filter-chip-active' : ''}`}
                onClick={() => setGenFilter(prev => prev === String(g) ? '' : String(g))}
              >
                <Text>{g}世代</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 结果计数 */}
      <View className='result-count'>
        <Text className='muted'>共 {total} 个特性</Text>
      </View>

      {/* 列表 */}
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的特性</Text>
        </View>
      ) : (
        <ScrollView
          scrollY
          className='abilities-scroll'
          onScrollToLower={onScrollToLower}
          lowerThreshold={200}
        >
          {list.map(ability => {
            const detail = detailCache[ability.id]
            return (
              <View key={ability.id} className='ability-card' onClick={() => toggleExpand(ability.id)}>
                <View className='ability-card-header'>
                  <View className='ability-card-left'>
                    {ability.number && (
                      <Text className='ability-number'>#{String(ability.number).padStart(3, '0')}</Text>
                    )}
                    <Text className='ability-name'>{ability.nameZh}</Text>
                  </View>
                  <View className='ability-card-right'>
                    {ability.nameEn && <Text className='ability-name-en'>{ability.nameEn}</Text>}
                  </View>
                </View>

                {ability.description && (
                  <View className='ability-desc'>
                    <Text className='ability-desc-text'>{ability.description}</Text>
                  </View>
                )}

                {/* 展开详情 */}
                {expandedId === ability.id && (
                  <View className='ability-detail'>
                    {!detail ? (
                      <View className='detail-section'>
                        <Text className='detail-text'>加载中…</Text>
                      </View>
                    ) : (
                      <>
                        {detail.nameJa && (
                          <View className='detail-section'>
                            <Text className='detail-label'>日文名</Text>
                            <Text className='detail-text'>{detail.nameJa}</Text>
                          </View>
                        )}
                        {detail.effectDetail && (
                          <View className='detail-section'>
                            <Text className='detail-label'>详细效果</Text>
                            <Text className='detail-text'>{detail.effectDetail}</Text>
                          </View>
                        )}
                        {detail.introducedGeneration && (
                          <View className='detail-section'>
                            <Text className='detail-label'>初登场</Text>
                            <Text className='detail-text'>第 {detail.introducedGeneration} 世代</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}

                <View className='expand-indicator'>
                  <Text className='expand-arrow'>{expandedId === ability.id ? '▲' : '▼'}</Text>
                </View>
              </View>
            )
          })}

          {loadingMore && <Loading text='加载更多…' />}
          {!hasMore && list.length > 0 && (
            <View className='list-end'>
              <Text className='muted'>已加载全部特性</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
