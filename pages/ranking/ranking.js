// pages/ranking/ranking.js
const api = require('../../services/api')

const SPECIES_ICON = {
  apple: '🍎',
  cherry: '🌸',
  oak: '🌳'
}

Page({
  data: {
    activeTab: 'all',
    rankings: [],
    loading: true,
    participate: false
  },

  onShow() {
    const app = getApp()
    app.getLoginPromise().then(() => {
      this.loadRanking()
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    this.loadRanking()
  },

  loadRanking() {
    this.setData({ loading: true })

    const url = this.data.activeTab === 'all' ? '/ranking/all' : '/ranking/friends'

    api.get(url)
      .then((data) => {
        const rankings = (data.rankings || []).map((item, index) => ({
          ...item,
          rank: index + 1,
          speciesIcon: SPECIES_ICON[item.species] || '🌱'
        }))
        this.setData({ rankings, loading: false })
      })
      .catch(() => {
        this.setData({ rankings: [], loading: false })
      })
  },

  toggleParticipate(e) {
    const participate = e.detail.value
    api.post('/ranking/toggle', { participate })
      .then((data) => {
        this.setData({ participate: data.participate === 1 })
        this.loadRanking()
      })
      .catch(() => {})
  }
})
