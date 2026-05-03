import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { fetchMovesList } from '../../utils/api'
import { ALL_TYPE_OPTIONS, CATEGORY_COLORS, GENERATION_OPTIONS } from '../../utils/constants'
import { PAGE_SIZE } from '../../utils/config'
import TypeChip from '../../components/type-chip'
import Loading from '../../components/loading'
import './index.less'

const CATEGORY_OPTIONS = ['物理', '特殊', '变化']

export default function MovesPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [genFilter, setGenFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

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
      const res = await fetchMovesList({
        q: keyword || undefined,
        type: typeFilter || undefined,
        category: categoryFilter || undefined,
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
      console.error('fetchMovesList error', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [keyword, typeFilter, categoryFilter, genFilter])

  useEffect(() => { loadData(true) }, [keyword, typeFilter, categoryFilter, genFilter])

  const onSearch = useCallback((e) => {
    setKeyword(e.detail.value.trim())
  }, [])

  const onScrollToLower = useCallback(() => {
    if (!loadingMore && hasMore) loadData(false)
  }, [loadingMore, hasMore, loadData])

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  return (
    <View className='moves-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <Input
          className='search-input'
          placeholder='搜索招式名称…'
          confirmType='search'
          onConfirm={onSearch}
        />
      </View>

      {/* 筛选栏 */}
      <View className='filter-bar'>
        <ScrollView scrollX className='filter-scroll'>
          <View className='filter-row'>
            {/* 分类筛选 */}
            {CATEGORY_OPTIONS.map(cat => (
              <View
                key={cat}
                className={`filter-chip ${categoryFilter === cat ? 'filter-chip-active' : ''}`}
                onClick={() => setCategoryFilter(prev => prev === cat ? '' : cat)}
              >
                <Text>{cat}</Text>
              </View>
            ))}
            <View className='filter-divider' />
            {/* 世代筛选 */}
            {GENERATION_OPTIONS.map(g => (
              <View
                key={`gen-${g}`}
                className={`filter-chip ${genFilter === String(g) ? 'filter-chip-active' : ''}`}
                onClick={() => setGenFilter(prev => prev === String(g) ? '' : String(g))}
              >
                <Text>{g}世代</Text>
              </View>
            ))}
            <View className='filter-divider' />
            {/* 属性筛选 */}
            {ALL_TYPE_OPTIONS.map(t => (
              <View
                key={t}
                className={`filter-chip ${typeFilter === t ? 'filter-chip-active' : ''}`}
                onClick={() => setTypeFilter(prev => prev === t ? '' : t)}
              >
                <Text>{t}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 结果计数 */}
      <View className='result-count'>
        <Text className='muted'>共 {total} 个招式</Text>
      </View>

      {/* 列表 */}
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的招式</Text>
        </View>
      ) : (
        <ScrollView
          scrollY
          className='moves-scroll'
          onScrollToLower={onScrollToLower}
          lowerThreshold={200}
        >
          {list.map(move => (
            <View key={move.id} className='move-card' onClick={() => toggleExpand(move.id)}>
              <View className='move-card-header'>
                <View className='move-card-left'>
                  <Text className='move-name'>{move.nameZh}</Text>
                  {move.nameEn && <Text className='move-name-en'>{move.nameEn}</Text>}
                </View>
                <View className='move-card-right'>
                  <TypeChip type={move.type} />
                  {move.category && (
                    <View
                      className='category-badge'
                      style={{ background: CATEGORY_COLORS[move.category] || '#999' }}
                    >
                      <Text className='category-text'>{move.category}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className='move-card-stats'>
                <View className='stat-item'>
                  <Text className='stat-label'>威力</Text>
                  <Text className='stat-value'>{move.power ?? '—'}</Text>
                </View>
                <View className='stat-item'>
                  <Text className='stat-label'>命中</Text>
                  <Text className='stat-value'>{move.accuracy ?? '—'}</Text>
                </View>
                <View className='stat-item'>
                  <Text className='stat-label'>PP</Text>
                  <Text className='stat-value'>{move.pp ?? '—'}</Text>
                </View>
              </View>

              {/* 展开详情 */}
              {expandedId === move.id && (
                <View className='move-card-detail'>
                  {move.description && (
                    <View className='detail-section'>
                      <Text className='detail-label'>效果</Text>
                      <Text className='detail-text'>{move.description}</Text>
                    </View>
                  )}
                  {move.effectDetail && (
                    <View className='detail-section'>
                      <Text className='detail-label'>详细说明</Text>
                      <Text className='detail-text'>{move.effectDetail}</Text>
                    </View>
                  )}
                  {move.introducedGeneration && (
                    <View className='detail-section'>
                      <Text className='detail-label'>初登场</Text>
                      <Text className='detail-text'>第 {move.introducedGeneration} 世代</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {loadingMore && <Loading text='加载更多…' />}
          {!hasMore && list.length > 0 && (
            <View className='list-end'>
              <Text className='muted'>已加载全部招式</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
