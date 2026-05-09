import Taro from '@tarojs/taro'

const STORAGE_KEY = 'pokemon_teams'

/**
 * 获取所有队伍
 * @returns {Array} 队伍列表
 */
export function getTeams() {
  try {
    const data = Taro.getStorageSync(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 保存所有队伍
 * @param {Array} teams 队伍列表
 */
export function saveTeams(teams) {
  try {
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(teams))
  } catch (e) {
    console.error('保存队伍失败:', e)
  }
}

/**
 * 创建新队伍
 * @param {string} name 队伍名称
 * @returns {object} 新创建的队伍
 */
export function createTeam(name = '新队伍') {
  const teams = getTeams()
  const newTeam = {
    id: Date.now().toString(),
    name,
    members: [], // 最多 6 个成员
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  teams.push(newTeam)
  saveTeams(teams)
  return newTeam
}

/**
 * 删除队伍
 * @param {string} teamId
 */
export function deleteTeam(teamId) {
  const teams = getTeams().filter(t => t.id !== teamId)
  saveTeams(teams)
}

/**
 * 更新队伍
 * @param {string} teamId
 * @param {object} updates
 */
export function updateTeam(teamId, updates) {
  const teams = getTeams()
  const idx = teams.findIndex(t => t.id === teamId)
  if (idx >= 0) {
    teams[idx] = { ...teams[idx], ...updates, updatedAt: new Date().toISOString() }
    saveTeams(teams)
  }
  return teams[idx]
}

/**
 * 添加成员到队伍
 * @param {string} teamId
 * @param {object} pokemon { pokemonId, name, types, sprite, ... }
 */
export function addMember(teamId, pokemon) {
  const teams = getTeams()
  const team = teams.find(t => t.id === teamId)
  if (!team) return null
  if (team.members.length >= 6) return null
  const member = {
    id: Date.now().toString(),
    pokemonId: pokemon.pokemonId,
    name: pokemon.name,
    types: pokemon.types || [],
    sprite: pokemon.sprite || '',
    level: 50,
    nature: '认真',
    ability: '',
    abilityName: '',
    item: '',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    moves: []
  }
  team.members.push(member)
  team.updatedAt = new Date().toISOString()
  saveTeams(teams)
  return member
}

/**
 * 移除队伍成员
 * @param {string} teamId
 * @param {string} memberId
 */
export function removeMember(teamId, memberId) {
  const teams = getTeams()
  const team = teams.find(t => t.id === teamId)
  if (!team) return
  team.members = team.members.filter(m => m.id !== memberId)
  team.updatedAt = new Date().toISOString()
  saveTeams(teams)
}

/**
 * 更新队伍成员配置
 * @param {string} teamId
 * @param {string} memberId
 * @param {object} updates
 */
export function updateMember(teamId, memberId, updates) {
  const teams = getTeams()
  const team = teams.find(t => t.id === teamId)
  if (!team) return
  const member = team.members.find(m => m.id === memberId)
  if (!member) return
  Object.assign(member, updates)
  team.updatedAt = new Date().toISOString()
  saveTeams(teams)
}
