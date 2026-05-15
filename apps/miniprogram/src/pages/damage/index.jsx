import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { fetchPokemonCards, fetchMovesList } from '../../utils/api'
import { apiBaseUrl } from '../../utils/config'
import SafeImage from '../../components/safe-image'
import TypeChip from '../../components/type-chip'
import {
  NATURES, NATURE_EFFECTS_BY_ID, STAT_KEYS, STAT_LABELS, STAT_LABELS_BY_ID,
  TYPE_COLORS, natureNameToId,
} from '@pokemon-localdex/store-types/constants'
import { TYPE_BG_COLORS } from '../../utils/constants'
import './index.less'

const WEATHER_OPTIONS = [
  { key: '', label: '无' },
  { key: 'sun', label: '大晴天' },
  { key: 'rain', label: '下雨' },
  { key: 'sand', label: '沙暴' },
  { key: 'hail', label: '冰雹' },
  { key: 'snow', label: '大雪' },
]
const TERRAIN_OPTIONS = [
  { key: '', label: '无' },
  { key: 'electric', label: '电气场地' },
  { key: 'grassy', label: '青草场地' },
  { key: 'psychic', label: '精神场地' },
  { key: 'misty', label: '薄雾场地' },
]
const WEATHER_LABELS = WEATHER_OPTIONS.map(o => o.label)
const TERRAIN_LABELS = TERRAIN_OPTIONS.map(o => o.label)
const NATURE_OPTIONS = NATURES.map(nature => nature.nameZh)
const GENERATION_OPTIONS = [
  { id: 9, label: '第九世代' },
  { id: 8, label: '第八世代' },
  { id: 7, label: '第七世代' },
  { id: 6, label: '第六世代' },
  { id: 5, label: '第五世代' },
  { id: 4, label: '第四世代' },
  { id: 3, label: '第三世代' },
  { id: 2, label: '第二世代' },
  { id: 1, label: '第一世代' },
]
const GENERATION_LABELS = GENERATION_OPTIONS.map(g => g.label)

// hex -> r,g,b 字符串
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `${r},${g},${b}`
}

function formatNatureEffect(natureName) {
  const effect = NATURE_EFFECTS_BY_ID[natureNameToId(natureName)]
  return effect ? ` (+${STAT_LABELS_BY_ID[effect.up]} -${STAT_LABELS_BY_ID[effect.down]})` : ''
}

function formatEvSummary(evs) {
  const parts = []
  if (evs.hp) parts.push(`HP${evs.hp}`)
  if (evs.atk) parts.push(`攻${evs.atk}`)
  if (evs.def) parts.push(`防${evs.def}`)
  if (evs.spa) parts.push(`特攻${evs.spa}`)
  if (evs.spd) parts.push(`特防${evs.spd}`)
  if (evs.spe) parts.push(`速${evs.spe}`)
  return parts.length ? parts.join('/') : '未分配'
}

function createDefaultMember() {
  return {
    pokemonId: null,
    name: '',
    imageUrl: '',
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
  const [moves, setMoves] = useState([null, null, null, null])
  const [activeMoveIndex, setActiveMoveIndex] = useState(0)
  const [level, setLevel] = useState('50')
  const [generation, setGeneration] = useState(9)
  const [battleMode, setBattleMode] = useState('single')
  const [weather, setWeather] = useState(WEATHER_OPTIONS[0])
  const [terrain, setTerrain] = useState(TERRAIN_OPTIONS[0])
  const [critical, setCritical] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState(null)
  const [fieldExpanded, setFieldExpanded] = useState(false)

  // EV 编辑弹窗
  const [evEditSide, setEvEditSide] = useState(null)
  const [evEditValues, setEvEditValues] = useState({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })

  // 选择器状态
  const [pickerType, setPickerType] = useState(null)
  const [pickerList, setPickerList] = useState([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerPage, setPickerPage] = useState(1)
  const [pickerHasMore, setPickerHasMore] = useState(true)
  const [pickerLoading, setPickerLoading] = useState(false)

  const openPokemonPicker = (type) => {
    setPickerType(type)
    setPickerList([])
    setPickerSearch('')
    setPickerPage(1)
    setPickerHasMore(true)
    loadPokemonPage(1, '')
  }

  const openMovePicker = (index) => {
    setActiveMoveIndex(index)
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

  const loadPokemonPage = async (page, search) => {
    if (pickerLoading) return
    setPickerLoading(true)
    try {
      const limit = 40
      const offset = (page - 1) * limit
      const res = await fetchPokemonCards({ q: search || undefined, limit, offset })
      const data = res.data || []
      setPickerList(prev => page === 1 ? data : [...prev, ...data])
      setPickerHasMore(res.hasMore ?? data.length >= limit)
      setPickerPage(page)
    } catch (e) {
      console.error(e)
    } finally {
      setPickerLoading(false)
    }
  }

  const loadMovesPage = async (page, search) => {
    if (pickerLoading) return
    setPickerLoading(true)
    try {
      const limit = 40
      const offset = (page - 1) * limit
      const res = await fetchMovesList({ q: search || undefined, limit, offset })
      const data = res.data || []
      setPickerList(prev => page === 1 ? data : [...prev, ...data])
      setPickerHasMore(res.hasMore ?? data.length >= limit)
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

  const selectPokemon = (pokemon) => {
    const member = {
      ...createDefaultMember(),
      pokemonId: pokemon.id,
      name: pokemon.nameZh || pokemon.nameEn || '',
      imageUrl: pokemon.image?.url || '',
      types: [pokemon.primaryType, pokemon.secondaryType].filter(Boolean),
    }
    if (pickerType === 'attacker') {
      setAttacker(member)
    } else {
      setDefender(member)
    }
    closePicker()
  }

  const selectMove = (move) => {
    const newMoves = [...moves]
    newMoves[activeMoveIndex] = move
    setMoves(newMoves)
    setSelectedMove(move)
    closePicker()
  }

  const handleMoveSlotTap = (index) => {
    if (moves[index]) {
      setSelectedMove(moves[index])
      setActiveMoveIndex(index)
    } else {
      openMovePicker(index)
    }
  }

  const handleEvChange = (side, key, value) => {
    const val = Math.max(0, Math.min(252, Number(value) || 0))
    if (side === 'attacker') {
      setAttacker(prev => ({ ...prev, evs: { ...prev.evs, [key]: val } }))
    } else {
      setDefender(prev => ({ ...prev, evs: { ...prev.evs, [key]: val } }))
    }
  }

  const handleNatureChange = (side, e) => {
    const nature = NATURES[e.detail.value]?.nameZh || '认真'
    if (side === 'attacker') {
      setAttacker(prev => ({ ...prev, nature }))
    } else {
      setDefender(prev => ({ ...prev, nature }))
    }
  }

  const openEvEditor = (side) => {
    const member = side === 'attacker' ? attacker : defender
    setEvEditSide(side)
    setEvEditValues({ ...member.evs })
  }

  const closeEvEditor = () => {
    setEvEditSide(null)
  }

  const handleEvEditChange = (key, value) => {
    const val = Math.max(0, Math.min(252, Number(value) || 0))
    setEvEditValues(prev => ({ ...prev, [key]: val }))
  }

  const confirmEvEdit = () => {
    if (evEditSide === 'attacker') {
      setAttacker(prev => ({ ...prev, evs: { ...evEditValues } }))
    } else {
      setDefender(prev => ({ ...prev, evs: { ...evEditValues } }))
    }
    closeEvEditor()
  }

  const handleGenerationChange = (e) => {
    const gen = GENERATION_OPTIONS[e.detail.value]
    if (gen) setGeneration(gen.id)
  }

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
        generation: generation,
        attacker: {
          pokemonId: attacker.pokemonId,
          name: attacker.name,
          level: Number(level || 50),
          nature: attacker.nature || '认真',
          ability: attacker.ability || '',
          item: attacker.item || '',
          evs: attacker.evs,
          ivs: attacker.ivs,
        },
        defender: {
          pokemonId: defender.pokemonId,
          name: defender.name,
          level: Number(level || 50),
          nature: defender.nature || '认真',
          ability: defender.ability || '',
          item: defender.item || '',
          evs: defender.evs,
          ivs: defender.ivs,
        },
        move: {
          id: selectedMove.id,
          name: selectedMove.nameZh || selectedMove.nameEn || '',
          isCrit: critical,
        },
        field: {
          weather: weather.key || '',
          terrain: terrain.key || '',
          gameType: battleMode === 'double' ? 'doubles' : 'singles',
        }
      }

      const res = await Taro.request({
        url: `${apiBaseUrl}/api/battle/damage`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: body,
      })

      if (res.statusCode === 200 && res.data) {
        const data = res.data.data || res.data
        setResult({
          min: data.min,
          max: data.max,
          average: data.average,
          description: data.description || '',
          minPercent: data.minPercent || 0,
          maxPercent: data.maxPercent || 0,
          defHp: data.defenderHp || 0,
          moveName: selectedMove.nameZh || selectedMove.nameEn || '',
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
  }, [attacker, defender, selectedMove, level, generation, battleMode, weather, terrain, critical])

  const getBarColor = (percent) => {
    if (percent >= 100) return 'dc-bar-red'
    if (percent >= 50) return 'dc-bar-yellow'
    return 'dc-bar-green'
  }

  const getKoDescription = (r) => {
    if (!r) return ''
    if (r.minPercent >= 100) return '确定一击'
    if (r.maxPercent >= 100) return '乱数一击'
    if (r.minPercent >= 50) return '确定二击'
    if (r.maxPercent >= 50) return '乱数二击'
    if (r.minPercent >= 34) return '确定三击'
    if (r.maxPercent >= 34) return '乱数三击'
    return ''
  }

  const renderSideCard = (side, member, sideLabel, sideColor, sideBgColor) => (
    <View className='dc-side-card glass-card'>
      <View className='dc-side-header'>
        <Text className='dc-side-label' style={{ background: sideBgColor, color: sideColor }}>{sideLabel}</Text>
      </View>

      <View className='dc-pokemon-select press-scale' onClick={() => openPokemonPicker(side)}>
        <View className='dc-pokemon-sprite-wrap'>
          {member.imageUrl ? (
            <SafeImage className='dc-pokemon-sprite' src={member.imageUrl} mode='aspectFit' />
          ) : (
            <View className='dc-pokemon-sprite-placeholder'>
              <Text className='dc-placeholder-icon'>+</Text>
            </View>
          )}
        </View>
        <View className='dc-pokemon-info'>
          {member.name ? (
            <View className='dc-pokemon-name-row'>
              <Text className='dc-pokemon-name'>{member.name}</Text>
              <View className='dc-pokemon-types'>
                {member.types.map(t => <TypeChip key={t} type={t} size='sm' />)}
              </View>
            </View>
          ) : (
            <Text className='dc-pokemon-hint'>选择宝可梦</Text>
          )}
        </View>
        <Text className='dc-arrow'>›</Text>
      </View>

      {member.pokemonId && (
        <View className='dc-config-grid'>
          <Picker mode='selector' range={NATURE_OPTIONS} onChange={(e) => handleNatureChange(side, e)}>
            <View className='dc-config-tag press-scale'>
              <Text className='dc-config-tag-label'>性格</Text>
              <Text className='dc-config-tag-value'>{member.nature}{formatNatureEffect(member.nature)}</Text>
            </View>
          </Picker>
          <View className='dc-config-tag'>
            <Text className='dc-config-tag-label'>特性</Text>
            <Text className='dc-config-tag-value'>{member.ability || '—'}</Text>
          </View>
          <View className='dc-config-tag'>
            <Text className='dc-config-tag-label'>道具</Text>
            <Text className='dc-config-tag-value'>{member.item || '—'}</Text>
          </View>
          <View className='dc-config-tag press-scale' onClick={() => openEvEditor(side)}>
            <Text className='dc-config-tag-label'>EV</Text>
            <Text className='dc-config-tag-value'>{formatEvSummary(member.evs)}</Text>
          </View>
        </View>
      )}

      {side === 'attacker' && member.pokemonId && (
        <View className='dc-move-grid'>
          {moves.map((move, idx) => {
            const isActive = move && selectedMove && move.id === selectedMove.id
            const moveType = move?.type || ''
            const typeColor = TYPE_BG_COLORS[moveType] || '#999'
            return (
              <View
                key={idx}
                className={`dc-move-slot press-scale ${isActive ? 'dc-move-slot-active' : ''}`}
                style={isActive ? { background: `rgba(${hexToRgb(typeColor)}, 0.10)`, borderColor: typeColor } : {}}
                onClick={() => move ? handleMoveSlotTap(idx) : openMovePicker(idx)}
              >
                {move ? (
                  <>
                    <View className='dc-move-type-bar' style={{ background: typeColor }} />
                    <Text className='dc-move-slot-name'>{move.nameZh || move.nameEn}</Text>
                    {move.power ? <Text className='dc-move-slot-power'>{move.power}</Text> : null}
                  </>
                ) : (
                  <Text className='dc-move-slot-empty'>+ 招式 {idx + 1}</Text>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )

  return (
    <View className='damage-page'>
      {/* 全局设置行 */}
      <View className='dc-global-bar'>
        <Picker mode='selector' range={GENERATION_LABELS} onChange={handleGenerationChange}>
          <View className='dc-gen-chip chip chip-active press-scale'>
            <Text>{GENERATION_OPTIONS.find(g => g.id === generation)?.label || '第九世代'}</Text>
          </View>
        </Picker>
        <View className='dc-level-chip chip chip-inactive press-scale'>
          <Text>Lv.</Text>
          <Input className='dc-level-input' type='number' value={level} onBlur={(e) => setLevel(e.detail.value || '50')} />
        </View>
        <View className='dc-battle-mode segment-control'>
          <View className={`segment-item ${battleMode === 'single' ? 'segment-active' : ''}`} onClick={() => setBattleMode('single')}>
            <Text>单打</Text>
          </View>
          <View className={`segment-item ${battleMode === 'double' ? 'segment-active' : ''}`} onClick={() => setBattleMode('double')}>
            <Text>双打</Text>
          </View>
        </View>
      </View>

      {/* 攻击方卡片 */}
      {renderSideCard('attacker', attacker, '攻击方', '#E63946', 'rgba(230,57,70,0.10)')}

      {/* 计算按钮 */}
      <View className={`dc-calc-btn press-scale ${calculating ? 'dc-calc-btn-disabled' : ''}`} onClick={calculating ? null : handleCalculate}>
        <Text className='dc-calc-btn-text'>{calculating ? '计算中...' : '计算伤害'}</Text>
      </View>

      {/* 计算结果区域 */}
      {result && (
        <View className='dc-result-card'>
          <View className='dc-result-header'>
            <Text className='dc-result-label'>{result.attackerName} → {result.defenderName}</Text>
            <Text className='dc-result-move-tag' style={{ background: TYPE_COLORS[result.moveType] || '#999' }}>{result.moveName}</Text>
          </View>
          <View className='dc-result-percent-row'>
            <Text className='dc-result-percent'>{result.minPercent.toFixed(1)}% ~ {result.maxPercent.toFixed(1)}%</Text>
          </View>
          <View className='dc-result-damage-row'>
            <Text className='dc-result-damage-text'>{result.min} ~ {result.max} / {result.defHp} HP</Text>
          </View>
          <View className='dc-result-bar'>
            <View className={`dc-result-bar-fill ${getBarColor(result.maxPercent)}`} style={{ width: `${Math.min(100, result.maxPercent)}%` }} />
          </View>
          {getKoDescription(result) ? (
            <View className='dc-ko-pill'>
              <Text className='dc-ko-pill-text'>{getKoDescription(result)}</Text>
            </View>
          ) : null}
          {result.description ? <Text className='dc-result-desc'>{result.description}</Text> : null}
        </View>
      )}

      {/* 防守方卡片 */}
      {renderSideCard('defender', defender, '防守方', '#6890F0', 'rgba(104,144,240,0.10)')}

      {/* 场地设置（折叠） */}
      <View className='dc-field-card glass-card'>
        <View className='dc-field-header press-scale' onClick={() => setFieldExpanded(!fieldExpanded)}>
          <Text className='dc-field-title'>场地设置</Text>
          <View className='dc-field-summary'>
            {weather.key && <Text className='dc-field-tag'>{weather.label}</Text>}
            {terrain.key && <Text className='dc-field-tag'>{terrain.label}</Text>}
            {critical && <Text className='dc-field-tag'>会心</Text>}
            {!weather.key && !terrain.key && !critical && <Text className='dc-field-tag-empty'>默认</Text>}
          </View>
          <Text className={`dc-field-arrow ${fieldExpanded ? 'dc-field-arrow-up' : ''}`}>›</Text>
        </View>
        {fieldExpanded && (
          <View className='dc-field-body'>
            <View className='dc-field-row'>
              <Text className='dc-field-label'>天气</Text>
              <Picker mode='selector' range={WEATHER_LABELS} onChange={(e) => setWeather(WEATHER_OPTIONS[e.detail.value])}>
                <View className='dc-field-picker press-scale'>
                  <Text className='dc-field-picker-text'>{weather.label}</Text>
                  <Text className='dc-field-picker-arrow'>›</Text>
                </View>
              </Picker>
            </View>
            <View className='dc-field-row'>
              <Text className='dc-field-label'>场地</Text>
              <Picker mode='selector' range={TERRAIN_LABELS} onChange={(e) => setTerrain(TERRAIN_OPTIONS[e.detail.value])}>
                <View className='dc-field-picker press-scale'>
                  <Text className='dc-field-picker-text'>{terrain.label}</Text>
                  <Text className='dc-field-picker-arrow'>›</Text>
                </View>
              </Picker>
            </View>
            <View className='dc-field-row'>
              <Text className='dc-field-label'>会心</Text>
              <View className={`dc-toggle ${critical ? 'dc-toggle-on' : ''}`} onClick={() => setCritical(!critical)}>
                <View className='dc-toggle-thumb' />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* EV 编辑弹窗 */}
      {evEditSide && (
        <View className='dc-modal'>
          <View className='dc-modal-mask' onClick={closeEvEditor} />
          <View className='dc-modal-content'>
            <View className='dc-modal-header'>
              <Text className='dc-modal-title'>编辑 {evEditSide === 'attacker' ? '攻击方' : '防守方'} EV</Text>
              <Text className='dc-modal-close' onClick={closeEvEditor}>✕</Text>
            </View>
            <View className='dc-ev-edit-body'>
              {STAT_KEYS.map(key => (
                <View key={key} className='dc-ev-edit-row'>
                  <Text className='dc-ev-edit-label'>{STAT_LABELS[key]}</Text>
                  <View className='dc-ev-edit-controls'>
                    <View className='dc-ev-btn press-scale' onClick={() => handleEvEditChange(key, evEditValues[key] - 4)}>
                      <Text>−</Text>
                    </View>
                    <Input className='dc-ev-edit-input' type='number' value={String(evEditValues[key])} onBlur={(e) => handleEvEditChange(key, e.detail.value)} />
                    <View className='dc-ev-btn press-scale' onClick={() => handleEvEditChange(key, evEditValues[key] + 4)}>
                      <Text>+</Text>
                    </View>
                  </View>
                  <View className='dc-ev-presets'>
                    <Text className='dc-ev-preset press-scale' onClick={() => handleEvEditChange(key, 0)}>0</Text>
                    <Text className='dc-ev-preset press-scale' onClick={() => handleEvEditChange(key, 252)}>252</Text>
                  </View>
                </View>
              ))}
              <Text className='dc-ev-total'>合计: {Object.values(evEditValues).reduce((a, b) => a + b, 0)} / 510</Text>
            </View>
            <View className='dc-modal-footer'>
              <View className='dc-modal-btn-cancel press-scale' onClick={closeEvEditor}><Text>取消</Text></View>
              <View className='dc-modal-btn-confirm press-scale' onClick={confirmEvEdit}><Text>确定</Text></View>
            </View>
          </View>
        </View>
      )}

      {/* 宝可梦选择弹窗 */}
      {(pickerType === 'attacker' || pickerType === 'defender') && (
        <View className='dc-modal'>
          <View className='dc-modal-mask' onClick={closePicker} />
          <View className='dc-modal-sheet'>
            <View className='dc-modal-header'>
              <Text className='dc-modal-title'>选择{pickerType === 'attacker' ? '攻击方' : '防守方'}宝可梦</Text>
              <Text className='dc-modal-close' onClick={closePicker}>✕</Text>
            </View>
            <View className='dc-search-bar'>
              <Input className='dc-search-input' placeholder='搜索宝可梦...' value={pickerSearch} onConfirm={handlePickerSearch} onBlur={handlePickerSearch} />
            </View>
            <ScrollView scrollY className='dc-picker-list' onScrollToLower={handlePickerLoadMore}>
              {pickerList.map(pokemon => (
                <View key={pokemon.id} className='dc-picker-item press-scale' onClick={() => selectPokemon(pokemon)}>
                  {pokemon.image?.url && <SafeImage className='dc-picker-sprite' src={pokemon.image.url} mode='aspectFit' />}
                  <View className='dc-picker-info'>
                    <Text className='dc-picker-name'>#{pokemon.id} {pokemon.nameZh || pokemon.nameEn}</Text>
                    <View className='dc-picker-types'>
                      {pokemon.primaryType && <TypeChip type={pokemon.primaryType} size='sm' />}
                      {pokemon.secondaryType && <TypeChip type={pokemon.secondaryType} size='sm' />}
                    </View>
                  </View>
                </View>
              ))}
              {pickerLoading && (
                <View className='dc-loading-more'>
                  <View className='load-dots'><View className='dot' /><View className='dot' /><View className='dot' /></View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 招式选择弹窗 */}
      {pickerType === 'move' && (
        <View className='dc-modal'>
          <View className='dc-modal-mask' onClick={closePicker} />
          <View className='dc-modal-sheet'>
            <View className='dc-modal-header'>
              <Text className='dc-modal-title'>选择招式</Text>
              <Text className='dc-modal-close' onClick={closePicker}>✕</Text>
            </View>
            <View className='dc-search-bar'>
              <Input className='dc-search-input' placeholder='搜索招式...' value={pickerSearch} onConfirm={handlePickerSearch} onBlur={handlePickerSearch} />
            </View>
            <ScrollView scrollY className='dc-picker-list' onScrollToLower={handlePickerLoadMore}>
              {pickerList.map(move => (
                <View key={move.id} className='dc-picker-item press-scale' onClick={() => selectMove(move)}>
                  <View className='dc-move-item-type-dot' style={{ background: TYPE_COLORS[move.type] || '#999' }} />
                  <View className='dc-picker-info'>
                    <Text className='dc-picker-name'>{move.nameZh || move.nameEn}</Text>
                    <View className='dc-move-item-meta'>
                      {move.type && <Text className='dc-move-item-type-tag' style={{ background: TYPE_COLORS[move.type] || '#999' }}>{move.type}</Text>}
                      {move.category && <Text className='dc-move-item-cat'>{move.category}</Text>}
                      <Text className='dc-move-item-power'>威力 {move.power || '—'}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {pickerLoading && (
                <View className='dc-loading-more'>
                  <View className='load-dots'><View className='dot' /><View className='dot' /><View className='dot' /></View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
