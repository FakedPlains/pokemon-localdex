import { View, Text, Input, ScrollView } from '@tarojs/components'
import { useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { fetchPokemonCards } from '../../utils/api'
import { getTeams, createTeam, deleteTeam, updateTeam, addMember, removeMember } from '../../utils/teamStorage'
import SafeImage from '../../components/safe-image'
import TypeChip from '../../components/type-chip'
import './index.less'

export default function TeamsPage() {
  const [activeTab, setActiveTab] = useState('teams') // 'box' | 'teams'
  const [teams, setTeams] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [activeTeamId, setActiveTeamId] = useState(null)
  const [pokemonList, setPokemonList] = useState([])
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setTeams(getTeams())
  }, [])

  const refreshTeams = () => {
    setTeams(getTeams())
  }

  // 加载宝可梦列表
  const loadPokemonList = useCallback(async (pageNum = 1, search = '') => {
    if (loading) return
    setLoading(true)
    try {
      const limit = 40
      const offset = (pageNum - 1) * limit
      const res = await fetchPokemonCards({ q: search || undefined, limit, offset })
      const list = res.data || []
      if (pageNum === 1) {
        setPokemonList(list)
      } else {
        setPokemonList(prev => [...prev, ...list])
      }
      setHasMore(res.hasMore ?? list.length >= limit)
      setPage(pageNum)
    } catch (e) {
      console.error('加载宝可梦列表失败:', e)
    } finally {
      setLoading(false)
    }
  }, [loading])

  // 打开选择器
  const openPicker = (teamId) => {
    setActiveTeamId(teamId)
    setShowPicker(true)
    setSearchText('')
    setPage(1)
    setPokemonList([])
    loadPokemonList(1, '')
  }

  const closePicker = () => {
    setShowPicker(false)
    setActiveTeamId(null)
  }

  // 搜索
  const handleSearch = (e) => {
    const val = e.detail.value
    setSearchText(val)
    setPokemonList([])
    setPage(1)
    loadPokemonList(1, val)
  }

  // 加载更多
  const loadMore = () => {
    if (hasMore && !loading) {
      loadPokemonList(page + 1, searchText)
    }
  }

  // 选择宝可梦
  const selectPokemon = (pokemon) => {
    if (!activeTeamId) return
    addMember(activeTeamId, {
      pokemonId: pokemon.id,
      name: pokemon.nameZh || pokemon.nameEn || '',
      types: [pokemon.primaryType, pokemon.secondaryType].filter(Boolean),
      imageUrl: pokemon.image?.url || ''
    })
    refreshTeams()
    closePicker()
  }

  // 创建队伍
  const handleCreateTeam = () => {
    createTeam(`队伍 ${teams.length + 1}`)
    refreshTeams()
  }

  // 删除队伍
  const handleDeleteTeam = (teamId) => {
    Taro.showModal({
      title: '确认删除',
      content: '确定要删除这个队伍吗？',
      success(res) {
        if (res.confirm) {
          deleteTeam(teamId)
          refreshTeams()
        }
      }
    })
  }

  // 重命名队伍
  const handleRename = (teamId, currentName) => {
    Taro.showModal({
      title: '重命名队伍',
      editable: true,
      placeholderText: currentName,
      success(res) {
        if (res.confirm && res.content) {
          updateTeam(teamId, { name: res.content })
          refreshTeams()
        }
      }
    })
  }

  // 移除成员
  const handleRemoveMember = (e, teamId, memberId) => {
    e.stopPropagation()
    removeMember(teamId, memberId)
    refreshTeams()
  }

  // 点击成员跳转详情
  const goToDetail = (pokemonId) => {
    Taro.navigateTo({ url: `/pages/pokemon-detail/index?id=${pokemonId}` })
  }

  // 编辑队伍（弹出操作菜单）
  const handleEditTeam = (team) => {
    Taro.showActionSheet({
      itemList: ['重命名', '删除队伍'],
      success(res) {
        if (res.tapIndex === 0) {
          handleRename(team.id, team.name)
        } else if (res.tapIndex === 1) {
          handleDeleteTeam(team.id)
        }
      }
    })
  }

  return (
    <View className='teams-page'>
      {/* 自定义导航 */}
      <View className='teams-nav'>
        <Text className='teams-nav-title'>队伍</Text>
      </View>

      {/* 分段控件 */}
      <View className='teams-segment-wrap'>
        <View className='segment-control'>
          <View
            className={`segment-item ${activeTab === 'box' ? 'segment-active' : ''}`}
            onClick={() => setActiveTab('box')}
          >
            <Text>宝可梦盒子</Text>
          </View>
          <View
            className={`segment-item ${activeTab === 'teams' ? 'segment-active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            <Text>我的队伍</Text>
          </View>
        </View>
      </View>

      {/* 宝可梦盒子 tab（暂为空态） */}
      {activeTab === 'box' && (
        <View className='teams-empty-state'>
          <Text className='teams-empty-icon'>📦</Text>
          <Text className='teams-empty-text'>宝可梦盒子功能即将上线</Text>
        </View>
      )}

      {/* 我的队伍 tab */}
      {activeTab === 'teams' && (
        <ScrollView scrollY className='teams-scroll-area'>
          <View className='teams-list'>
            {teams.length === 0 ? (
              <View className='teams-empty-state'>
                <Text className='teams-empty-icon'>📋</Text>
                <Text className='teams-empty-text'>还没有队伍，点击下方按钮创建一个吧</Text>
              </View>
            ) : (
              teams.map(team => (
                <View key={team.id} className='team-card glass-card'>
                  {/* 卡片头部 */}
                  <View className='team-card-header'>
                    <View className='team-card-title-row'>
                      <Text className='team-card-name'>{team.name}</Text>
                      <Text className='team-card-format-tag'>单打</Text>
                    </View>
                    <View className='team-card-edit-icon' onClick={() => handleEditTeam(team)}>
                      <Text className='team-card-edit-text'>✎</Text>
                    </View>
                  </View>

                  {/* 成员网格 3×2 */}
                  <View className='team-member-grid'>
                    {/* 已有成员 */}
                    {team.members.map(member => (
                      <View key={member.id} className='team-member-slot' onClick={() => goToDetail(member.pokemonId)}>
                        <View className='team-member-avatar'>
                          {member.imageUrl ? (
                            <SafeImage className='team-member-sprite' src={member.imageUrl} mode='aspectFit' />
                          ) : (
                            <Text className='team-member-placeholder'>?</Text>
                          )}
                          <View className='team-member-remove' onClick={(e) => handleRemoveMember(e, team.id, member.id)}>
                            <Text className='team-member-remove-text'>×</Text>
                          </View>
                        </View>
                        <Text className='team-member-name'>{member.name}</Text>
                        <View className='team-member-types'>
                          {(member.types || []).map(type => (
                            <TypeChip key={type} type={type} size='sm' />
                          ))}
                        </View>
                      </View>
                    ))}
                    {/* 空槽位 */}
                    {Array.from({ length: Math.max(0, 6 - team.members.length) }).map((_, i) => (
                      <View key={`empty-${i}`} className='team-member-slot' onClick={() => openPicker(team.id)}>
                        <View className='team-member-empty'>
                          <Text className='team-member-empty-icon'>+</Text>
                        </View>
                        <Text className='team-member-empty-label'>添加</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* 新建队伍按钮 - 底部固定 */}
      {activeTab === 'teams' && (
        <View className='teams-create-bar'>
          <View className='teams-create-btn' onClick={handleCreateTeam}>
            <Text className='teams-create-btn-text'>+ 新建队伍</Text>
          </View>
        </View>
      )}

      {/* 宝可梦选择器弹窗 */}
      {showPicker && (
        <View className='picker-overlay'>
          <View className='picker-mask' onClick={closePicker} />
          <View className='picker-panel'>
            {/* 弹窗头部 */}
            <View className='picker-header'>
              <Text className='picker-title'>选择宝可梦</Text>
              <View className='picker-close' onClick={closePicker}>
                <Text className='picker-close-text'>×</Text>
              </View>
            </View>

            {/* 药丸搜索栏 */}
            <View className='picker-search'>
              <View className='picker-search-bar'>
                <Text className='picker-search-icon'>🔍</Text>
                <Input
                  className='picker-search-input'
                  placeholder='搜索宝可梦...'
                  value={searchText}
                  onConfirm={handleSearch}
                  onBlur={handleSearch}
                />
              </View>
            </View>

            {/* 列表 */}
            <ScrollView
              scrollY
              className='picker-list'
              onScrollToLower={loadMore}
            >
              {pokemonList.map(pokemon => (
                <View key={pokemon.id} className='picker-item' onClick={() => selectPokemon(pokemon)}>
                  <View className='picker-item-avatar'>
                    {pokemon.image?.url ? (
                      <SafeImage className='picker-item-sprite' src={pokemon.image.url} mode='aspectFit' />
                    ) : (
                      <Text className='picker-item-placeholder'>?</Text>
                    )}
                  </View>
                  <View className='picker-item-info'>
                    <Text className='picker-item-name'>#{pokemon.id} {pokemon.nameZh || pokemon.nameEn}</Text>
                    <View className='picker-item-types'>
                      {[pokemon.primaryType, pokemon.secondaryType].filter(Boolean).map(type => (
                        <TypeChip key={type} type={type} size='sm' />
                      ))}
                    </View>
                  </View>
                </View>
              ))}
              {loading && (
                <View className='picker-loading'>
                  <View className='load-dots'>
                    <View className='dot' />
                    <View className='dot' />
                    <View className='dot' />
                  </View>
                </View>
              )}
              {!hasMore && pokemonList.length > 0 && (
                <View className='picker-loading'>
                  <Text className='picker-loading-text'>没有更多了</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
