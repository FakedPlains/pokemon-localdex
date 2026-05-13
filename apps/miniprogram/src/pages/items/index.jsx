import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { fetchItemsList, fetchItemDetail } from '../../utils/api'
import { PAGE_SIZE } from '../../utils/config'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import './index.less'

export default function ItemsPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState([])
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
      const res = await fetchItemsList({
        q: keyword || undefined,
        category: categoryFilter || undefined,
        limit: PAGE_SIZE,
        offset: offsetRef.current
      })
      const items = res.data || []
      if (reset) {
        setList(items)
        // 从第一批数据中提取分类
        if (!categoryFilter && !keyword) {
          const cats = [...new Set(items.map(i => i.category).filter(Boolean))]
          if (cats.length > 0) setCategories(cats)
        }
      } else {
        setList(prev => [...prev, ...items])
      }
      setTotal(res.total || 0)
      setHasMore(res.hasMore ?? false)
      offsetRef.current = (offsetRef.current || 0) + items.length
    } catch (e) {
      console.error('fetchItemsList error', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [keyword, categoryFilter])

  useEffect(() => { loadData(true) }, [keyword, categoryFilter])

  const onSearch = useCallback((e) => {
    setKeyword(e.detail.value.trim())
  }, [])

  const onScrollToLower = useCallback(() => {
    if (!loadingMore && hasMore) loadData(false)
  }, [loadingMore, hasMore, loadData])

  const loadDetail = useCallback((id) => {
    if (detailCache[id]) return
    fetchItemDetail(id).then(res => {
      setDetailCache(prev => ({ ...prev, [id]: res.data }))
    }).catch(e => {
      console.error('fetchItemDetail error', e)
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
    <View className='items-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <Input
          className='search-input'
          placeholder='搜索道具名称…'
          confirmType='search'
          onConfirm={onSearch}
        />
      </View>

      {/* 分类筛选 */}
      {categories.length > 0 && (
        <View className='filter-bar'>
          <ScrollView scrollX className='filter-scroll'>
            <View className='filter-row'>
              <View
                className={`filter-chip ${!categoryFilter ? 'filter-chip-active' : ''}`}
                onClick={() => setCategoryFilter('')}
              >
                <Text>全部</Text>
              </View>
              {categories.map(cat => (
                <View
                  key={cat}
                  className={`filter-chip ${categoryFilter === cat ? 'filter-chip-active' : ''}`}
                  onClick={() => setCategoryFilter(prev => prev === cat ? '' : cat)}
                >
                  <Text>{cat}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 结果计数 */}
      <View className='result-count'>
        <Text className='muted'>共 {total} 个道具</Text>
      </View>

      {/* 列表 */}
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的道具</Text>
        </View>
      ) : (
        <ScrollView
          scrollY
          className='items-scroll'
          onScrollToLower={onScrollToLower}
          lowerThreshold={200}
        >
          {list.map(item => {
            const detail = detailCache[item.id]
            return (
              <View key={item.id} className='item-card' onClick={() => toggleExpand(item.id)}>
                <View className='item-card-header'>
                  <View className='item-card-left'>
                    <SafeImage className='item-icon' src={item.imageUrl} mode='aspectFit' />
                    <View className='item-card-info'>
                      <Text className='item-name'>{item.nameZh}</Text>
                      {item.nameEn && <Text className='item-name-en'>{item.nameEn}</Text>}
                    </View>
                  </View>
                  {item.category && (
                    <View className='item-category'>
                      <Text className='item-category-text'>{item.category}</Text>
                    </View>
                  )}
                </View>

                {item.effectSummary && (
                  <View className='item-summary'>
                    <Text className='item-summary-text'>{item.effectSummary}</Text>
                  </View>
                )}

                {/* 展开详情 */}
                {expandedId === item.id && (
                  <View className='item-detail'>
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
                  <Text className='expand-arrow'>{expandedId === item.id ? '▲' : '▼'}</Text>
                </View>
              </View>
            )
          })}

          {loadingMore && <Loading text='加载更多…' />}
          {!hasMore && list.length > 0 && (
            <View className='list-end'>
              <Text className='muted'>已加载全部道具</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
