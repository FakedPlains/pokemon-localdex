import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchPokemonDetail, fetchLearnsetMeta, fetchPokemonLearnset } from '../../utils/api'
import { STAT_KEYS, STAT_LABELS_SHORT, LEARN_METHOD_LABELS } from '@pokemon-localdex/store-types/constants'
import TypeChip from '../../components/type-chip'
import CategoryBadge from '../../components/category-badge'
import StatBar from '../../components/stat-bar'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import { TYPE_BG_COLORS, TYPE_GRADIENT_COLORS } from '../../utils/constants'
import './index.less'

function getHeroGradient(primary, secondary) {
  const c1 = TYPE_GRADIENT_COLORS[primary] || ['#A8A878', '#C8C8A0']
  const c2 = secondary ? (TYPE_GRADIENT_COLORS[secondary] || c1) : c1
  return `linear-gradient(180deg, ${c1[0]} 0%, ${c2[1]} 100%)`
}

export default function PokemonDetailPage() {
  const router = useRouter()
  const pokemonId = router.params.id

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeForm, setActiveForm] = useState(null)
  const [imageMode, setImageMode] = useState('official')

  // Learnset state
  const [learnsetMeta, setLearnsetMeta] = useState(null)
  const [learnsetData, setLearnsetData] = useState([])
  const [learnsetLoading, setLearnsetLoading] = useState(false)
  const [activeGen, setActiveGen] = useState(null)
  const [methodFilter, setMethodFilter] = useState('')

  useEffect(() => {
    if (!pokemonId) { setLoading(false); return }
    setLoading(true)
    fetchPokemonDetail(pokemonId).then(r => {
      setDetail(r.data)
      if (r.data) {
        Taro.setNavigationBarTitle({ title: r.data.nameZh || '\u5b9d\u53ef\u68a6\u8be6\u60c5' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pokemonId])

  useEffect(() => {
    if (!detail?.id) return
    fetchLearnsetMeta(detail.id).then(r => {
      setLearnsetMeta(r.data)
      const gens = r.data?.generations || []
      if (gens.length > 0) {
        // 优先选最新正统世代（排除 99/Champions），没有正统世代时 fallback 到最大值
        const normalGens = gens.filter(g => g !== 99)
        setActiveGen(normalGens.length > 0 ? normalGens[normalGens.length - 1] : gens[gens.length - 1])
      }
    })
  }, [detail?.id])

  const currentForm = useMemo(() => {
    if (!detail?.forms?.length) return null
    if (activeForm) {
      return detail.forms.find(f => f.formKey === activeForm) || detail.forms[0]
    }
    return detail.forms.find(f => f.isDefault) || detail.forms[0]
  }, [detail, activeForm])

  const stats = currentForm?.baseStats || detail?.baseStats || {}
  const primaryType = currentForm?.primaryType || detail?.primaryType
  const secondaryType = currentForm?.secondaryType || detail?.secondaryType
  const abilities = currentForm?.abilities || []

  const imageSrc = useMemo(() => {
    const images = currentForm?.images || {}
    if (imageMode === 'shiny') {
      return images.shiny?.url || images.shinyOfficial?.url || images.official?.url || detail?.image?.url
    }
    return images.official?.url || detail?.image?.url
  }, [currentForm, imageMode, detail])

  // Load learnset when gen available
  useEffect(() => {
    if (!detail?.id || !activeGen) return
    setLearnsetLoading(true)
    const formKey = currentForm?.formKey || 'default'
    fetchPokemonLearnset(detail.id, activeGen, formKey).then(r => {
      setLearnsetData(r.data || [])
      setLearnsetLoading(false)
    }).catch(() => {
      setLearnsetData([])
      setLearnsetLoading(false)
    })
  }, [detail?.id, activeGen, currentForm?.formKey])

  const methodCounts = useMemo(() => {
    const counts = {}
    for (const entry of learnsetData) {
      const m = entry.learnMethod || 'other'
      counts[m] = (counts[m] || 0) + 1
    }
    return counts
  }, [learnsetData])

  const sortedEntries = useMemo(() => {
    const methodOrder = { 'level-up': 1, evolution: 2, 'pre-evolution': 3, 'form-change': 4, tm: 5, hm: 6, tutor: 7, egg: 8, event: 9, other: 10 }
    let filtered = learnsetData
    if (methodFilter) {
      filtered = learnsetData.filter(e => e.learnMethod === methodFilter)
    }
    return [...filtered].sort((a, b) => {
      const am = methodOrder[a.learnMethod] || 99
      const bm = methodOrder[b.learnMethod] || 99
      if (am !== bm) return am - bm
      const al = a.level ?? 999
      const bl = b.level ?? 999
      return al - bl
    })
  }, [learnsetData, methodFilter])

  if (loading) return <Loading />
  if (!detail) {
    return (
      <View className='pd-empty'>
        <Text>\u672a\u627e\u5230\u8be5\u5b9d\u53ef\u68a6</Text>
      </View>
    )
  }

  const totalStats = STAT_KEYS.reduce((sum, k) => sum + (stats[k] || 0), 0)

  return (
    <ScrollView scrollY className='pd-page'>
      {/* Hero */}
      <View
        className='pd-hero'
        style={{ background: getHeroGradient(primaryType, secondaryType) }}
      >
        <View className='pd-hero-deco1' />
        <View className='pd-hero-deco2' />

        <Text className='pd-hero-dex'>#{String(detail.dexNumber).padStart(4, '0')}</Text>

        <View className='pd-hero-img-wrap'>
          <SafeImage className='pd-hero-img' src={imageSrc} mode='aspectFit' />
        </View>

        <View className='pd-hero-toggle'>
          <Text
            className={`pd-toggle-btn ${imageMode === 'official' ? 'pd-toggle-active' : ''}`}
            onClick={() => setImageMode('official')}
          >{'\u666e\u901a'}</Text>
          <Text
            className={`pd-toggle-btn ${imageMode === 'shiny' ? 'pd-toggle-active' : ''}`}
            onClick={() => setImageMode('shiny')}
          >{'\u95ea\u5149'}</Text>
        </View>

        <Text className='pd-hero-name'>{detail.nameZh}</Text>
        <Text className='pd-hero-name-sub'>{detail.nameEn || ''}{detail.nameJa ? ` / ${detail.nameJa}` : ''}</Text>

        <View className='pd-hero-types'>
          <TypeChip type={primaryType} size='md' />
          {secondaryType && <TypeChip type={secondaryType} size='md' />}
        </View>

        <View className='pd-hero-meta'>
          {detail.category && <Text className='pd-hero-meta-text'>{detail.category}</Text>}
          {detail.heightM && <Text className='pd-hero-meta-text'>{detail.heightM}m</Text>}
          {detail.weightKg && <Text className='pd-hero-meta-text'>{detail.weightKg}kg</Text>}
        </View>
      </View>

      {/* Form selector */}
      {detail.forms?.length > 1 && (
        <View className='pd-form-bar'>
          <ScrollView scrollX className='pd-form-scroll'>
            <View className='pd-form-pills'>
              {detail.forms.map(form => (
                <View
                  key={form.formKey}
                  className={`pd-form-pill ${(activeForm || (detail.forms.find(f => f.isDefault) || detail.forms[0]).formKey) === form.formKey ? 'pd-form-pill-active' : ''}`}
                  onClick={() => setActiveForm(form.formKey)}
                >
                  <Text>{form.nameZh}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Abilities card */}
      <View className='pd-section'>
        <Text className='pd-section-title'>{'\u7279\u6027'}</Text>
        <View className='pd-ability-grid'>
          {abilities.map((ab, i) => (
            <View key={i} className='pd-ability-card glass-card'>
              <View className='pd-ability-header'>
                <Text className='pd-ability-name'>{ab.nameZh}</Text>
                {ab.isHidden && <Text className='pd-ability-badge'>{'\u9690\u85cf'}</Text>}
              </View>
              {ab.effect && <Text className='pd-ability-desc'>{ab.effect}</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* Stats card */}
      <View className='pd-section'>
        <View className='pd-section-header'>
          <Text className='pd-section-title'>{'\u79cd\u65cf\u503c'}</Text>
          <Text className='pd-section-total'>{'\u5408\u8ba1'} {totalStats}</Text>
        </View>
        <View className='glass-card pd-stats-card'>
          <StatBar stats={stats} />
        </View>
      </View>

      {/* Evolution card */}
      {detail.evolutionChain?.length > 0 && (
        <View className='pd-section'>
          <Text className='pd-section-title'>{'\u8fdb\u5316\u94fe'}</Text>
          <View className='glass-card pd-evo-card'>
            <ScrollView scrollX className='pd-evo-scroll'>
              <View className='pd-evo-chain'>
                {detail.evolutionChain.map((evo, i) => (
                  <View key={i} className='pd-evo-step'>
                    {evo.method && (
                      <View className='pd-evo-arrow-wrap'>
                        <Text className='pd-evo-condition'>
                          {evo.method}
                          {evo.level ? ` Lv.${evo.level}` : ''}
                          {evo.item ? ` ${evo.item}` : ''}
                          {evo.condition ? ` ${evo.condition}` : ''}
                        </Text>
                        <Text className='pd-evo-arrow'>{'\u2192'}</Text>
                      </View>
                    )}
                    <View
                      className={`pd-evo-pokemon ${evo.toPokemonId === detail.id ? 'pd-evo-current' : ''}`}
                      onClick={() => {
                        if (evo.toPokemonId && evo.toPokemonId !== detail.id) {
                          Taro.redirectTo({ url: `/pages/pokemon-detail/index?id=${evo.toPokemonId}` })
                        }
                      }}
                    >
                      <SafeImage className='pd-evo-img' src={evo.toImage?.url} mode='aspectFit' />
                      <Text className='pd-evo-name'>{evo.toNameZh}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Moves card */}
      <View className='pd-section'>
        <Text className='pd-section-title'>{'\u62db\u5f0f\u8868'}</Text>
        <View className='glass-card pd-moves-card'>
          {/* Generation pills */}
          <ScrollView scrollX className='pd-gen-scroll'>
            <View className='pd-gen-pills'>
              {(learnsetMeta?.generations || []).map(gen => (
                <View
                  key={gen}
                  className={`chip ${gen === activeGen ? 'chip-active' : 'chip-inactive'}`}
                  onClick={() => { setActiveGen(gen); setMethodFilter('') }}
                >
                  <Text>{gen === 99 ? 'Champions' : `\u7b2c${gen}\u4e16\u4ee3`}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Method filter pills */}
          {Object.keys(methodCounts).length > 1 && (
            <ScrollView scrollX className='pd-method-scroll'>
              <View className='pd-method-pills'>
                <View
                  className={`chip ${!methodFilter ? 'chip-active' : 'chip-inactive'}`}
                  onClick={() => setMethodFilter('')}
                >
                  <Text>{'\u5168\u90e8'} ({learnsetData.length})</Text>
                </View>
                {Object.entries(methodCounts).map(([method, count]) => (
                  <View
                    key={method}
                    className={`chip ${methodFilter === method ? 'chip-active' : 'chip-inactive'}`}
                    onClick={() => setMethodFilter(method)}
                  >
                    <Text>{LEARN_METHOD_LABELS[method] || method} ({count})</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {learnsetLoading ? (
            <Loading text='\u52a0\u8f7d\u62db\u5f0f\u2026' />
          ) : sortedEntries.length === 0 ? (
            <View className='pd-moves-empty'>
              <Text className='muted'>{'\u5f53\u524d\u4e16\u4ee3\u8fd8\u6ca1\u6709\u5bfc\u5165\u53ef\u5b66\u62db\u5f0f\u8868'}</Text>
            </View>
          ) : (
            <View className='pd-moves-list'>
              {sortedEntries.map((entry, i) => {
                const learnText = entry.learnMethod === 'level-up' && entry.level !== undefined
                  ? `Lv.${entry.level}`
                  : (LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod)
                const typeColor = TYPE_BG_COLORS[entry.moveType] || '#A8A878'
                return (
                  <View
                    key={i}
                    className='pd-move-item'
                    onClick={() => {
                      if (entry.moveId) {
                        Taro.navigateTo({ url: `/pages/move-detail/index?id=${entry.moveId}` })
                      }
                    }}
                  >
                    <View className='pd-move-color-bar' style={{ background: typeColor }} />
                    <View className='pd-move-main'>
                      <View className='pd-move-top'>
                        <Text className='pd-move-name'>{entry.moveNameZh || '\u672a\u77e5'}</Text>
                        <TypeChip type={entry.moveType} size='sm' />
                        {entry.moveCategory && <CategoryBadge category={entry.moveCategory} size='sm' />}
                        <Text className='pd-move-method-tag'>{learnText}</Text>
                      </View>
                      <View className='pd-move-bottom'>
                        <Text className='pd-move-stat'>{'\u5a01\u529b'} {entry.movePower ?? '\u2014'}</Text>
                        <Text className='pd-move-stat'>{'\u547d\u4e2d'} {entry.moveAccuracy ?? '\u2014'}</Text>
                        <Text className='pd-move-stat'>PP {entry.movePP ?? '\u2014'}</Text>
                      </View>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </View>

      <View className='pd-footer' />
    </ScrollView>
  )
}
