export default defineAppConfig({
  pages: [
    'pages/pokedex/index',
    'pages/pokemon-detail/index',
    'pages/moves/index',
    'pages/abilities/index',
    'pages/items/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#e63946',
    navigationBarTitleText: '宝可梦图鉴',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f5f5'
  },
  tabBar: {
    color: '#999',
    selectedColor: '#e63946',
    backgroundColor: '#fff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/pokedex/index',
        text: '图鉴',
        iconPath: 'assets/tabbar/pokedex.png',
        selectedIconPath: 'assets/tabbar/pokedex-active.png'
      },
      {
        pagePath: 'pages/moves/index',
        text: '招式',
        iconPath: 'assets/tabbar/moves.png',
        selectedIconPath: 'assets/tabbar/moves-active.png'
      },
      {
        pagePath: 'pages/abilities/index',
        text: '特性',
        iconPath: 'assets/tabbar/abilities.png',
        selectedIconPath: 'assets/tabbar/abilities-active.png'
      },
      {
        pagePath: 'pages/items/index',
        text: '道具',
        iconPath: 'assets/tabbar/items.png',
        selectedIconPath: 'assets/tabbar/items-active.png'
      }
    ]
  }
})
