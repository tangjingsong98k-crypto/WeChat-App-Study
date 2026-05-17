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
    cardGained: null,        // 单张卡牌弹窗（单次点击时）
    cardsGained: [],         // 多张卡牌弹窗（长按结束后）
    showSetComplete: false,  // 集齐卡组提示
    setCompleteInfo: null,
    loading: true,
    waterFloats: [],
    showLevelUp: false,
    levelUpInfo: null,
    showSettlement: false,
    settlementInfo: null,
    isDev: false
  },

  _countdownTimer: null,
  _longPressTimer: null,
  _isLongPressing: false,
  _longPressCount: 0,
  _floatId: 0,
  _pendingCards: [],  // 长按期间累积的卡牌
  _optimisticWaterCount: 0, // 乐观计数：本地预估剩余浇水次数

  onShow() {
    const app = getApp()
    if (app.globalData.isDev && !app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/dev-panel/dev-panel' })
      return
    }
    // 清除残留的浮动文本
    this.setData({ isDev: app.globalData.isDev, waterFloats: [] })
    app.getLoginPromise().then(() => {
      this.loadData()
    })

    // 如果有未读新卡牌，保持 tab 红点
    const newCards = wx.getStorageSync('newCardIds') || []
    if (newCards.length > 0) {
      wx.showTabBarRedDot({ index: 1 })
    }
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
        maxWaterCount: user.max_water_time || MAX_WATERING_TIME,
        fertilizeCount: user.fertilize_count,
        loading: false
      })

      // 基于服务端数据计算恢复满的时间
      this._initCountdown(user.water_count, user.last_water_recover_time)

      // 初始化已完成卡组缓存
      if (!this._lastCompletedSets) {
        api.get('/cards/sets').then((data) => {
          this._lastCompletedSets = new Set((data.sets || []).filter(s => s.completed).map(s => s.setId))
        }).catch(() => {
          this._lastCompletedSets = new Set()
        })
      }

      // 检查是否有未读结算通知
      this._checkSettlement()
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
    const maxWater = this.data.maxWaterCount || MAX_WATERING_TIME
    if (currentCount >= maxWater) {
      this.clearCountdown()
      this.setData({ countdown: '', fullRecoverText: '' })
      return
    }

    const nextRecoverTime = lastRecoverTime + WATERING_RESUME_INTERVAL
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
    const maxWater = this.data.maxWaterCount || MAX_WATERING_TIME

    // 检查是否已经过了恢复时间
    while (this._nextRecoverTime <= now && this._localWaterCount < maxWater) {
      this._localWaterCount++
      this._nextRecoverTime += WATERING_RESUME_INTERVAL
    }

    // 更新显示的水量
    if (this._localWaterCount !== this.data.waterCount) {
      this.setData({ waterCount: this._localWaterCount })
    }

    // 如果已满，停止
    if (this._localWaterCount >= maxWater) {
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

    // 计算恢复满的剩余时间（动态计算，基于当前 _localWaterCount 和 _nextRecoverTime）
    const remainingToFull = maxWater - this._localWaterCount
    const fullRemaining = (this._nextRecoverTime - now) + (remainingToFull - 1) * WATERING_RESUME_INTERVAL
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
    const maxIdx = UPGRADE_NEED_GROW_SCORE.length - 1
    const lastInterval = UPGRADE_NEED_GROW_SCORE[maxIdx] - UPGRADE_NEED_GROW_SCORE[maxIdx - 1]

    let currentThreshold, nextThreshold
    if (level < maxIdx) {
      currentThreshold = UPGRADE_NEED_GROW_SCORE[level]
      nextThreshold = UPGRADE_NEED_GROW_SCORE[level + 1]
    } else {
      // 超过数组范围：每级固定增量
      currentThreshold = UPGRADE_NEED_GROW_SCORE[maxIdx] + (level - maxIdx) * lastInterval
      nextThreshold = currentThreshold + lastInterval
    }

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
    this._optimisticWaterCount = this.data.waterCount
    this._doWater()
    this._scheduleLongPress()
  },

  _getLongPressInterval() {
    const count = this._longPressCount
    const interval = 500 - count * 80
    return interval < 100 ? 100 : interval
  },

  _scheduleLongPress() {
    if (!this._isLongPressing || this._optimisticWaterCount <= 0) {
      this.stopLongPress()
      return
    }
    const interval = this._getLongPressInterval()
    this._longPressTimer = setTimeout(() => {
      if (!this._isLongPressing || this._optimisticWaterCount <= 0) {
        this.stopLongPress()
        return
      }
      this._doWater()
      this._longPressCount++
      this._scheduleLongPress()
    }, interval)
  },

  onWaterLongPressEnd() {
    this._showPendingCards()
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

  /**
   * 长按结束后一次性显示所有累积的卡牌
   */
  _showPendingCards() {
    if (this._pendingCards.length === 0) return

    const cards = this._pendingCards.slice()
    this._pendingCards = []

    // 排序：新种类优先，然后稀有度从高到低
    const qualityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 }
    const seenCards = new Set()
    const processedCards = cards.map(card => {
      const setConfig = SET_COLORS[card.card_set_id] || SET_COLORS['-1']
      const starsCount = QUALITY_STARS[card.card_quality] || 1
      const isNew = !seenCards.has(card.id)
      seenCards.add(card.id)
      return {
        ...card,
        _setName: setConfig.name,
        _setHue: setConfig.hue,
        _setBg: setConfig.bg,
        _stars: '★'.repeat(starsCount),
        _starsCount: starsCount,
        _isNew: isNew,
        _qualityOrder: qualityOrder[card.card_quality] || 3
      }
    })

    // 新种类优先，然后稀有度高的优先
    processedCards.sort((a, b) => {
      if (a._isNew !== b._isNew) return a._isNew ? -1 : 1
      return a._qualityOrder - b._qualityOrder
    })

    this.setData({ cardsGained: processedCards })

    // 检查是否集齐了卡组
    this._checkSetCompletion()
  },

  _doWater() {
    if (this._optimisticWaterCount <= 0 && this._isLongPressing) return
    if (this.data.waterCount <= 0 && !this._isLongPressing) return

    // 乐观递减：立即减少本地计数，不等服务端响应
    if (this._isLongPressing) {
      this._optimisticWaterCount--
    }

    const prevLevel = this.data.level
    const prevGrowScore = this.data.growScore

    api.post('/tree/water').then((res) => {
      const newLevel = res.level
      const newGrowScore = res.growScore
      const actualGain = newGrowScore - prevGrowScore

      this.setData({
        growScore: newGrowScore,
        level: newLevel,
        waterCount: res.waterCount,
        growPercent: this.calcGrowPercent(newGrowScore, newLevel)
      })

      // 同步乐观计数（取服务端值和本地乐观值的较小值，防止回弹）
      if (this._isLongPressing) {
        this._optimisticWaterCount = Math.min(this._optimisticWaterCount, res.waterCount)
      }

      // 显示实际增加的成长值
      this.showWaterFloat(actualGain)

      if (res.card) {
        const card = res.card
        // 只有首次获得的卡牌才标记为新卡牌（用于红点显示）
        if (card.isFirstGain) {
          this._markCardAsNew(card.id)
        }

        if (this._isLongPressing) {
          // 长按中：累积卡牌，显示 "+1🃏" 浮动文本
          this._pendingCards.push(card)
          this.showCardFloat()
        } else {
          // 单次点击：立即显示卡牌弹窗
          const setConfig = SET_COLORS[card.card_set_id] || SET_COLORS['-1']
          const starsCount = QUALITY_STARS[card.card_quality] || 1
          card._setName = setConfig.name
          card._setHue = setConfig.hue
          card._setBg = setConfig.bg
          card._stars = '★'.repeat(starsCount)
          card._starsCount = starsCount
          this.setData({ cardGained: card })
          setTimeout(() => { this.setData({ cardGained: null }) }, 3000)
          // 检查是否集齐卡组
          this._checkSetCompletion()
        }

        // 获得卡牌后可能集齐套装，静默刷新用户数据以更新加成
        api.get('/user/info').then((userData) => {
          const user = userData.user
          const newMax = user.max_water_time || MAX_WATERING_TIME
          if (newMax !== this.data.maxWaterCount) {
            this.setData({ maxWaterCount: newMax })
          }
        }).catch(() => {})
      }

      // 更新倒计时：只在首次启动时用服务端数据，之后不再重置时间基准
      const effectiveMax = res.maxWaterTime || this.data.maxWaterCount || MAX_WATERING_TIME
      if (effectiveMax !== this.data.maxWaterCount) {
        this.setData({ maxWaterCount: effectiveMax })
      }
      if (res.waterCount < effectiveMax) {
        this._localWaterCount = res.waterCount
        if (!this._countdownTimer) {
          const nextRecover = res.nextRecoverTime || (Date.now() + WATERING_RESUME_INTERVAL)
          this._nextRecoverTime = nextRecover
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
    const prevGrowScore = this.data.growScore
    api.post('/test/refill').then(() => {
      return api.post('/tree/water')
    }).then((res) => {
      const effectiveMax = res.maxWaterTime || this.data.maxWaterCount || MAX_WATERING_TIME
      const actualGain = res.growScore - prevGrowScore
      this._localWaterCount = res.waterCount
      this.setData({
        growScore: res.growScore,
        level: res.level,
        waterCount: res.waterCount,
        maxWaterCount: effectiveMax,
        growPercent: this.calcGrowPercent(res.growScore, res.level)
      })
      this.showWaterFloat(actualGain)
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

  // 测试模式：触发全服结算
  onDevSettle() {
    wx.showLoading({ title: '结算中...' })
    api.post('/test/settle').then(() => {
      wx.hideLoading()
      // 结算完成后刷新数据并检查结算通知
      this._fetchAndApply()
      setTimeout(() => {
        this._checkSettlement()
      }, 500)
    }).catch(() => {
      wx.hideLoading()
    })
  },

  /**
   * 检查是否有未读的结算通知
   */
  _checkSettlement() {
    api.get('/user/settlement').then((data) => {
      if (data.hasSettlement) {
        this.setData({
          showSettlement: true,
          settlementInfo: data
        })
      }
    }).catch(() => {})
  },

  onDismissSettlement() {
    this.setData({ showSettlement: false, settlementInfo: null })
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

  showCardFloat() {
    const id = ++this._floatId
    const floats = this.data.waterFloats.concat([{ id, text: '+1🃏' }])
    this.setData({ waterFloats: floats })
    setTimeout(() => {
      const current = this.data.waterFloats.filter(f => f.id !== id)
      this.setData({ waterFloats: current })
    }, 1000)
  },

  /**
   * 检查是否集齐了卡组，如果是则弹出提示
   */
  _checkSetCompletion() {
    api.get('/cards/sets').then((data) => {
      const sets = data.sets || []
      const completed = sets.find(s => s.completed)
      if (completed && !this._lastCompletedSets) {
        this._lastCompletedSets = new Set()
      }
      // 找到新完成的卡组
      const newlyCompleted = sets.filter(s => s.completed && this._lastCompletedSets && !this._lastCompletedSets.has(s.setId))
      if (newlyCompleted.length > 0) {
        newlyCompleted.forEach(s => this._lastCompletedSets.add(s.setId))
        // 显示集齐提示（显示第一个新完成的）
        this.setData({
          showSetComplete: true,
          setCompleteInfo: newlyCompleted[0]
        })
      }
      // 更新已完成集合缓存
      if (!this._lastCompletedSets) {
        this._lastCompletedSets = new Set(sets.filter(s => s.completed).map(s => s.setId))
      }
    }).catch(() => {})
  },

  onDismissCards() {
    this.setData({ cardsGained: [] })
  },

  onDismissSetComplete() {
    this.setData({ showSetComplete: false, setCompleteInfo: null })
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
    if (this.data.fertilizeCount <= 0 || this.data.healthScore >= 100) return
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
  },

  /**
   * 将卡牌标记为"新获得"，存入本地缓存，并显示卡牌 tab 红点
   */
  _markCardAsNew(cardId) {
    const newCards = wx.getStorageSync('newCardIds') || []
    if (!newCards.includes(cardId)) {
      newCards.push(cardId)
      wx.setStorageSync('newCardIds', newCards)
    }
    // 显示卡牌 tab 红点（index=1 是卡牌 tab）
    wx.showTabBarRedDot({ index: 1 })
  }
})
