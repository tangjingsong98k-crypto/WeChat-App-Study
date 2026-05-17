// pages/index/index.js
const api = require('../../services/api')

const WATERING_RESUME_INTERVAL = 1800 * 1000 // 30分钟

Page({
  data: {
    species: '',
    speciesName: '',
    speciesIcon: '',
    level: 0,
    growScore: 0,
    healthScore: 0,
    waterCount: 0,
    fertilizeCount: 0,
    countdown: '',
    cardGained: null,
    loading: true
  },

  _countdownTimer: null,
  _lastWaterRecoverTime: 0,

  onShow() {
    const app = getApp()
    app.getLoginPromise().then(() => {
      this.loadData()
    })
  },

  onHide() {
    this.clearCountdown()
  },

  onUnload() {
    this.clearCountdown()
  },

  loadData() {
    this.setData({ loading: true })

    Promise.all([
      api.get('/tree/status'),
      api.get('/user/info')
    ]).then(([treeData, userData]) => {
      if (!treeData || !treeData.tree) {
        wx.navigateTo({ url: '/pages/select-tree/select-tree' })
        return
      }

      const tree = treeData.tree
      const user = userData.user

      this.setData({
        species: tree.species,
        speciesName: this.getSpeciesName(tree.species),
        speciesIcon: this.getSpeciesIcon(tree.species),
        level: tree.level,
        growScore: tree.grow_score,
        healthScore: tree.health_score,
        waterCount: user.water_count,
        fertilizeCount: user.fertilize_count,
        loading: false
      })

      this._lastWaterRecoverTime = user.last_water_recover_time || 0

      if (user.water_count === 0) {
        this.startCountdown()
      } else {
        this.clearCountdown()
        this.setData({ countdown: '' })
      }
    }).catch((err) => {
      if (err && err.message && err.message.indexOf('树种') !== -1) {
        wx.navigateTo({ url: '/pages/select-tree/select-tree' })
        return
      }
      this.setData({ loading: false })
    })
  },

  onWater() {
    if (this.data.waterCount <= 0) return

    api.post('/tree/water').then((res) => {
      this.setData({
        growScore: res.growScore,
        level: res.level,
        waterCount: res.waterCount
      })

      if (res.card) {
        this.setData({ cardGained: res.card })
        setTimeout(() => {
          this.setData({ cardGained: null })
        }, 3000)
      }

      if (res.waterCount === 0) {
        this._lastWaterRecoverTime = Date.now()
        this.startCountdown()
      }

      wx.showToast({ title: '浇水成功', icon: 'success' })
    })
  },

  onFertilize() {
    if (this.data.fertilizeCount <= 0) return

    api.post('/tree/fertilize').then((res) => {
      this.setData({
        healthScore: res.healthScore,
        fertilizeCount: res.fertilizeCount
      })

      wx.showToast({ title: '施肥成功', icon: 'success' })
    })
  },

  startCountdown() {
    this.clearCountdown()
    this.updateCountdown()
    this._countdownTimer = setInterval(() => {
      this.updateCountdown()
    }, 1000)
  },

  updateCountdown() {
    const now = Date.now()
    const nextRecoverTime = this._lastWaterRecoverTime + WATERING_RESUME_INTERVAL
    const remaining = nextRecoverTime - now

    if (remaining <= 0) {
      this.clearCountdown()
      this.setData({ countdown: '' })
      this.loadData()
      return
    }

    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    const countdown = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
    this.setData({ countdown })
  },

  clearCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
  },

  getSpeciesName(species) {
    const map = { apple: '苹果树', cherry: '樱花树', oak: '橡树' }
    return map[species] || species
  },

  getSpeciesIcon(species) {
    const map = { apple: '🍎', cherry: '🌸', oak: '🌳' }
    return map[species] || '🌱'
  },

  onDismissCard() {
    this.setData({ cardGained: null })
  }
})
