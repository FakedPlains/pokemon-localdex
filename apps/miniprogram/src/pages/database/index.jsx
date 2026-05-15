import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { fetchMovesList, fetchAbilitiesList, fetchItemsList } from '../../utils/api'
import { TYPE_OPTIONS } from '@pokemon-localdex/store-types/constants'
import { PAGE_SIZE } from '../../utils/config'
import TypeChip from '../../components/type-chip'
import CategoryBadge from '../../components/category-badge'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import { TYPE_BG_COLORS } from '../../utils/constants'
import './index.less'

const TABS = ['\u62db\u5f0f', '\u7279\u6027', '\u9053\u5177']

const CATEGORY_FILTERS = [
  { key: '', label: '\u5168\u90e8' },
  { key: '\u7269\u7406', label: '\u7269\u7406' },
  { key: '\u7279\u6b8a', label: '\u7279\u6b8a' },
  { key: '\u53d8\u5316', label: '\u53d8\u5316' },
]

export default function DatabasePage() {
  const [activeTab, setActiveTab] = useState(0)

  // 招式状态
  const [moveList, setMoveList] = useState([])
  const [moveLoading, setMoveLoading] = useState(true)
  const [moveLoadingMore, setMoveLoadingMore] = useState(false)
  const [moveHasMore, setMoveHasMore] = useState(true)
  const [moveKeyword, setMoveKeyword] = useState('')
  const [moveTypeFilter, setMoveTypeFilter] = useState('')
  const [moveCategoryFilter, setMoveCategoryFilter] = useState('')
  const moveOffsetRef = useRef(0)

  // 特性状态
  const [abilityList, setAbilityList] = useState([])
  const [abilityLoading, setAbilityLoading] = useState(false)
  const [abilityLoadingMore, setAbilityLoadingMore] = useState(false)
  const [abilityHasMore, setAbilityHasMore] = useState(true)
  const [abilityKeyword, setAbilityKeyword] = useState('')
  const abilityOffsetRef = useRef(0)
  const [abilityInited, setAbilityInited] = useState(false)

  // 道具状态
  const [itemList, setItemList] = useState([])
  const [itemLoading, setItemLoading] = useState(false)
  const [itemLoadingMore, setItemLoadingMore] = useState(false)
  const [itemHasMore, setItemHasMore] = useState(true)
  const [itemKeyword, setItemKeyword] = useState('')
  const itemOffsetRef = useRef(0)
  const [itemInited, setItemInited] = useState(false)

  // ── 招式数据加载 ──
  const loadMoves = useCallback(async (reset = false) => {
    if (reset) {
      moveOffsetRef.current = 0
      setMoveList([])
      setMoveLoading(true)
    } else {
      setMoveLoadingMore(true)
    }
    try {
      const res = await fetchMovesList({
        q: moveKeyword || undefined,
        type: moveTypeFilter || undefined,
        category: moveCategoryFilter || undefined,
        limit: PAGE_SIZE,
        offset: moveOffsetRef.current
      })
      const items = res.data || []
      if (reset) {
        setMoveList(items)
      } else {
        setMoveList(prev => [...prev, ...items])
      }
      setMoveHasMore(res.hasMore ?? false)
      moveOffsetRef.current += items.length
    } catch (e) {
      console.error('fetchMovesList error', e)
    } finally {
      setMoveLoading(false)
      setMoveLoadingMore(false)
    }
  }, [moveKeyword, moveTypeFilter, moveCategoryFilter])

  // ── 特性数据加载 ──
  const loadAbilities = useCallback(async (reset = false) => {
    if (reset) {
      abilityOffsetRef.current = 0
      setAbilityList([])
      setAbilityLoading(true)
    } else {
      setAbilityLoadingMore(true)
    }
    try {
      const res = await fetchAbilitiesList({
        q: abilityKeyword || undefined,
        limit: PAGE_SIZE,
        offset: abilityOffsetRef.current
      })
      const items = res.data || []
      if (reset) {
        setAbilityList(items)
      } else {
        setAbilityList(prev => [...prev, ...items])
      }
      setAbilityHasMore(res.hasMore ?? false)
      abilityOffsetRef.current += items.length
    } catch (e) {
      console.error('fetchAbilitiesList error', e)
    } finally {
      setAbilityLoading(false)
      setAbilityLoadingMore(false)
    }
  }, [abilityKeyword])

  // ── 道具数据加载 ──
  const loadItems = useCallback(async (reset = false) => {
    if (reset) {
      itemOffsetRef.current = 0
      setItemList([])
      setItemLoading(true)
    } else {
      setItemLoadingMore(true)
    }
    try {
      const res = await fetchItemsList({
        q: itemKeyword || undefined,
        limit: PAGE_SIZE,
        offset: itemOffsetRef.current
      })
      const items = res.data || []
      if (reset) {
        setItemList(items)
      } else {
        setItemList(prev => [...prev, ...items])
      }
      setItemHasMore(res.hasMore ?? false)
      itemOffsetRef.current += items.length
    } catch (e) {
      console.error('fetchItemsList error', e)
    } finally {
      setItemLoading(false)
      setItemLoadingMore(false)
    }
  }, [itemKeyword])

  // ── 招式：初始加载 + 筛选变化重新加载 ──
  useEffect(() => { loadMoves(true) }, [loadMoves])

  // ── 特性：首次切换到该 tab 或关键字变化时加载 ──
  useEffect(() => {
    if (activeTab === 1 && !abilityInited) {
      setAbilityInited(true)
      loadAbilities(true)
    }
  }, [activeTab, abilityInited, loadAbilities])

  useEffect(() => {
    if (abilityInited) loadAbilities(true)
  }, [abilityKeyword]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 道具：首次切换到该 tab 或关键字变化时加载 ──
  useEffect(() => {
    if (activeTab === 2 && !itemInited) {
      setItemInited(true)
      loadItems(true)
    }
  }, [activeTab, itemInited, loadItems])

  useEffect(() => {
    if (itemInited) loadItems(true)
  }, [itemKeyword]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 触底加载更多 ──
  useReachBottom(() => {
    if (activeTab === 0 && !moveLoadingMore && moveHasMore) {
      loadMoves(false)
    } else if (activeTab === 1 && !abilityLoadingMore && abilityHasMore) {
      loadAbilities(false)
    } else if (activeTab === 2 && !itemLoadingMore && itemHasMore) {
      loadItems(false)
    }
  })

  // ── 下拉刷新 ──
  usePullDownRefresh(() => {
    const doRefresh = async () => {
      if (activeTab === 0) await loadMoves(true)
      else if (activeTab === 1) await loadAbilities(true)
      else await loadItems(true)
      Taro.stopPullDownRefresh()
    }
    doRefresh()
  })

  // ── 搜索处理 ──
  const onMoveSearch = useCallback((e) => {
    setMoveKeyword(e.detail.value.trim())
  }, [])

  const onAbilitySearch = useCallback((e) => {
    setAbilityKeyword(e.detail.value.trim())
  }, [])

  const onItemSearch = useCallback((e) => {
    setItemKeyword(e.detail.value.trim())
  }, [])

  // ── 导航 ──
  const goMoveDetail = useCallback((id) => {
    Taro.navigateTo({ url: `/pages/move-detail/index?id=${id}` })
  }, [])

  const goAbilityDetail = useCallback((id) => {
    Taro.navigateTo({ url: `/pages/ability-detail/index?id=${id}` })
  }, [])

  const goItemDetail = useCallback((id) => {
    Taro.navigateTo({ url: `/pages/item-detail/index?id=${id}` })
  }, [])

  // ── 渲染招式 Tab ──
  const renderMovesTab = () => (
    <View className='db-tab-content'>
      {/* 搜索栏 */}
      <View className='search-bar-pill db-search'>
        <Text className='search-icon'>🔍</Text>
        <Input
          className='search-input'
          placeholder='搜索招式名称…'
          confirmType='search'
          onConfirm={onMoveSearch}
        />
      </View>

      {/* 分类筛选 */}
      <View className='db-filter-row'>
        {CATEGORY_FILTERS.map(cat => (
          <View
            key={cat.key || 'all'}
            className={`chip ${moveCategoryFilter === cat.key ? 'chip-active' : 'chip-inactive'}`}
            onClick={() => setMoveCategoryFilter(cat.key)}
          >
            <Text>{cat.label}</Text>
          </View>
        ))}
      </View>

      {/* 属性筛选 */}
      <ScrollView scrollX className='filter-scroll db-type-scroll'>
        <View className='db-type-row'>
          <View
            className='db-type-pill'
            style={{
              background: moveTypeFilter === '' ? '#E63946' : 'rgba(0,0,0,0.04)',
              color: moveTypeFilter === '' ? '#fff' : '#8A8A8A'
            }}
            onClick={() => setMoveTypeFilter('')}
          >
            <Text>全部</Text>
          </View>
          {TYPE_OPTIONS.map(t => (
            <View
              key={t.id}
              className='db-type-pill'
              style={{
                background: moveTypeFilter === t.nameZh
                  ? TYPE_BG_COLORS[t.nameZh]
                  : `${TYPE_BG_COLORS[t.nameZh]}33`,
                color: moveTypeFilter === t.nameZh ? '#fff' : TYPE_BG_COLORS[t.nameZh]
              }}
              onClick={() => setMoveTypeFilter(prev => prev === t.nameZh ? '' : t.nameZh)}
            >
              <Text>{t.nameZh}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 列表 */}
      {moveLoading ? (
        <Loading />
      ) : moveList.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的招式</Text>
        </View>
      ) : (
        <View className='db-list'>
          {moveList.map(move => (
            <View
              key={move.id}
              className='glass-card db-move-card press-scale'
              onClick={() => goMoveDetail(move.id)}
            >
              {/* 左侧属性色竖条 */}
              <View
                className='db-move-bar'
                style={{ background: TYPE_BG_COLORS[move.type] || '#A8A878' }}
              />
              <View className='db-move-body'>
                {/* 第一行：名称+属性 左侧，分类+数值 右侧 */}
                <View className='db-move-row'>
                  <View className='db-move-left'>
                    <Text className='db-move-name'>{move.nameZh}</Text>
                    <TypeChip type={move.type} size='sm' />
                  </View>
                  <View className='db-move-right'>
                    {move.category && (
                      <CategoryBadge category={move.category} size='sm' variant='icon' showIcon={false} />
                    )}
                    <View className='db-move-stats'>
                      <View className='db-stat'>
                        <Text className='db-stat-value'>{move.power ?? '—'}</Text>
                        <Text className='db-stat-label'>威力</Text>
                      </View>
                      <View className='db-stat'>
                        <Text className='db-stat-value'>{move.accuracy ?? '—'}</Text>
                        <Text className='db-stat-label'>命中</Text>
                      </View>
                      <View className='db-stat'>
                        <Text className='db-stat-value'>{move.pp ?? '—'}</Text>
                        <Text className='db-stat-label'>PP</Text>
                      </View>
                    </View>
                  </View>
                </View>
                {/* 第二行：简要描述 */}
                {move.description && (
                  <Text className='db-move-desc'>{move.description}</Text>
                )}
              </View>
            </View>
          ))}
          {moveLoadingMore && <Loading text='加载更多…' />}
          {!moveHasMore && moveList.length > 0 && (
            <View className='db-list-end'>
              <Text className='faint'>已加载全部招式</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )

  // ── 渲染特性 Tab ──
  const renderAbilitiesTab = () => (
    <View className='db-tab-content'>
      <View className='search-bar-pill db-search'>
        <Text className='search-icon'>🔍</Text>
        <Input
          className='search-input'
          placeholder='搜索特性名称…'
          confirmType='search'
          onConfirm={onAbilitySearch}
        />
      </View>

      {abilityLoading ? (
        <Loading />
      ) : abilityList.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的特性</Text>
        </View>
      ) : (
        <View className='db-list'>
          {abilityList.map(ability => (
            <View
              key={ability.id}
              className='glass-card db-ability-card press-scale'
              onClick={() => goAbilityDetail(ability.id)}
            >
              <Text className='db-ability-name'>{ability.nameZh}</Text>
              {ability.description && (
                <Text className='db-ability-desc'>{ability.description}</Text>
              )}
            </View>
          ))}
          {abilityLoadingMore && <Loading text='加载更多…' />}
          {!abilityHasMore && abilityList.length > 0 && (
            <View className='db-list-end'>
              <Text className='faint'>已加载全部特性</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )

  // ── 渲染道具 Tab ──
  const renderItemsTab = () => (
    <View className='db-tab-content'>
      <View className='search-bar-pill db-search'>
        <Text className='search-icon'>🔍</Text>
        <Input
          className='search-input'
          placeholder='搜索道具名称…'
          confirmType='search'
          onConfirm={onItemSearch}
        />
      </View>

      {itemLoading ? (
        <Loading />
      ) : itemList.length === 0 ? (
        <View className='empty-state'>
          <Text className='muted'>没有找到匹配的道具</Text>
        </View>
      ) : (
        <View className='db-list'>
          {itemList.map(item => (
            <View
              key={item.id}
              className='glass-card db-item-card press-scale'
              onClick={() => goItemDetail(item.id)}
            >
              <View className='db-item-header'>
                {item.imageUrl && (
                  <SafeImage className='db-item-icon' src={item.imageUrl} mode='aspectFit' />
                )}
                <View className='db-item-info'>
                  <Text className='db-item-name'>{item.nameZh}</Text>
                  {item.category && <Text className='db-item-category'>{item.category}</Text>}
                </View>
              </View>
              {(item.effectSummary || item.description) && (
                <Text className='db-item-desc'>{item.effectSummary || item.description}</Text>
              )}
            </View>
          ))}
          {itemLoadingMore && <Loading text='加载更多…' />}
          {!itemHasMore && itemList.length > 0 && (
            <View className='db-list-end'>
              <Text className='faint'>已加载全部道具</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )

  return (
    <View className='db-page'>
      {/* 分段控件 */}
      <View className='db-segment-wrap'>
        <View className='segment-control'>
          {TABS.map((tab, idx) => (
            <View
              key={tab}
              className={`segment-item ${activeTab === idx ? 'segment-active' : ''}`}
              onClick={() => setActiveTab(idx)}
            >
              <Text>{tab}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tab 内容 */}
      {activeTab === 0 && renderMovesTab()}
      {activeTab === 1 && renderAbilitiesTab()}
      {activeTab === 2 && renderItemsTab()}
    </View>
  )
}
