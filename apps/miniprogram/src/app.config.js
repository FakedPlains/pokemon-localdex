export default defineAppConfig({
  pages: [
    'pages/pokedex/index',
    'pages/database/index',
    'pages/teams/index',
    'pages/profile/index',
    'pages/pokemon-detail/index',
    'pages/move-detail/index',
    'pages/ability-detail/index',
    'pages/item-detail/index',
    'pages/damage/index',
    'pages/type-chart/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FAF8F5',
    navigationBarTitleText: 'LocalDex',
    navigationBarTextStyle: 'black',
    backgroundColor: '#FAF8F5'
  },
  tabBar: {
    color: '#B5B5B5',
    selectedColor: '#E63946',
    backgroundColor: '#FFFCF8',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/pokedex/index',
        text: '图鉴',
        iconPath: 'assets/tabbar/pokedex.png',
        selectedIconPath: 'assets/tabbar/pokedex-active.png'
      },
      {
        pagePath: 'pages/database/index',
        text: '资料库',
        iconPath: 'assets/tabbar/database.png',
        selectedIconPath: 'assets/tabbar/database-active.png'
      },
      {
        pagePath: 'pages/teams/index',
        text: '队伍',
        iconPath: 'assets/tabbar/teams.png',
        selectedIconPath: 'assets/tabbar/teams-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.png',
        selectedIconPath: 'assets/tabbar/profile-active.png'
      }
    ]
  }
})
