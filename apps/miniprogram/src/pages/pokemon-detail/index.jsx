import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchPokemonDetail, fetchLearnsetMeta, fetchPokemonLearnset } from '../../utils/api'
import { STAT_KEYS, STAT_LABELS_SHORT, STAT_COLORS, LEARN_METHOD_LABELS } from '@pokemon-localdex/store-types/constants'
import TypeChip from '../../components/type-chip'
import StatBar from '../../components/stat-bar'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import './index.less'

export default function PokemonDetailPage() {
  const router = useRouter()
  const pokemonId = router.params.id

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('stats')
  const [activeForm, setActiveForm] = useState(null)
  const [imageMode, setImageMode] = useState('official')

  // Learnset state
  const [learnsetMeta, setLearnsetMeta] = useState(null)
  const [learnsetData, setLearnsetData] = useState([])
  const [learnsetLoading, setLearnsetLoading] = useState(false)
  const [activeGen, setActiveGen] = useState(null)
  const [methodFilter, setMethodFilter] = useState('')

  // 加载详情
  useEffect(() => {
    if (!pokemonId) return
    setLoading(true)
    fetchPokemonDetail(pokemonId).then(r => {
      setDetail(r.data)
      if (r.data) {
        Taro.setNavigationBarTitle({ title: r.data.nameZh || '宝可梦详情' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pokemonId])

  // 加载 learnset meta
  useEffect(() => {
    if (!detail?.id) return
    fetchLearnsetMeta(detail.id).then(r => {
      setLearnsetMeta(r.data)
      const gens = r.data?.generations || []
      if (gens.length > 0) setActiveGen(gens[gens.length - 1])
    })
  }, [detail?.id])

  // 当前形态
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

  // 图片
  const imageSrc = useMemo(() => {
    const images = currentForm?.images || {}
    if (imageMode === 'shiny') {
      return images.shiny?.url || images.shinyOfficial?.url || images.official?.url || detail?.image?.url
    }
    return images.official?.url || detail?.image?.url
  }, [currentForm, imageMode, detail])

  // 加载招式数据
  useEffect(() => {
    if (!detail?.id || !activeGen || activeTab !== 'moves') return
    setLearnsetLoading(true)
    const formKey = currentForm?.formKey || 'default'
    fetchPokemonLearnset(detail.id, activeGen, formKey).then(r => {
      setLearnsetData(r.data || [])
      setLearnsetLoading(false)
    }).catch(() => {
      setLearnsetData([])
      setLearnsetLoading(false)
    })
  }, [detail?.id, activeGen, activeTab, currentForm?.formKey])

  // 按学习方式分组统计
  const methodCounts = useMemo(() => {
    const counts = {}
    for (const entry of learnsetData) {
      const m = entry.learnMethod || 'other'
      counts[m] = (counts[m] || 0) + 1
    }
    return counts
  }, [learnsetData])

  // 排序后的招式列表
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
      <View className='detail-empty'>
        <Text>未找到该宝可梦</Text>
      </View>
    )
  }

  return (
    <ScrollView scrollY className='detail-page'>
      {/* Hero 区域 */}
      <View className='detail-hero'>
        <View className='hero-img-wrap'>
          <SafeImage className='hero-img' src={imageSrc} mode='aspectFit' />
          <View className='hero-img-toggle'>
            <Text
              className={`toggle-btn ${imageMode === 'official' ? 'toggle-active' : ''}`}
              onClick={() => setImageMode('official')}
            >普通</Text>
            <Text
              className={`toggle-btn ${imageMode === 'shiny' ? 'toggle-active' : ''}`}
              onClick={() => setImageMode('shiny')}
            >闪光</Text>
          </View>
        </View>

        <View className='hero-info'>
          <View className='hero-title-row'>
            <Text className='hero-dex'>#{String(detail.dexNumber).padStart(4, '0')}</Text>
            <Text className='hero-name'>{detail.nameZh}</Text>
            <Text className='hero-name-en'>{detail.nameEn || ''}</Text>
          </View>

          <View className='hero-types'>
            <TypeChip type={primaryType} />
            <TypeChip type={secondaryType} />
          </View>

          <View className='hero-meta'>
            {detail.category && (
              <View className='meta-pill'>
                <Text className='meta-key'>分类</Text>
                <Text className='meta-val'>{detail.category}</Text>
              </View>
            )}
            {detail.heightM && (
              <View className='meta-pill'>
                <Text className='meta-key'>身高</Text>
                <Text className='meta-val'>{detail.heightM}m</Text>
              </View>
            )}
            {detail.weightKg && (
              <View className='meta-pill'>
                <Text className='meta-key'>体重</Text>
                <Text className='meta-val'>{detail.weightKg}kg</Text>
              </View>
            )}
          </View>

          {/* 特性 */}
          <View className='hero-abilities'>
            <Text className='ability-label'>特性</Text>
            <View className='ability-chips'>
              {abilities.map((ab, i) => (
                <View key={i} className={`ability-chip ${ab.isHidden ? 'ability-hidden' : ''}`}>
                  <Text>{ab.nameZh}{ab.isHidden ? ' ✦' : ''}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 形态选择 */}
          {detail.forms?.length > 1 && (
            <View className='form-selector'>
              <Text className='ability-label'>形态</Text>
              <View className='form-chips'>
                {detail.forms.map(form => (
                  <View
                    key={form.formKey}
                    className={`form-chip ${(activeForm || (detail.forms.find(f => f.isDefault) || detail.forms[0]).formKey) === form.formKey ? 'form-chip-active' : ''}`}
                    onClick={() => setActiveForm(form.formKey)}
                  >
                    <Text>{form.nameZh}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Tab 切换 */}
      <View className='detail-tabs'>
        <View
          className={`tab-item ${activeTab === 'stats' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <Text>种族值</Text>
        </View>
        <View
          className={`tab-item ${activeTab === 'moves' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('moves')}
        >
          <Text>招式表</Text>
        </View>
        <View
          className={`tab-item ${activeTab === 'evolution' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('evolution')}
        >
          <Text>进化链</Text>
        </View>
      </View>

      {/* Tab 内容 */}
      <View className='tab-content'>
        {activeTab === 'stats' && (
          <View className='tab-stats'>
            <View className='section-title'>
              <Text>种族值 — {currentForm?.nameZh || detail.nameZh}</Text>
            </View>
            <StatBar stats={stats} />
          </View>
        )}

        {activeTab === 'moves' && (
          <View className='tab-moves'>
            {/* 世代选择 */}
            <ScrollView scrollX className='gen-scroll'>
              <View className='gen-pills'>
                {(learnsetMeta?.generations || []).map(gen => (
                  <View
                    key={gen}
                    className={`gen-pill ${gen === activeGen ? 'gen-pill-active' : ''}`}
                    onClick={() => { setActiveGen(gen); setMethodFilter('') }}
                  >
                    <Text>{gen === 99 ? 'Champions' : `第${gen}世代`}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* 学习方式筛选 */}
            {Object.keys(methodCounts).length > 1 && (
              <ScrollView scrollX className='method-scroll'>
                <View className='method-pills'>
                  <View
                    className={`method-pill ${!methodFilter ? 'method-pill-active' : ''}`}
                    onClick={() => setMethodFilter('')}
                  >
                    <Text>全部 ({learnsetData.length})</Text>
                  </View>
                  {Object.entries(methodCounts).map(([method, count]) => (
                    <View
                      key={method}
                      className={`method-pill ${methodFilter === method ? 'method-pill-active' : ''}`}
                      onClick={() => setMethodFilter(method)}
                    >
                      <Text>{LEARN_METHOD_LABELS[method] || method} ({count})</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {learnsetLoading ? (
              <Loading text='加载招式…' />
            ) : sortedEntries.length === 0 ? (
              <View className='moves-empty'>
                <Text className='muted'>当前世代还没有导入可学招式表</Text>
              </View>
            ) : (
              <View className='moves-list'>
                <View className='moves-header'>
                  <Text className='mv-col-name'>招式</Text>
                  <Text className='mv-col-method'>方式</Text>
                  <Text className='mv-col-type'>属性</Text>
                  <Text className='mv-col-cat'>分类</Text>
                  <Text className='mv-col-pow'>威力</Text>
                </View>
                {sortedEntries.map((entry, i) => {
                  const learnText = entry.learnMethod === 'level-up' && entry.level !== undefined
                    ? `Lv.${entry.level}`
                    : (LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod)
                  return (
                    <View key={i} className='moves-row'>
                      <Text className='mv-col-name'>{entry.moveNameZh || '未知'}</Text>
                      <Text className='mv-col-method'>{learnText}</Text>
                      <View className='mv-col-type'>
                        <TypeChip type={entry.moveType} />
                      </View>
                      <Text className='mv-col-cat'>{entry.moveCategory || '—'}</Text>
                      <Text className='mv-col-pow'>{entry.movePower ?? '—'}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {activeTab === 'evolution' && (
          <View className='tab-evolution'>
            {detail.evolutionChain?.length > 0 ? (
              <View className='evo-chain'>
                {detail.evolutionChain.map((evo, i) => (
                  <View key={i} className='evo-item'>
                    {evo.method && (
                      <View className='evo-method'>
                        <Text className='evo-method-text'>
                          {evo.method}
                          {evo.level ? ` Lv.${evo.level}` : ''}
                          {evo.item ? ` (${evo.item})` : ''}
                          {evo.condition ? ` ${evo.condition}` : ''}
                        </Text>
                        <Text className='evo-arrow'>→</Text>
                      </View>
                    )}
                    <View
                      className='evo-pokemon'
                      onClick={() => {
                        if (evo.toPokemonId && evo.toPokemonId !== detail.id) {
                          Taro.redirectTo({
                            url: `/pages/pokemon-detail/index?id=${evo.toPokemonId}`
                          })
                        }
                      }}
                    >
                      <SafeImage className='evo-img' src={evo.toImage?.url} mode='aspectFit' />
                      <Text className='evo-name'>{evo.toNameZh}</Text>
                      <View className='evo-types'>
                        {evo.toTypes?.map((t, ti) => (
                          <TypeChip key={ti} type={t} />
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className='evo-empty'>
                <Text className='muted'>该宝可梦没有进化链数据</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  )
}
