// pages/index/index.js
const api = require('../../services/api')

const WATERING_RESUME_INTERVAL = 5 * 1000 // 5秒（与服务端一致）
const MAX_WATERING_TIME = 50
const WATERING_GROW_SCORE = 10
const UPGRADE_NEED_GROW_SCORE = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500]

// 卡组颜色配置（与 cards 页面一致）
const SET_COLORS = {
  1: { name: '四季之歌', hue: '#4caf50', bg: '#e8f5e9' },
  2: { name: '森林守护者', hue: '#2196f3', bg: '#e3f2fd' },
  3: { name: '彩虹花园', hue: '#9c27b0', bg: '#f3e5f5' },
  '-1': { name: '散卡', hue: '#607d8b', bg: '#eceff1' }
}
const QUALITY_STARS = { common: 1, rare: 2, epic: 3, legendary: 5 }

Page({
  data: {
    species: '',
    speciesName: '',
    speciesIcon: '',
    level: 0,
    growScore: 0,
    growPercent: 0,
    healthScore: 0,
    waterCount: 0,
    maxWaterCount: MAX_WATERING_TIME,
    fertilizeCount: 0,
    countdown: '',
    fullRecoverText: '',
    cardGained: null,
    loading: true,
    waterFloats: [],
    showLevelUp: false,
    levelUpInfo: null,
    isDev: false
  },

  _countdownTimer: null,
  // 预估恢复满的绝对时间戳
  _fullRecoverTime: 0,
  _longPressTimer: null,
  _isLongPressing: false,
  _longPressCount: 0,
  _floatId: 0,

  onShow() {
    const app = getApp()
    if (app.globalData.isDev && !app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/dev-panel/dev-panel' })
      return
    }
    this.setData({ isDev: app.globalData.isDev })
    app.getLoginPromise().then(() => {
      this.loadData()
    })
  },

  onHide() {
    this.clearCountdown()
    this.stopLongPress()
  },

  onUnload() {
    this.clearCountdown()
    this.stopLongPress()
  },

  loadData() {
    this.setData({ loading: true })
    this._fetchAndApply()
  },

  _fetchAndApply() {
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
        growPercent: this.calcGrowPercent(tree.grow_score, tree.level),
        healthScore: tree.health_score,
        waterCount: user.water_count,
        fertilizeCount: user.fertilize_count,
        loading: false
      })

      // 基于服务端数据计算恢复满的时间
      this._initCountdown(user.water_count, user.last_water_recover_time)
    }).catch((err) => {
      if (err && err.message && err.message.indexOf('树种') !== -1) {
        wx.navigateTo({ url: '/pages/select-tree/select-tree' })
        return
      }
      this.setData({ loading: false })
    })
  },

  /**
   * 基于服务端返回的当前水量和上次恢复时间，计算恢复满的绝对时间
   * 然后启动纯本地倒计时
   */
  _initCountdown(currentCount, lastRecoverTime) {
    if (currentCount >= MAX_WATERING_TIME) {
      this.clearCountdown()
      this.setData({ countdown: '', fullRecoverText: '' })
      return
    }

    // 还需要恢复的次数
    const remaining = MAX_WATERING_TIME - currentCount
    // 下一次恢复的时间 = lastRecoverTime + interval
    const nextRecoverTime = lastRecoverTime + WATERING_RESUME_INTERVAL
    // 恢复满的时间 = nextRecoverTime + (remaining - 1) * interval
    this._fullRecoverTime = nextRecoverTime + (remaining - 1) * WATERING_RESUME_INTERVAL

    this._startLocalCountdown(currentCount, nextRecoverTime)
  },

  /**
   * 纯本地倒计时：基于 nextRecoverTime 预估，每秒更新显示
   * 到期时本地递增 waterCount，重新计算下一次到期时间
   */
  _startLocalCountdown(currentCount, nextRecoverTime) {
    this.clearCountdown()

    // 缓存下一次恢复的绝对时间
    this._nextRecoverTime = nextRecoverTime
    this._localWaterCount = currentCount

    this._tickCountdown()
    this._countdownTimer = setInterval(() => {
      this._tickCountdown()
    }, 200) // 200ms 刷新一次，显示更平滑
  },

  _tickCountdown() {
    const now = Date.now()

    // 检查是否已经过了恢复时间
    while (this._nextRecoverTime <= now && this._localWaterCount < MAX_WATERING_TIME) {
      this._localWaterCount++
      this._nextRecoverTime += WATERING_RESUME_INTERVAL
    }

    // 更新显示的水量
    if (this._localWaterCount !== this.data.waterCount) {
      this.setData({ waterCount: this._localWaterCount })
    }

    // 如果已满，停止
    if (this._localWaterCount >= MAX_WATERING_TIME) {
      this.clearCountdown()
      this.setData({ countdown: '', fullRecoverText: '' })
      return
    }

    // 计算到下一次恢复的剩余时间
    const remaining = this._nextRecoverTime - now
    const totalSeconds = Math.max(Math.floor(remaining / 1000), 0)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const countdown = minutes > 0
      ? `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
      : `${totalSeconds}s`

    // 计算恢复满的剩余时间
    const fullRemaining = this._fullRecoverTime - now
    const fullRecoverText = this._formatFullRecover(fullRemaining)

    this.setData({ countdown, fullRecoverText })
  },

  _formatFullRecover(ms) {
    if (ms <= 0) return ''
    const totalSeconds = Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}时${minutes}分后水壶装满`
    }
    if (minutes > 0) {
      return `${minutes}分${totalSeconds % 60}秒后水壶装满`
    }
    return `${totalSeconds}秒后水壶装满`
  },

  clearCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
  },

  calcGrowPercent(growScore, level) {
    const maxLevel = UPGRADE_NEED_GROW_SCORE.length - 1
    if (level >= maxLevel) return 100
    const currentThreshold = UPGRADE_NEED_GROW_SCORE[level]
    const nextThreshold = UPGRADE_NEED_GROW_SCORE[level + 1]
    const range = nextThreshold - currentThreshold
    if (range <= 0) return 100
    const progress = growScore - currentThreshold
    return Math.min(Math.max(Math.floor(progress / range * 100), 0), 100)
  },

  // ========== 浇水逻辑 ==========

  onWater() {
    if (this.data.waterCount <= 0) return
    this._doWater()
  },

  onWaterLongPressStart() {
    if (this.data.waterCount <= 0) return
    this._isLongPressing = true
    this._longPressCount = 0
    this._doWater()
    this._scheduleLongPress()
  },

  _getLongPressInterval() {
    const count = this._longPressCount
    const interval = 500 - count * 80
    return interval < 100 ? 100 : interval
  },

  _scheduleLongPress() {
    if (!this._isLongPressing || this.data.waterCount <= 0) {
      this.stopLongPress()
      return
    }
    const interval = this._getLongPressInterval()
    this._longPressTimer = setTimeout(() => {
      if (!this._isLongPressing || this.data.waterCount <= 0) {
        this.stopLongPress()
        return
      }
      this._doWater()
      this._longPressCount++
      this._scheduleLongPress()
    }, interval)
  },

  onWaterLongPressEnd() {
    this.stopLongPress()
  },

  stopLongPress() {
    this._isLongPressing = false
    this._longPressCount = 0
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer)
      this._longPressTimer = null
    }
  },

  _doWater() {
    if (this.data.waterCount <= 0) return
    const prevLevel = this.data.level

    api.post('/tree/water').then((res) => {
      const newLevel = res.level
      const newGrowScore = res.growScore

      this.setData({
        growScore: newGrowScore,
        level: newLevel,
        waterCount: res.waterCount,
        growPercent: this.calcGrowPercent(newGrowScore, newLevel)
      })

      this.showWaterFloat(WATERING_GROW_SCORE)

      if (res.card) {
        const card = res.card
        const setConfig = SET_COLORS[card.card_set_id] || SET_COLORS['-1']
        const starsCount = QUALITY_STARS[card.card_quality] || 1
        card._setName = setConfig.name
        card._setHue = setConfig.hue
        card._setBg = setConfig.bg
        card._stars = '★'.repeat(starsCount)
        card._starsCount = starsCount
        this.setData({ cardGained: card })
        setTimeout(() => { this.setData({ cardGained: null }) }, 3000)
      }

      // 用服务端返回的真实数据重新初始化倒计时
      if (res.waterCount < MAX_WATERING_TIME) {
        const nextRecover = res.nextRecoverTime || (Date.now() + WATERING_RESUME_INTERVAL)
        this._localWaterCount = res.waterCount
        this._nextRecoverTime = nextRecover
        this._fullRecoverTime = nextRecover + (MAX_WATERING_TIME - res.waterCount - 1) * WATERING_RESUME_INTERVAL
        if (!this._countdownTimer) {
          this._startLocalCountdown(res.waterCount, nextRecover)
        }
      } else {
        this.clearCountdown()
        this.setData({ countdown: '', fullRecoverText: '' })
      }

      if (res.waterCount === 0) {
        this.stopLongPress()
      }

      if (newLevel > prevLevel) {
        this.stopLongPress()
        this.showLevelUpDialog(prevLevel, newLevel, newGrowScore)
      }
    }).catch(() => {
      this.stopLongPress()
    })
  },

  // 测试模式：无限浇水
  onDevWater() {
    api.post('/test/refill').then(() => {
      return api.post('/tree/water')
    }).then((res) => {
      this.setData({
        growScore: res.growScore,
        level: res.level,
        waterCount: res.waterCount,
        growPercent: this.calcGrowPercent(res.growScore, res.level)
      })
      this.showWaterFloat(WATERING_GROW_SCORE)
    }).catch(() => {})
  },

  // 测试模式：无限施肥
  onDevFertilize() {
    api.post('/test/refill').then(() => {
      return api.post('/tree/fertilize')
    }).then((res) => {
      this.setData({
        healthScore: res.healthScore,
        fertilizeCount: res.fertilizeCount
      })
      wx.showToast({ title: '施肥成功', icon: 'success' })
    }).catch(() => {})
  },

  showWaterFloat(amount) {
    const id = ++this._floatId
    const floats = this.data.waterFloats.concat([{ id, text: `+${amount}💧` }])
    this.setData({ waterFloats: floats })
    setTimeout(() => {
      const current = this.data.waterFloats.filter(f => f.id !== id)
      this.setData({ waterFloats: current })
    }, 1000)
  },

  showLevelUpDialog(prevLevel, curLevel, growScore) {
    Promise.all([
      api.get('/ranking/friends'),
      api.get('/ranking/all')
    ]).then(([friendsData, allData]) => {
      const friendsRank = this.findMyRank(friendsData.rankings, growScore)
      const allRank = this.findMyRank(allData.rankings, growScore)
      const participating = friendsRank !== null || allRank !== null

      this.setData({
        showLevelUp: true,
        levelUpInfo: { prevLevel, curLevel, growScore, participating, friendsRank: friendsRank || '-', allRank: allRank || '-' }
      })
    }).catch(() => {
      this.setData({
        showLevelUp: true,
        levelUpInfo: { prevLevel, curLevel, growScore, participating: false, friendsRank: '-', allRank: '-' }
      })
    })
  },

  findMyRank(rankings, growScore) {
    if (!rankings || rankings.length === 0) return null
    for (let i = 0; i < rankings.length; i++) {
      if (rankings[i].growScore <= growScore) return i + 1
    }
    return rankings.length + 1
  },

  onDismissLevelUp() {
    this.setData({ showLevelUp: false, levelUpInfo: null })
  },

  // ========== 施肥逻辑 ==========

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

  // ========== 工具方法 ==========

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
