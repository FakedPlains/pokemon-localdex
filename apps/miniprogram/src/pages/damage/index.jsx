import { View, Text, Image, Input, ScrollView, Picker } from '@tarojs/components'
import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { fetchPokemonList, fetchMovesList } from '../../utils/api'
import { apiBaseUrl } from '../../utils/config'
import { NATURE_OPTIONS, NATURE_EFFECTS, STAT_KEYS, STAT_LABELS, TYPE_COLORS } from '@pokemon-localdex/store-types/constants'
import './index.less'

const WEATHER_OPTIONS = ['无', '大晴天', '下雨', '沙暴', '冰雹', '大雪']
const TERRAIN_OPTIONS = ['无', '电气场地', '青草场地', '精神场地', '薄雾场地']

function createDefaultMember() {
  return {
    pokemonId: null,
    name: '',
    sprite: '',
    types: [],
    nature: '认真',
    level: 50,
    ability: '',
    item: '',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  }
}

export default function DamagePage() {
  const [attacker, setAttacker] = useState(createDefaultMember())
  const [defender, setDefender] = useState(createDefaultMember())
  const [selectedMove, setSelectedMove] = useState(null)
  const [level, setLevel] = useState('50')
  const [weather, setWeather] = useState('无')
  const [terrain, setTerrain] = useState('无')
  const [critical, setCritical] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState(null)

  // 选择器状态
  const [pickerType, setPickerType] = useState(null) // 'attacker' | 'defender' | 'move'
  const [pickerList, setPickerList] = useState([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerPage, setPickerPage] = useState(1)
  const [pickerHasMore, setPickerHasMore] = useState(true)
  const [pickerLoading, setPickerLoading] = useState(false)

  // 打开宝可梦选择
  const openPokemonPicker = (type) => {
    setPickerType(type)
    setPickerList([])
    setPickerSearch('')
    setPickerPage(1)
    setPickerHasMore(true)
    loadPokemonPage(1, '')
  }

  // 打开招式选择
  const openMovePicker = () => {
    setPickerType('move')
    setPickerList([])
    setPickerSearch('')
    setPickerPage(1)
    setPickerHasMore(true)
    loadMovesPage(1, '')
  }

  const closePicker = () => {
    setPickerType(null)
  }

  // 加载宝可梦
  const loadPokemonPage = async (page, search) => {
    if (pickerLoading) return
    setPickerLoading(true)
    try {
      const limit = 40
      const offset = (page - 1) * limit
      const res = await fetchPokemonList({ q: search || undefined, limit, offset })
      const raw = res.data || res || []
      const data = Array.isArray(raw) ? raw : []
      setPickerList(prev => page === 1 ? data : [...prev, ...data])
      setPickerHasMore(data.length >= limit)
      setPickerPage(page)
    } catch (e) {
      console.error(e)
    } finally {
      setPickerLoading(false)
    }
  }

  // 加载招式
  const loadMovesPage = async (page, search) => {
    if (pickerLoading) return
    setPickerLoading(true)
    try {
      const limit = 40
      const offset = (page - 1) * limit
      const res = await fetchMovesList({ q: search || undefined, limit, offset })
      const raw = res.data || res || []
      const data = Array.isArray(raw) ? raw : []
      setPickerList(prev => page === 1 ? data : [...prev, ...data])
      setPickerHasMore(data.length >= limit)
      setPickerPage(page)
    } catch (e) {
      console.error(e)
    } finally {
      setPickerLoading(false)
    }
  }

  const handlePickerSearch = (e) => {
    const val = e.detail.value
    setPickerSearch(val)
    setPickerList([])
    setPickerPage(1)
    if (pickerType === 'move') {
      loadMovesPage(1, val)
    } else {
      loadPokemonPage(1, val)
    }
  }

  const handlePickerLoadMore = () => {
    if (!pickerHasMore || pickerLoading) return
    if (pickerType === 'move') {
      loadMovesPage(pickerPage + 1, pickerSearch)
    } else {
      loadPokemonPage(pickerPage + 1, pickerSearch)
    }
  }

  // 选择宝可梦
  const selectPokemon = (pokemon) => {
    const member = {
      ...createDefaultMember(),
      pokemonId: pokemon.id,
      name: pokemon.name_zh || pokemon.name,
      sprite: pokemon.sprite || '',
      types: pokemon.types || [],
    }
    if (pickerType === 'attacker') {
      setAttacker(member)
    } else {
      setDefender(member)
    }
    closePicker()
  }

  // 选择招式
  const selectMove = (move) => {
    setSelectedMove(move)
    closePicker()
  }

  // EV 修改
  const handleEvChange = (side, key, value) => {
    const val = Math.max(0, Math.min(252, Number(value) || 0))
    if (side === 'attacker') {
      setAttacker(prev => ({ ...prev, evs: { ...prev.evs, [key]: val } }))
    } else {
      setDefender(prev => ({ ...prev, evs: { ...prev.evs, [key]: val } }))
    }
  }

  // 性格修改
  const handleNatureChange = (side, e) => {
    const nature = NATURE_OPTIONS[e.detail.value]
    if (side === 'attacker') {
      setAttacker(prev => ({ ...prev, nature }))
    } else {
      setDefender(prev => ({ ...prev, nature }))
    }
  }

  // 计算伤害
  const handleCalculate = useCallback(async () => {
    if (!selectedMove) {
      Taro.showToast({ title: '请先选择招式', icon: 'none' })
      return
    }
    if (!attacker.pokemonId) {
      Taro.showToast({ title: '请选择攻击方', icon: 'none' })
      return
    }
    if (!defender.pokemonId) {
      Taro.showToast({ title: '请选择防守方', icon: 'none' })
      return
    }

    setCalculating(true)
    try {
      const body = {
        generation: 9,
        attacker: {
          name: attacker.name,
          level: Number(level || 50),
          nature: attacker.nature || '认真',
          ability: attacker.ability || '',
          item: attacker.item || '',
          evs: attacker.evs,
          ivs: attacker.ivs,
        },
        defender: {
          name: defender.name,
          level: Number(level || 50),
          nature: defender.nature || '认真',
          ability: defender.ability || '',
          item: defender.item || '',
          evs: defender.evs,
          ivs: defender.ivs,
        },
        move: {
          name: selectedMove.name_zh || selectedMove.name || '',
          isCrit: critical,
        },
        field: {
          weather: weather === '无' ? '' : weather,
          terrain: terrain === '无' ? '' : terrain,
        }
      }

      const res = await Taro.request({
        url: `${apiBaseUrl}/api/battle/damage`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: body,
      })

      if (res.statusCode === 200 && res.data) {
        const data = res.data
        setResult({
          min: data.min,
          max: data.max,
          average: data.average,
          description: data.description || '',
          minPercent: data.minPercent || 0,
          maxPercent: data.maxPercent || 0,
          defHp: data.defenderHp || 0,
          moveName: selectedMove.name_zh || selectedMove.name || '',
          moveType: selectedMove.type || '',
          attackerName: attacker.name,
          defenderName: defender.name,
        })
      } else {
        Taro.showToast({ title: '计算失败', icon: 'none' })
      }
    } catch (e) {
      console.error('计算伤害出错:', e)
      Taro.showToast({ title: '计算出错', icon: 'none' })
    } finally {
      setCalculating(false)
    }
  }, [attacker, defender, selectedMove, level, weather, terrain, critical])

  // 伤害条颜色
  const getBarColor = (percent) => {
    if (percent >= 100) return 'bar-red'
    if (percent >= 50) return 'bar-yellow'
    return 'bar-green'
  }

  return (
    <View className='damage-page'>
      {/* 攻击方 */}
      <View className='section'>
        <Text className='section-title'>攻击方</Text>
        <View className='pokemon-selector' onClick={() => openPokemonPicker('attacker')}>
          {attacker.sprite ? (
            <Image className='selector-sprite' src={attacker.sprite} mode='aspectFit' />
          ) : null}
          <View className='selector-info'>
            {attacker.name ? (
              <Text className='selector-name'>{attacker.name}</Text>
            ) : (
              <Text className='selector-hint'>点击选择宝可梦</Text>
            )}
          </View>
          <Text className='selector-arrow'>›</Text>
        </View>

        {attacker.pokemonId && (
          <View>
            <View className='form-row'>
              <Text className='form-label'>性格</Text>
              <Picker mode='selector' range={NATURE_OPTIONS} onChange={(e) => handleNatureChange('attacker', e)}>
                <View className='form-picker'>
                  <Text>{attacker.nature}{NATURE_EFFECTS[attacker.nature] ? ` (+${STAT_LABELS[NATURE_EFFECTS[attacker.nature].up]} -${STAT_LABELS[NATURE_EFFECTS[attacker.nature].down]})` : ''}</Text>
                </View>
              </Picker>
            </View>
            {STAT_KEYS.map(key => (
              <View key={key} className='stat-row'>
                <Text className='stat-label'>{STAT_LABELS[key]}</Text>
                <Input
                  className='stat-input'
                  type='number'
                  value={String(attacker.evs[key])}
                  onBlur={(e) => handleEvChange('attacker', key, e.detail.value)}
                  placeholder='EV'
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 防守方 */}
      <View className='section'>
        <Text className='section-title'>防守方</Text>
        <View className='pokemon-selector' onClick={() => openPokemonPicker('defender')}>
          {defender.sprite ? (
            <Image className='selector-sprite' src={defender.sprite} mode='aspectFit' />
          ) : null}
          <View className='selector-info'>
            {defender.name ? (
              <Text className='selector-name'>{defender.name}</Text>
            ) : (
              <Text className='selector-hint'>点击选择宝可梦</Text>
            )}
          </View>
          <Text className='selector-arrow'>›</Text>
        </View>

        {defender.pokemonId && (
          <View>
            <View className='form-row'>
              <Text className='form-label'>性格</Text>
              <Picker mode='selector' range={NATURE_OPTIONS} onChange={(e) => handleNatureChange('defender', e)}>
                <View className='form-picker'>
                  <Text>{defender.nature}{NATURE_EFFECTS[defender.nature] ? ` (+${STAT_LABELS[NATURE_EFFECTS[defender.nature].up]} -${STAT_LABELS[NATURE_EFFECTS[defender.nature].down]})` : ''}</Text>
                </View>
              </Picker>
            </View>
            {STAT_KEYS.map(key => (
              <View key={key} className='stat-row'>
                <Text className='stat-label'>{STAT_LABELS[key]}</Text>
                <Input
                  className='stat-input'
                  type='number'
                  value={String(defender.evs[key])}
                  onBlur={(e) => handleEvChange('defender', key, e.detail.value)}
                  placeholder='EV'
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 招式选择 */}
      <View className='section'>
        <Text className='section-title'>招式</Text>
        <View className='pokemon-selector' onClick={openMovePicker}>
          <View className='selector-info'>
            {selectedMove ? (
              <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text className='selector-name'>{selectedMove.name_zh || selectedMove.name}</Text>
                {selectedMove.type && (
                  <Text style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', color: '#fff', background: TYPE_COLORS[selectedMove.type] || '#999' }}>
                    {selectedMove.type}
                  </Text>
                )}
                {selectedMove.power && (
                  <Text style={{ fontSize: '12px', color: '#666' }}>威力:{selectedMove.power}</Text>
                )}
              </View>
            ) : (
              <Text className='selector-hint'>点击选择招式</Text>
            )}
          </View>
          <Text className='selector-arrow'>›</Text>
        </View>
      </View>

      {/* 战斗设置 */}
      <View className='section'>
        <Text className='section-title'>战斗设置</Text>
        <View className='form-row'>
          <Text className='form-label'>等级</Text>
          <Input
            className='form-input'
            type='number'
            value={level}
            onBlur={(e) => setLevel(e.detail.value || '50')}
          />
        </View>
        <View className='form-row'>
          <Text className='form-label'>天气</Text>
          <Picker mode='selector' range={WEATHER_OPTIONS} onChange={(e) => setWeather(WEATHER_OPTIONS[e.detail.value])}>
            <View className='form-picker'><Text>{weather}</Text></View>
          </Picker>
        </View>
        <View className='form-row'>
          <Text className='form-label'>场地</Text>
          <Picker mode='selector' range={TERRAIN_OPTIONS} onChange={(e) => setTerrain(TERRAIN_OPTIONS[e.detail.value])}>
            <View className='form-picker'><Text>{terrain}</Text></View>
          </Picker>
        </View>
        <View className='form-row'>
          <Text className='form-label'>会心</Text>
          <View
            style={{ width: '40px', height: '24px', borderRadius: '12px', background: critical ? '#4caf50' : '#ddd', position: 'relative', transition: 'background 0.2s' }}
            onClick={() => setCritical(!critical)}
          >
            <View style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: critical ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></View>
          </View>
        </View>
      </View>

      {/* 计算按钮 */}
      <View
        className={`calc-btn ${calculating ? 'calc-btn-disabled' : ''}`}
        onClick={calculating ? null : handleCalculate}
      >
        <Text>{calculating ? '计算中...' : '计算伤害'}</Text>
      </View>

      {/* 结果 */}
      {result && (
        <View className='section result-section'>
          <Text className='result-title'>计算结果</Text>
          <View className='result-item'>
            <Text className='result-move-name'>
              {result.attackerName} 的 {result.moveName} → {result.defenderName}
            </Text>
            <Text className='result-damage-range'>
              伤害: {result.min} ~ {result.max} ({result.minPercent.toFixed(1)}% ~ {result.maxPercent.toFixed(1)}%)
            </Text>
            <View className='result-bar'>
              <View
                className={`result-bar-fill ${getBarColor(result.maxPercent)}`}
                style={{ width: `${Math.min(100, result.maxPercent)}%` }}
              ></View>
            </View>
            {result.description && (
              <Text className='result-ko'>{result.description}</Text>
            )}
          </View>
        </View>
      )}

      {/* 宝可梦选择弹窗 */}
      {(pickerType === 'attacker' || pickerType === 'defender') && (
        <View className='picker-modal'>
          <View className='picker-mask' onClick={closePicker}></View>
          <View className='picker-content'>
            <View className='picker-header'>
              <Text className='picker-title'>选择{pickerType === 'attacker' ? '攻击方' : '防守方'}宝可梦</Text>
              <Text className='close-btn' onClick={closePicker}>关闭</Text>
            </View>
            <View className='search-bar'>
              <Input
                className='search-input'
                placeholder='搜索宝可梦...'
                value={pickerSearch}
                onConfirm={handlePickerSearch}
                onBlur={handlePickerSearch}
              />
            </View>
            <ScrollView scrollY className='pokemon-list' onScrollToLower={handlePickerLoadMore}>
              {pickerList.map(pokemon => (
                <View key={pokemon.id} className='pokemon-item' onClick={() => selectPokemon(pokemon)}>
                  {pokemon.sprite && (
                    <Image className='poke-sprite' src={pokemon.sprite} mode='aspectFit' />
                  )}
                  <View className='poke-info'>
                    <Text className='poke-name'>#{pokemon.id} {pokemon.name_zh || pokemon.name}</Text>
                  </View>
                </View>
              ))}
              {pickerLoading && <View className='loading-more'><Text>加载中...</Text></View>}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 招式选择弹窗 */}
      {pickerType === 'move' && (
        <View className='move-picker-modal'>
          <View className='picker-mask' onClick={closePicker}></View>
          <View className='picker-content'>
            <View className='picker-header'>
              <Text className='picker-title'>选择招式</Text>
              <Text className='close-btn' onClick={closePicker}>关闭</Text>
            </View>
            <View className='search-bar'>
              <Input
                className='search-input'
                placeholder='搜索招式...'
                value={pickerSearch}
                onConfirm={handlePickerSearch}
                onBlur={handlePickerSearch}
              />
            </View>
            <ScrollView scrollY className='move-list' onScrollToLower={handlePickerLoadMore}>
              {pickerList.map(move => (
                <View key={move.id} className='move-list-item' onClick={() => selectMove(move)}>
                  <Text className='move-item-name'>{move.name_zh || move.name}</Text>
                  {move.type && (
                    <Text className='move-item-type' style={{ background: TYPE_COLORS[move.type] || '#999' }}>
                      {move.type}
                    </Text>
                  )}
                  <Text className='move-item-power'>{move.power || '-'}</Text>
                </View>
              ))}
              {pickerLoading && <View className='loading-more'><Text>加载中...</Text></View>}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
