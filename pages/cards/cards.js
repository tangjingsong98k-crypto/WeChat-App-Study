// pages/cards/cards.js
const api = require('../../services/api')

// 卡组颜色配置
const SET_COLORS = {
  1: { name: '四季之歌', hue: '#4caf50', bg: '#e8f5e9' },   // 绿色
  2: { name: '森林守护者', hue: '#2196f3', bg: '#e3f2fd' }, // 蓝色
  3: { name: '彩虹花园', hue: '#9c27b0', bg: '#f3e5f5' },   // 紫色
  '-1': { name: '散卡', hue: '#607d8b', bg: '#eceff1' }     // 灰色
}

// 稀有度对应星星数
const QUALITY_STARS = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 5
}

Page({
  data: {
    cards: [],
    sets: [],
    loading: true
  },

  onShow() {
    const app = getApp()
    app.getLoginPromise().then(() => {
      this.loadData()
    })
  },

  loadData() {
    this.setData({ loading: true })

    Promise.all([
      api.get('/cards'),
      api.get('/cards/sets')
    ])
      .then(([cardsData, setsData]) => {
        // 处理卡牌数据，添加显示用字段
        const cards = (cardsData.cards || []).map(card => {
          const setConfig = SET_COLORS[card.card_set_id] || SET_COLORS['-1']
          const stars = QUALITY_STARS[card.card_quality] || 1
          return {
            ...card,
            setName: setConfig.name,
            setHue: setConfig.hue,
            setBg: setConfig.bg,
            stars: '★'.repeat(stars),
            starsCount: stars
          }
        })

        this.setData({
          cards,
          sets: setsData.sets || [],
          loading: false
        })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  }
})
