import { View, Text, Image, Input, ScrollView } from '@tarojs/components'
import { useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { fetchPokemonList } from '../../utils/api'
import { getTeams, createTeam, deleteTeam, updateTeam, addMember, removeMember } from '../../utils/teamStorage'
import { ALL_TYPE_OPTIONS, TYPE_COLORS } from '@pokemon-localdex/store-types/constants'
import './index.less'

export default function TeamsPage() {
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
      const res = await fetchPokemonList({ q: search || undefined, limit, offset })
      const data = res.data || res || []
      const list = Array.isArray(data) ? data : []
      if (pageNum === 1) {
        setPokemonList(list)
      } else {
        setPokemonList(prev => [...prev, ...list])
      }
      setHasMore(list.length >= limit)
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
      name: pokemon.name_zh || pokemon.name,
      types: pokemon.types || [],
      sprite: pokemon.sprite || ''
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
    // 微信小程序不支持 prompt，用 showModal 配合输入框模拟会很复杂
    // 这里简化处理，用编号递增的方式
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

  return (
    <View className='teams-page'>
      <View className='header'>
        <Text className='title'>我的队伍</Text>
        <Text className='add-btn' onClick={handleCreateTeam}>+ 新建队伍</Text>
      </View>

      {teams.length === 0 ? (
        <View className='empty-state'>
          <Text className='empty-icon'>📋</Text>
          <Text>还没有队伍，点击上方按钮创建一个吧！</Text>
        </View>
      ) : (
        teams.map(team => (
          <View key={team.id} className='team-card'>
            <View className='team-header'>
              <Text className='team-name'>{team.name}</Text>
              <View className='team-actions'>
                <Text className='action-btn' onClick={() => handleRename(team.id, team.name)}>重命名</Text>
                <Text className='action-btn danger' onClick={() => handleDeleteTeam(team.id)}>删除</Text>
              </View>
            </View>

            <View className='members-grid'>
              {/* 已有成员 */}
              {team.members.map(member => (
                <View key={member.id} className='member-slot filled' onClick={() => goToDetail(member.pokemonId)}>
                  {member.sprite && (
                    <Image className='member-sprite' src={member.sprite} mode='aspectFit' />
                  )}
                  <Text className='member-name'>{member.name}</Text>
                  <View className='member-types'>
                    {(member.types || []).map(type => (
                      <Text key={type} className='type-badge' style={{ background: TYPE_COLORS[type] || '#999' }}>
                        {type}
                      </Text>
                    ))}
                  </View>
                  <Text className='remove-btn' onClick={(e) => handleRemoveMember(e, team.id, member.id)}>×</Text>
                </View>
              ))}
              {/* 空位 */}
              {Array.from({ length: Math.max(0, 6 - team.members.length) }).map((_, i) => (
                <View key={`empty-${i}`} className='member-slot' onClick={() => openPicker(team.id)}>
                  <Text className='add-icon'>+</Text>
                </View>
              ))}
            </View>

            <View className='team-meta'>
              <Text>更新于 {new Date(team.updatedAt).toLocaleDateString()}</Text>
            </View>
          </View>
        ))
      )}

      {/* 宝可梦选择器弹窗 */}
      {showPicker && (
        <View className='picker-modal'>
          <View className='picker-mask' onClick={closePicker}></View>
          <View className='picker-content'>
            <View className='picker-header'>
              <Text className='picker-title'>选择宝可梦</Text>
              <Text className='close-btn' onClick={closePicker}>关闭</Text>
            </View>
            <View className='search-bar'>
              <Input
                className='search-input'
                placeholder='搜索宝可梦...'
                value={searchText}
                onConfirm={handleSearch}
                onBlur={handleSearch}
              />
            </View>
            <ScrollView
              scrollY
              className='pokemon-list'
              onScrollToLower={loadMore}
            >
              {pokemonList.map(pokemon => (
                <View key={pokemon.id} className='pokemon-item' onClick={() => selectPokemon(pokemon)}>
                  {pokemon.sprite && (
                    <Image className='poke-sprite' src={pokemon.sprite} mode='aspectFit' />
                  )}
                  <View className='poke-info'>
                    <Text className='poke-name'>#{pokemon.id} {pokemon.name_zh || pokemon.name}</Text>
                    <View className='poke-types'>
                      {(pokemon.types || []).map(type => (
                        <Text key={type} className='type-tag' style={{ background: TYPE_COLORS[type] || '#999' }}>
                          {type}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
              {loading && <View className='loading-more'><Text>加载中...</Text></View>}
              {!hasMore && pokemonList.length > 0 && <View className='loading-more'><Text>没有更多了</Text></View>}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
