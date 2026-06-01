import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { fetchPokemonCards } from '../../utils/api'
import { TYPE_OPTIONS, GENERATION_OPTIONS } from '@pokemon-localdex/store-types/constants'
import { PAGE_SIZE } from '../../utils/config'
import TypeChip from '../../components/type-chip'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import { TYPE_BG_COLORS } from '../../utils/constants'
import './index.less'

export default function PokedexPage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedGen, setSelectedGen] = useState('')

  const offsetRef = useRef(0)
  const fetchIdRef = useRef(0)

  const doFetch = useCallback(async (q, type, offset, append, gen) => {
    const id = ++fetchIdRef.current
    if (!append) setLoading(true)
    else setLoadingMore(true)

    try {
      const result = await fetchPokemonCards({
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
      console.error('fetchPokemonCards error:', err)
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false)
        setLoadingMore(false)
        Taro.stopPullDownRefresh()
      }
    }
  }, [])

  useEffect(() => {
    offsetRef.current = 0
    doFetch(query, selectedType, 0, false, selectedGen)
  }, [query, selectedType, selectedGen, doFetch])

  usePullDownRefresh(() => {
    offsetRef.current = 0
    doFetch(query, selectedType, 0, false, selectedGen)
  })

  useReachBottom(() => {
    if (!loadingMore && !loading && hasMore) {
      doFetch(query, selectedType, offsetRef.current, true, selectedGen)
    }
  })

  // debounce 搜索：onInput 设置临时值，延迟 300ms 后才更新 query 触发请求
  const [inputValue, setInputValue] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleInput = useCallback((e) => {
    const val = e.detail.value || ''
    setInputValue(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(val), 300)
  }, [])

  const handleSearch = useCallback((e) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(e.detail.value || '')
  }, [])

  const handleTypeFilter = useCallback((type) => {
    setSelectedType(prev => prev === type ? '' : type)
  }, [])

  const handleGenFilter = useCallback((gen) => {
    setSelectedGen(prev => prev === gen ? '' : gen)
  }, [])

  const handleCardTap = useCallback((pokemon) => {
    Taro.navigateTo({
      url: `/pages/pokemon-detail/index?id=${pokemon.id}`
    })
  }, [])

  return (
    <View className='pokedex-page'>
      {/* 搜索栏 */}
      <View className='search-section'>
        <View className='search-bar-pill'>
          <Text className='search-icon'>🔍</Text>
          <Input
            className='search-input'
            placeholder='搜索宝可梦名称或编号'
            placeholderClass='search-placeholder'
            confirmType='search'
            value={inputValue}
            onConfirm={handleSearch}
            onInput={handleInput}
          />
        </View>
      </View>

      {/* 世代筛选 */}
      <ScrollView scrollX className='filter-scroll' enhanced showScrollbar={false}>
        <View className='filter-chips'>
          <View
            className={`chip ${!selectedGen ? 'chip-active' : 'chip-inactive'}`}
            onClick={() => setSelectedGen('')}
          >
            <Text>全部</Text>
          </View>
          {GENERATION_OPTIONS.map(g => (
            <View
              key={g}
              className={`chip ${selectedGen === String(g) ? 'chip-active' : 'chip-inactive'}`}
              onClick={() => handleGenFilter(String(g))}
            >
              <Text>第{g}世代</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 属性筛选 */}
      <ScrollView scrollX className='filter-scroll type-filter-scroll' enhanced showScrollbar={false}>
        <View className='type-filter-chips'>
          {TYPE_OPTIONS.map(type => {
            const isActive = selectedType === type.nameZh
            const bgColor = TYPE_BG_COLORS[type.nameZh] || '#999'
            return (
              <View
                key={type.id}
                className={`type-filter-chip ${isActive ? 'type-filter-active' : ''}`}
                style={{
                  background: bgColor,
                  opacity: !selectedType || isActive ? 1 : 0.45,
                  borderColor: isActive ? bgColor : 'transparent'
                }}
                onClick={() => handleTypeFilter(type.nameZh)}
              >
                <Text className='type-filter-text'>{type.nameZh}</Text>
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* 统计 */}
      {!loading && (
        <View className='stats-bar'>
          <Text className='stats-text'>
            {list.length > 0 ? `已加载 ${list.length} 只宝可梦` : ''}
          </Text>
        </View>
      )}

      {/* 列表 */}
      {loading && list.length === 0 ? (
        <Loading />
      ) : list.length === 0 && !loading ? (
        <View className='empty-state'>
          <Text className='empty-icon'>🔍</Text>
          <Text>没有找到相关结果</Text>
        </View>
      ) : (
        <View className='pokemon-grid'>
          {list.map(pokemon => (
            <View
              key={pokemon.id}
              className='poke-card glass-card press-scale'
              onClick={() => handleCardTap(pokemon)}
            >
              <Text className='poke-dex faint'>
                #{String(pokemon.dexNumber || '?').padStart(4, '0')}
              </Text>
              <View className='poke-img-wrap'>
                <SafeImage
                  className='poke-img'
                  src={pokemon.image?.url}
                  mode='aspectFit'
                  lazyLoad
                />
              </View>
              <Text className='poke-name'>{pokemon.nameZh}</Text>
              <View className='poke-types'>
                <TypeChip type={pokemon.primaryType} size='sm' />
                {pokemon.secondaryType && <TypeChip type={pokemon.secondaryType} size='sm' />}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 加载更多 */}
      {loadingMore && <Loading text='加载更多…' />}
      {!hasMore && list.length > 0 && !loading && (
        <View className='load-end'>
          <Text className='faint'>已加载全部</Text>
        </View>
      )}
    </View>
  )
}
