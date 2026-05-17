// pages/cards/cards.js
const api = require('../../services/api')

// 卡组颜色配置
const SET_COLORS = {
  1: { name: '四季之歌', hue: '#4caf50', bg: '#e8f5e9' },
  2: { name: '森林守护者', hue: '#2196f3', bg: '#e3f2fd' },
  3: { name: '彩虹花园', hue: '#9c27b0', bg: '#f3e5f5' },
  '-1': { name: '散卡', hue: '#607d8b', bg: '#eceff1' }
}

// 稀有度对应星星数和排序权重
const QUALITY_INFO = {
  common: { stars: 1, order: 1 },
  rare: { stars: 2, order: 2 },
  epic: { stars: 3, order: 3 },
  legendary: { stars: 5, order: 4 }
}

Page({
  data: {
    sets: [],           // 套装列表（含进度）
    allCards: [],       // 所有卡牌（按卡组+稀有度排序）
    expandedSetId: -999, // 当前展开的卡组ID（-999表示显示全部）
    loading: true
  },

  onShow() {
    const app = getApp()
    app.getLoginPromise().then(() => {
      this.loadData()
    })

    // 隐藏卡牌 tab 红点
    wx.hideTabBarRedDot({ index: 1 })
  },

  loadData() {
    this.setData({ loading: true })

    // 读取新卡牌 ID 列表
    const newCardIds = wx.getStorageSync('newCardIds') || []
    const newCardSet = new Set(newCardIds)

    Promise.all([
      api.get('/cards'),
      api.get('/cards/sets')
    ])
      .then(([cardsData, setsData]) => {
        const allCards = cardsData.cards || []
        const sets = setsData.sets || []

        // 处理卡牌数据
        const processedCards = allCards.map(card => {
          const setConfig = SET_COLORS[card.card_set_id] || SET_COLORS['-1']
          const qualityInfo = QUALITY_INFO[card.card_quality] || { stars: 1, order: 1 }
          return {
            ...card,
            setName: setConfig.name,
            setHue: setConfig.hue,
            setBg: setConfig.bg,
            stars: '★'.repeat(qualityInfo.stars),
            starsCount: qualityInfo.stars,
            qualityOrder: qualityInfo.order,
            owned: card.owned_count > 0,
            isNew: newCardSet.has(card.id)
          }
        })

        // 排序：已拥有优先，然后稀有度从高到低，然后按卡组号排列
        processedCards.sort((a, b) => {
          // 1. 已拥有的排前面
          if (a.owned !== b.owned) return a.owned ? -1 : 1
          // 2. 稀有度高的排前面
          if (a.qualityOrder !== b.qualityOrder) return b.qualityOrder - a.qualityOrder
          // 3. 按卡组号排列
          const setOrder = (id) => id === -1 ? 99 : id
          return setOrder(a.card_set_id) - setOrder(b.card_set_id)
        })

        // 计算每个套装的收集进度
        const setsWithProgress = sets.map(set => {
          const setCards = processedCards.filter(c => c.card_set_id === set.setId)
          const ownedCount = setCards.filter(c => c.owned).length
          const totalCount = setCards.length
          return {
            ...set,
            ownedCount,
            totalCount,
            progress: `${ownedCount}/${totalCount}`
          }
        })

        this.setData({
          sets: setsWithProgress,
          allCards: processedCards,
          loading: false
        })

        // 清除新卡牌标记
        if (newCardIds.length > 0) {
          wx.removeStorageSync('newCardIds')
        }
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  // 点击卡组展开/收起
  onToggleSet(e) {
    const setId = e.currentTarget.dataset.setid
    if (this.data.expandedSetId === setId) {
      this.setData({ expandedSetId: -999 }) // 收起
    } else {
      this.setData({ expandedSetId: setId })
    }
  },

  // 返回全部卡牌视图
  onShowAll() {
    this.setData({ expandedSetId: -999 })
  }
})
