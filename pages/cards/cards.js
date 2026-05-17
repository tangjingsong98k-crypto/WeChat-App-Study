// pages/cards/cards.js
const api = require('../../services/api')

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
        this.setData({
          cards: cardsData.cards || [],
          sets: setsData.sets || [],
          loading: false
        })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  }
})
