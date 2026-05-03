import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { fetchPokemonList } from '../../utils/api'
import { ALL_TYPE_OPTIONS, GENERATION_OPTIONS } from '../../utils/constants'
import { PAGE_SIZE } from '../../utils/config'
import TypeChip from '../../components/type-chip'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import './index.less'

export default function PokedexPage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedGen, setSelectedGen] = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const offsetRef = useRef(0)
  const fetchIdRef = useRef(0)

  const doFetch = useCallback(async (q, type, offset, append, gen) => {
    const id = ++fetchIdRef.current
    if (!append) setLoading(true)
    else setLoadingMore(true)

    try {
      const result = await fetchPokemonList({
        q: q || undefined,
        type: type || undefined,
        generation: gen || undefined,
        limit: PAGE_SIZE,
        offset
      })
      if (id !== fetchIdRef.current) return

      const newItems = result.data || []
      if (append) {
        setList(prev => [...prev, ...newItems])
      } else {
        setList(newItems)
      }
      setTotal(result.total ?? 0)
      setHasMore(result.hasMore ?? false)
      offsetRef.current = offset + newItems.length
    } catch (err) {
      console.error('fetchPokemonList error:', err)
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false)
        setLoadingMore(false)
        Taro.stopPullDownRefresh()
      }
    }
  }, [])

  const typeStr = selectedTypes.join(',')

  // 初始加载
  useEffect(() => {
    offsetRef.current = 0
    doFetch(query, typeStr, 0, false, selectedGen)
  }, [query, typeStr, selectedGen, doFetch])

  // 下拉刷新
  usePullDownRefresh(() => {
    offsetRef.current = 0
    doFetch(query, typeStr, 0, false, selectedGen)
  })

  // 触底加载更多
  useReachBottom(() => {
    if (!loadingMore && !loading && hasMore) {
      doFetch(query, typeStr, offsetRef.current, true, selectedGen)
    }
  })

  const handleSearch = useCallback((e) => {
    setQuery(e.detail.value || '')
  }, [])

  const handleTypeFilter = useCallback((type) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }, [])

  const handleGenFilter = useCallback((gen) => {
    setSelectedGen(prev => prev === gen ? '' : gen)
  }, [])

  const hasActiveFilters = selectedTypes.length > 0 || selectedGen !== ''

  const handleCardTap = useCallback((pokemon) => {
    Taro.navigateTo({
      url: `/pages/pokemon-detail/index?id=${pokemon.id}`
    })
  }, [])

  return (
    <View className='pokedex-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <View className='search-input-wrap'>
          <Text className='search-icon'>🔍</Text>
          <Input
            className='search-input'
            placeholder='搜索宝可梦名称…'
            confirmType='search'
            value={query}
            onConfirm={handleSearch}
            onInput={handleSearch}
          />
        </View>
        <View
          className={`filter-btn ${showFilter ? 'filter-btn-active' : ''} ${hasActiveFilters ? 'filter-btn-badge' : ''}`}
          onClick={() => setShowFilter(!showFilter)}
        >
          <Text>筛选{hasActiveFilters ? ` (${selectedTypes.length + (selectedGen ? 1 : 0)})` : ''}</Text>
        </View>
      </View>

      {/* 筛选面板 */}
      {showFilter && (
        <View className='filter-panel'>
          <Text className='filter-title'>世代</Text>
          <View className='filter-chips'>
            {GENERATION_OPTIONS.map(g => (
              <View
                key={g}
                className={`filter-chip ${selectedGen === String(g) ? 'filter-chip-active' : ''}`}
                onClick={() => handleGenFilter(String(g))}
              >
                <Text>{g}</Text>
              </View>
            ))}
          </View>
          <Text className='filter-title'>属性（可多选）</Text>
          <View className='filter-types'>
            {ALL_TYPE_OPTIONS.map(type => (
              <View
                key={type}
                className={`type-chip type-${type} ${selectedTypes.includes(type) ? 'type-chip-selected' : 'type-chip-dim'}`}
                onClick={() => handleTypeFilter(type)}
              >
                <Text>{type}</Text>
              </View>
            ))}
          </View>
          {hasActiveFilters && (
            <View className='filter-clear' onClick={() => { setSelectedTypes([]); setSelectedGen('') }}>
              <Text className='filter-clear-text'>清除筛选</Text>
            </View>
          )}
        </View>
      )}

      {/* 统计信息 */}
      {!loading && (
        <View className='stats-bar'>
          <Text className='stats-text'>
            {total > 0 ? `共 ${total} 只宝可梦` : `${list.length} 只宝可梦`}
          </Text>
        </View>
      )}

      {/* 列表 */}
      {loading && list.length === 0 ? (
        <Loading />
      ) : (
        <View className='pokemon-grid'>
          {list.length === 0 && !loading && (
            <View className='empty-state'>
              <Text>没有匹配的宝可梦</Text>
            </View>
          )}
          {list.map(pokemon => {
            const slug = pokemon.slug || pokemon.id
            return (
              <View
                key={slug}
                className='pokemon-card'
                onClick={() => handleCardTap(pokemon)}
              >
                <View className='card-img-wrap'>
                  <SafeImage
                    className='card-img'
                    src={pokemon.image?.url}
                    mode='aspectFit'
                    lazyLoad
                  />
                </View>
                <View className='card-info'>
                  <Text className='card-dex'>
                    #{String(pokemon.dexNumber || '?').padStart(4, '0')}
                  </Text>
                  <Text className='card-name'>{pokemon.nameZh}</Text>
                  <Text className='card-name-en'>{pokemon.nameEn || ''}</Text>
                  <View className='card-types'>
                    <TypeChip type={pokemon.primaryType} />
                    <TypeChip type={pokemon.secondaryType} />
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* 加载更多 */}
      {loadingMore && (
        <View className='load-more'>
          <Loading text='加载更多…' />
        </View>
      )}

      {!hasMore && list.length > 0 && !loading && (
        <View className='load-end'>
          <Text className='muted'>已加载全部</Text>
        </View>
      )}
    </View>
  )
}
