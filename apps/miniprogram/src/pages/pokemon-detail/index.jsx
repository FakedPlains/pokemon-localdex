import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { fetchPokemonSummary, fetchPokemonEvolution, fetchLearnsetMeta, fetchPokemonLearnset } from '../../utils/api'
import { STAT_KEYS, LEARN_METHOD_LABELS } from '@pokemon-localdex/store-types/constants'
import TypeChip from '../../components/type-chip'
import CategoryBadge from '../../components/category-badge'
import StatBar from '../../components/stat-bar'
import Loading from '../../components/loading'
import SafeImage from '../../components/safe-image'
import { TYPE_BG_COLORS, TYPE_GRADIENT_COLORS } from '../../utils/constants'
import './index.less'

const MOVES_PAGE_SIZE = 50

// ─── 进化链辅助函数 ───

/** 格式化进化条件 */
function formatCondition(evo) {
  const parts = []
  if (evo.level) parts.push(`Lv.${evo.level}`)
  if (evo.item) parts.push(evo.item)
  if (evo.condition) parts.push(evo.condition)
  if (parts.length === 0 && evo.method) parts.push(evo.method)
  return parts.join(' ')
}

/** 判断进化链是否包含形态分支 */
function hasFormBranches(chain) {
  return chain.some(e => e.stage > 0 && (e.fromFormId || e.toFormId))
}

/** 构建树结构 */
function buildTree(chain) {
  const bases = chain.filter(e => e.stage === 0)
  const nonBases = chain.filter(e => e.stage > 0)
  const used = new Set()

  function findChildren(pid, fid) {
    const result = []
    nonBases.forEach((step, idx) => {
      if (used.has(idx)) return
      if (Number(step.fromPokemonId) !== Number(pid)) return
      if ((step.fromFormId || null) !== (fid || null)) return
      result.push(idx)
    })
    return result
  }

  function expand(evo) {
    const childIdxs = findChildren(evo.toPokemonId, evo.toFormId)
    for (const idx of childIdxs) used.add(idx)
    return { evo, children: childIdxs.map(idx => expand(nonBases[idx])) }
  }

  const roots = bases.map(b => expand(b))
  const uncovered = nonBases.filter((_, i) => !used.has(i))
  if (uncovered.length > 0) {
    roots.push({ evo: null, children: uncovered.map(e => ({ evo: e, children: [] })) })
  }
  return roots
}

/** 判断是否为当前宝可梦/形态 */
function checkIsCurrent(evo, detail, currentForm) {
  if (Number(evo.toPokemonId) !== Number(detail.id)) return false
  if (evo.toFormId) {
    return currentForm ? Number(evo.toFormId) === Number(currentForm.id) : false
  }
  // 无 toFormId 时，当前形态为默认形态即匹配
  return !currentForm || currentForm.isDefault
}

/** 渲染单个进化成员 */
function renderEvoMember(evo, detail, currentForm, key) {
  const isCurrent = checkIsCurrent(evo, detail, currentForm)
  return (
    <View
      key={key}
      className={`pd-evo-pokemon ${isCurrent ? 'pd-evo-current' : ''}`}
      onClick={() => {
        if (!isCurrent && evo.toPokemonId) {
          Taro.redirectTo({ url: `/pages/pokemon-detail/index?id=${evo.toPokemonId}` })
        }
      }}
    >
      <SafeImage className='pd-evo-img' src={evo.toImage?.url} mode='aspectFit' />
      <Text className='pd-evo-name'>{evo.toFormName || evo.toNameZh}</Text>
    </View>
  )
}

/** 渲染进化链（入口） */
function renderEvolutionChain(chain, detail, currentForm) {
  if (hasFormBranches(chain)) {
    return renderBranchView(chain, detail, currentForm)
  }
  return renderStageGroupView(chain, detail, currentForm)
}

/** 按 stage 分组展示（无形态分支的普通进化链） */
function renderStageGroupView(chain, detail, currentForm) {
  const stages = new Map()
  for (const evo of chain) {
    const stage = evo.stage ?? 0
    if (!stages.has(stage)) stages.set(stage, [])
    stages.get(stage).push(evo)
  }

  return (
    <ScrollView scrollX className='pd-evo-scroll'>
      <View className='pd-evo-chain'>
        {[...stages.entries()].sort(([a], [b]) => a - b).map(([stage, evos], stageIdx) => (
          <View key={stage} className='pd-evo-stage-group'>
            {stageIdx > 0 && (
              <View className='pd-evo-arrow-col'>
                {evos.map((evo, i) => {
                  const cond = formatCondition(evo)
                  return (
                    <View key={`arrow-${evo.toPokemonId}-${i}`} className='pd-evo-arrow-cell'>
                      {cond ? <Text className='pd-evo-condition'>{cond}</Text> : null}
                      <Text className='pd-evo-arrow'>{'→'}</Text>
                    </View>
                  )
                })}
              </View>
            )}
            <View className='pd-evo-stage-members'>
              {evos.map((evo, i) => renderEvoMember(evo, detail, currentForm, `${evo.toPokemonId}-${i}`))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

/** 树形分支展示（有形态分支的进化链） */
function renderBranchView(chain, detail, currentForm) {
  const roots = buildTree(chain)
  return (
    <ScrollView scrollX className='pd-evo-scroll'>
      <View className='pd-evo-branches'>
        {roots.map((root, i) => renderTreeNode(root, detail, currentForm, true, `root-${i}`))}
      </View>
    </ScrollView>
  )
}

/** 递归渲染树节点 */
function renderTreeNode(node, detail, currentForm, isRoot, key) {
  // 沿单链收集线性路径
  const linear = []
  let cur = node
  while (cur.children.length === 1) {
    linear.push(cur.children[0])
    cur = cur.children[0]
  }
  const forkChildren = cur.children

  return (
    <View key={key} className='pd-evo-tree-node'>
      <View className='pd-evo-tree-linear'>
        {node.evo && (
          <View className='pd-evo-branch-step'>
            {!isRoot && (
              <View className='pd-evo-arrow-cell'>
                {formatCondition(node.evo) ? <Text className='pd-evo-condition'>{formatCondition(node.evo)}</Text> : null}
                <Text className='pd-evo-arrow'>{'→'}</Text>
              </View>
            )}
            {renderEvoMember(node.evo, detail, currentForm, `node-${node.evo.toPokemonId}-${node.evo.toFormId || 'd'}`)}
          </View>
        )}
        {linear.map((child, i) => {
          const cond = formatCondition(child.evo)
          return (
            <View key={`${child.evo.toPokemonId}-${child.evo.toFormId || 'd'}-${i}`} className='pd-evo-branch-step'>
              <View className='pd-evo-arrow-cell'>
                {cond ? <Text className='pd-evo-condition'>{cond}</Text> : null}
                <Text className='pd-evo-arrow'>{'→'}</Text>
              </View>
              {renderEvoMember(child.evo, detail, currentForm, `lin-${child.evo.toPokemonId}-${child.evo.toFormId || 'd'}-${i}`)}
            </View>
          )
        })}

        {forkChildren.length > 1 && (
          <View className='pd-evo-tree-fork'>
            {forkChildren.map((child, i) => renderTreeNode(
              child, detail, currentForm, false,
              `fork-${child.evo.toPokemonId}-${child.evo.toFormId || 'd'}-${i}`
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

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

  // 进化链：懒加载
  const [evolutionChain, setEvolutionChain] = useState(null)
  const [evolutionLoading, setEvolutionLoading] = useState(false)

  // Learnset state
  const [learnsetMeta, setLearnsetMeta] = useState(null)
  const [learnsetData, setLearnsetData] = useState([])
  const [learnsetLoading, setLearnsetLoading] = useState(false)
  const [learnsetLoadingMore, setLearnsetLoadingMore] = useState(false)
  const [learnsetHasMore, setLearnsetHasMore] = useState(false)
  const [activeGen, setActiveGen] = useState(null)
  const [methodFilter, setMethodFilter] = useState('')
  // 服务端返回的全量方法计数（精确到当前 form+gen+version，不受 method 筛选影响）
  const [methodCounts, setMethodCounts] = useState({})
  // 服务端首次请求返回的实际 formKey（可能经过 fallback），state 仅用于 UI fallback 提示
  const [learnsetFormKey, setLearnsetFormKey] = useState(null)
  // 用 ref 存服务端实际 formKey，避免驱动 fetchMovesPage 重建导致 effect 重复执行
  const resolvedFormKeyRef = useRef(null)
  // 竞态保护：递增 requestId，回调中检查是否过时
  const movesRequestIdRef = useRef(0)

  const learnsetOffsetRef = useRef(0)

  // ─── 加载摘要（轻量接口，不含进化链和世代数据） ───
  useEffect(() => {
    if (!pokemonId) { setLoading(false); return }
    setLoading(true)
    setDetail(null)
    setEvolutionChain(null)
    setLearnsetMeta(null)
    setLearnsetData([])
    setActiveForm(null)
    setActiveGen(null)
    setMethodFilter('')
    setMethodCounts({})
    setLearnsetFormKey(null)
    resolvedFormKeyRef.current = null
    fetchPokemonSummary(pokemonId).then(r => {
      setDetail(r.data)
      if (r.data) {
        Taro.setNavigationBarTitle({ title: r.data.nameZh || '宝可梦详情' })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pokemonId])

  // ─── 加载招式表元数据 ───
  useEffect(() => {
    if (!detail?.id) return
    fetchLearnsetMeta(detail.id).then(r => {
      setLearnsetMeta(r.data)
      const gens = r.data?.generations || []
      if (gens.length > 0) {
        const normalGens = gens.filter(g => g !== 99)
        setActiveGen(normalGens.length > 0 ? normalGens[normalGens.length - 1] : gens[gens.length - 1])
      }
    })
  }, [detail?.id])

  // ─── 懒加载进化链 ───
  const loadEvolution = useCallback(() => {
    if (!detail?.id || evolutionChain || evolutionLoading) return
    setEvolutionLoading(true)
    fetchPokemonEvolution(detail.id).then(r => {
      setEvolutionChain(r.data || [])
      setEvolutionLoading(false)
    }).catch(() => {
      setEvolutionChain([])
      setEvolutionLoading(false)
    })
  }, [detail?.id, evolutionChain, evolutionLoading])

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

  // ─── 加载招式表（分页 + 服务端方法筛选） ───
  // 返回 false 表示被竞态丢弃，调用方据此决定是否更新 loading 状态
  const fetchMovesPage = useCallback(async (offset, isInitial, method) => {
    if (!detail?.id || !activeGen) return false
    const rid = ++movesRequestIdRef.current
    // 追加请求使用服务端首次返回的实际 formKey（可能是 fallback 后的），
    // 读 ref 而非 state，避免 learnsetFormKey 变化驱动 fetchMovesPage/effect 重建。
    const formKey = (!isInitial && resolvedFormKeyRef.current) ? resolvedFormKeyRef.current : (currentForm?.formKey || 'default')
    try {
      const r = await fetchPokemonLearnset(detail.id, activeGen, formKey, undefined, {
        limit: MOVES_PAGE_SIZE,
        offset,
        method: method || undefined,
      })
      // 竞态保护：如果已经有更新的请求发出，丢弃本次结果
      if (rid !== movesRequestIdRef.current) return false
      const moves = r.data || []
      const hasMore = r.hasMore ?? false

      if (isInitial) {
        setLearnsetData(moves)
        resolvedFormKeyRef.current = r.formKey || formKey
        setLearnsetFormKey(r.formKey || formKey)
        // methodCounts 来自服务端，是当前 form+gen+version 的全量计数
        if (r.methodCounts) setMethodCounts(r.methodCounts)
      } else {
        setLearnsetData(prev => [...prev, ...moves])
      }
      setLearnsetHasMore(hasMore)
      learnsetOffsetRef.current = offset + moves.length
      return true
    } catch {
      if (rid !== movesRequestIdRef.current) return false
      if (isInitial) { setLearnsetData([]); setMethodCounts({}) }
      setLearnsetHasMore(false)
      return true
    }
  }, [detail?.id, activeGen, currentForm?.formKey])

  // 世代/形态变化时重新加载第一页，统一清空招式筛选默认展示全部
  useEffect(() => {
    if (!detail?.id || !activeGen) return
    setMethodFilter('')
    setLearnsetLoading(true)
    learnsetOffsetRef.current = 0
    fetchMovesPage(0, true, '').then((accepted) => {
      if (accepted !== false) setLearnsetLoading(false)
    })
  }, [fetchMovesPage])

  // 加载更多招式
  const handleLoadMoreMoves = useCallback(() => {
    if (learnsetLoadingMore || !learnsetHasMore) return
    setLearnsetLoadingMore(true)
    fetchMovesPage(learnsetOffsetRef.current, false, methodFilter).then((accepted) => {
      if (accepted !== false) setLearnsetLoadingMore(false)
    })
  }, [fetchMovesPage, learnsetLoadingMore, learnsetHasMore, methodFilter])

  // 方法筛选变化时重置分页并重新请求（服务端筛选）
  const handleMethodChange = useCallback((method) => {
    const newMethod = method === methodFilter ? '' : method
    setMethodFilter(newMethod)
    setLearnsetData([])
    setLearnsetHasMore(false)
    setLearnsetLoading(true)
    learnsetOffsetRef.current = 0
    fetchMovesPage(0, true, newMethod).then((accepted) => {
      if (accepted !== false) setLearnsetLoading(false)
    })
  }, [fetchMovesPage, methodFilter])

  const totalMethodCount = Object.values(methodCounts).reduce((s, c) => s + c, 0)

  if (loading) return <Loading />
  if (!detail) {
    return (
      <View className='pd-empty'>
        <Text>未找到该宝可梦</Text>
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
          >{'普通'}</Text>
          <Text
            className={`pd-toggle-btn ${imageMode === 'shiny' ? 'pd-toggle-active' : ''}`}
            onClick={() => setImageMode('shiny')}
          >{'闪光'}</Text>
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
        <Text className='pd-section-title'>{'特性'}</Text>
        <View className='pd-ability-grid'>
          {abilities.map((ab, i) => (
            <View key={i} className='pd-ability-card glass-card'>
              <View className='pd-ability-header'>
                <Text className='pd-ability-name'>{ab.nameZh}</Text>
                {ab.isHidden && <Text className='pd-ability-badge'>{'隐藏'}</Text>}
              </View>
              {ab.effect && <Text className='pd-ability-desc'>{ab.effect}</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* Stats card */}
      <View className='pd-section'>
        <View className='pd-section-header'>
          <Text className='pd-section-title'>{'种族值'}</Text>
          <Text className='pd-section-total'>{'合计'} {totalStats}</Text>
        </View>
        <View className='glass-card pd-stats-card'>
          <StatBar stats={stats} />
        </View>
      </View>

      {/* Evolution card — 懒加载 */}
      <View className='pd-section'>
        <Text className='pd-section-title'>{'进化链'}</Text>
        {evolutionChain === null ? (
          <View className='glass-card pd-evo-card'>
            {evolutionLoading ? (
              <Loading text='加载进化链…' />
            ) : (
              <View className='pd-evo-load-trigger' onClick={loadEvolution}>
                <Text className='pd-evo-load-text'>点击加载进化链</Text>
              </View>
            )}
          </View>
        ) : evolutionChain.length > 0 ? (
          <View className='glass-card pd-evo-card'>
            {renderEvolutionChain(evolutionChain, detail, currentForm)}
          </View>
        ) : (
          <View className='glass-card pd-evo-card'>
            <Text className='muted'>{'该宝可梦没有进化链数据'}</Text>
          </View>
        )}
      </View>

      {/* Moves card */}
      <View className='pd-section'>
        <Text className='pd-section-title'>{'招式表'}</Text>
        <View className='glass-card pd-moves-card'>
          {/* Generation pills */}
          <ScrollView scrollX className='pd-gen-scroll'>
            <View className='pd-gen-pills'>
              {(learnsetMeta?.generations || []).map(gen => (
                <View
                  key={gen}
                  className={`chip ${gen === activeGen ? 'chip-active' : 'chip-inactive'}`}
                  onClick={() => { setActiveGen(gen); setMethodFilter(''); setMethodCounts({}); setLearnsetFormKey(null); resolvedFormKeyRef.current = null }}
                >
                  <Text>{gen === 99 ? 'Champions' : `第${gen}世代`}</Text>
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
                  onClick={() => handleMethodChange('')}
                >
                  <Text>{'全部'} ({totalMethodCount})</Text>
                </View>
                {Object.entries(methodCounts)
                  .sort(([a], [b]) => {
                    const order = { 'level-up': 1, evolution: 2, 'pre-evolution': 3, 'form-change': 4, tm: 5, hm: 6, tutor: 7, egg: 8, event: 9 }
                    return (order[a] || 99) - (order[b] || 99)
                  })
                  .map(([method, count]) => (
                  <View
                    key={method}
                    className={`chip ${methodFilter === method ? 'chip-active' : 'chip-inactive'}`}
                    onClick={() => handleMethodChange(method)}
                  >
                    <Text>{LEARN_METHOD_LABELS[method] || method} ({count})</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {learnsetLoading ? (
            <Loading text='加载招式…' />
          ) : learnsetData.length === 0 ? (
            <View className='pd-moves-empty'>
              <Text className='muted'>{'当前世代还没有导入可学招式表'}</Text>
            </View>
          ) : (
            <View className='pd-moves-list'>
              {learnsetData.map((entry, i) => {
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
                        <Text className='pd-move-name'>{entry.moveNameZh || '未知'}</Text>
                        <TypeChip type={entry.moveType} size='sm' />
                        {entry.moveCategory && <CategoryBadge category={entry.moveCategory} size='sm' />}
                        <Text className='pd-move-method-tag'>{learnText}</Text>
                      </View>
                      <View className='pd-move-bottom'>
                        <Text className='pd-move-stat'>{'威力'} {entry.movePower ?? '—'}</Text>
                        <Text className='pd-move-stat'>{'命中'} {entry.moveAccuracy ?? '—'}</Text>
                        <Text className='pd-move-stat'>PP {entry.movePP ?? '—'}</Text>
                      </View>
                    </View>
                  </View>
                )
              })}

              {/* 加载更多按钮 */}
              {learnsetHasMore && (
                <View
                  className='pd-moves-load-more'
                  onClick={handleLoadMoreMoves}
                >
                  {learnsetLoadingMore ? (
                    <Loading text='加载更多…' />
                  ) : (
                    <Text className='pd-moves-load-more-text'>加载更多招式</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      <View className='pd-footer' />
    </ScrollView>
  )
}
