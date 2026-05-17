// pages/index/index.js
const api = require('../../services/api')

const WATERING_RESUME_INTERVAL = 1800 * 1000 // 30分钟
const WATERING_GROW_SCORE = 10
const UPGRADE_NEED_GROW_SCORE = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500]

Page({
  data: {
    species: '',
    speciesName: '',
    speciesIcon: '',
    level: 0,
    growScore: 0,
    growPercent: 0, // 当前等级内的进度百分比
    healthScore: 0,
    waterCount: 0,
    fertilizeCount: 0,
    countdown: '',
    cardGained: null,
    loading: true,
    // 浇水飘字动画
    waterFloats: [],
    // 升级弹窗
    showLevelUp: false,
    levelUpInfo: null
  },

  _countdownTimer: null,
  _lastWaterRecoverTime: 0,
  _longPressTimer: null,
  _isLongPressing: false,
  _longPressCount: 0, // 长按已浇水次数，用于加速
  _floatId: 0,

  onShow() {
    const app = getApp()
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

  /**
   * 计算当前等级内的成长进度百分比
   * 例如：1级需100，2级需300，当前250 → (250-100)/(300-100) = 75%
   */
  calcGrowPercent(growScore, level) {
    const maxLevel = UPGRADE_NEED_GROW_SCORE.length - 1
    if (level >= maxLevel) return 100

    const currentThreshold = UPGRADE_NEED_GROW_SCORE[level]
    const nextThreshold = UPGRADE_NEED_GROW_SCORE[level + 1]
    const range = nextThreshold - currentThreshold

    if (range <= 0) return 100

    const progress = growScore - currentThreshold
    const percent = Math.min(Math.max(Math.floor(progress / range * 100), 0), 100)
    return percent
  },

  // ========== 浇水逻辑 ==========

  onWater() {
    if (this.data.waterCount <= 0) return
    this._doWater()
  },

  // 长按开始连续浇水（带加速度）
  onWaterLongPressStart() {
    if (this.data.waterCount <= 0) return
    this._isLongPressing = true
    this._longPressCount = 0
    this._doWater()
    this._scheduleLongPress()
  },

  // 根据已浇水次数计算下一次间隔（越按越快）
  _getLongPressInterval() {
    // 起始 500ms，每浇 3 次加速一档，最快 100ms
    const count = this._longPressCount
    if (500 - count * 80 < 0) return 100
    return 500 - count * 80
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

  // 长按结束
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

      // 显示浇水飘字动画
      this.showWaterFloat(WATERING_GROW_SCORE)

      // 如果获得了卡牌，显示通知
      if (res.card) {
        this.setData({ cardGained: res.card })
        setTimeout(() => {
          this.setData({ cardGained: null })
        }, 3000)
      }

      // 如果浇水次数变为0，启动倒计时
      if (res.waterCount === 0) {
        this._lastWaterRecoverTime = Date.now()
        this.startCountdown()
        this.stopLongPress()
      }

      // 触发升级弹窗
      if (newLevel > prevLevel) {
        this.stopLongPress()
        this.showLevelUpDialog(prevLevel, newLevel, newGrowScore)
      }
    }).catch(() => {
      this.stopLongPress()
    })
  },

  /**
   * 显示浇水飘字动画 (+n💧)
   */
  showWaterFloat(amount) {
    const id = ++this._floatId
    const floats = this.data.waterFloats.concat([{ id, text: `+${amount}💧` }])
    this.setData({ waterFloats: floats })

    // 动画结束后移除
    setTimeout(() => {
      const current = this.data.waterFloats.filter(f => f.id !== id)
      this.setData({ waterFloats: current })
    }, 1000)
  },

  /**
   * 显示升级弹窗，包含排名信息
   */
  showLevelUpDialog(prevLevel, curLevel, growScore) {
    // 先获取排名信息
    Promise.all([
      api.get('/ranking/friends'),
      api.get('/ranking/all')
    ]).then(([friendsData, allData]) => {
      // 找到自己的排名（简单实现：根据 growScore 匹配位置）
      const friendsRank = this.findMyRank(friendsData.rankings, growScore)
      const allRank = this.findMyRank(allData.rankings, growScore)

      // 如果两个排名都找不到自己，说明未参与排行榜
      const participating = friendsRank !== null || allRank !== null

      this.setData({
        showLevelUp: true,
        levelUpInfo: {
          prevLevel,
          curLevel,
          growScore,
          participating,
          friendsRank: friendsRank || '-',
          allRank: allRank || '-'
        }
      })
    }).catch(() => {
      // 获取排名失败，视为未参与
      this.setData({
        showLevelUp: true,
        levelUpInfo: {
          prevLevel,
          curLevel,
          growScore,
          participating: false,
          friendsRank: '-',
          allRank: '-'
        }
      })
    })
  },

  findMyRank(rankings, growScore) {
    if (!rankings || rankings.length === 0) return null
    // 排名列表已按 growScore 降序排列，找到第一个 <= 自己分数的位置
    for (let i = 0; i < rankings.length; i++) {
      if (rankings[i].growScore <= growScore) {
        return i + 1
      }
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

  // ========== 倒计时 ==========

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
