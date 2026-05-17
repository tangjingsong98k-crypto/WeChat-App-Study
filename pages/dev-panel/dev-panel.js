// pages/dev-panel/dev-panel.js
const api = require('../../services/api')

const CACHE_KEY = 'dev_accounts'
const NEXT_ID_KEY = 'dev_next_id'

Page({
  data: {
    inputId: '',
    accounts: [],       // 历史账号列表
    showHistory: false, // 是否展开历史列表
    loading: false
  },

  onLoad() {
    const app = getApp()
    if (!app.globalData.isDev) {
      // 非开发环境直接跳转主页
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadAccounts()
  },

  loadAccounts() {
    const accounts = wx.getStorageSync(CACHE_KEY) || []
    this.setData({ accounts })
  },

  onInputChange(e) {
    this.setData({ inputId: e.detail.value })
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory })
  },

  // 选择历史账号
  onSelectAccount(e) {
    const openid = e.currentTarget.dataset.openid
    this.setData({ inputId: openid, showHistory: false })
    this.doLogin(openid)
  },

  // 点击进入按钮
  onEnter() {
    let openid = this.data.inputId.trim()
    if (!openid) {
      // 自动生成 ID
      openid = this.generateId()
      this.setData({ inputId: openid })
    }
    this.doLogin(openid)
  },

  generateId() {
    let nextId = wx.getStorageSync(NEXT_ID_KEY) || 1000000
    const id = String(nextId)
    wx.setStorageSync(NEXT_ID_KEY, nextId + 1)
    return id
  },

  doLogin(openid) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const app = getApp()
    app.devLogin(openid).then(() => {
      // 登录成功，保存/更新账号到缓存
      this.saveAccount(openid)
      // 跳转到主页
      wx.switchTab({ url: '/pages/index/index' })
    }).catch((err) => {
      wx.showToast({ title: '登录失败: ' + (err.message || ''), icon: 'none' })
      this.setData({ loading: false })
    })
  },

  saveAccount(openid) {
    let accounts = wx.getStorageSync(CACHE_KEY) || []

    // 登录后获取最新树状态来更新缓存
    const app = getApp()
    const treeData = app.globalData.treeData
    const entry = {
      openid,
      species: treeData ? treeData.species : '',
      level: treeData ? treeData.level : 0,
      growScore: treeData ? treeData.grow_score : 0,
      lastUsed: Date.now()
    }

    // 更新或插入
    const idx = accounts.findIndex(a => a.openid === openid)
    if (idx >= 0) {
      accounts[idx] = entry
    } else {
      accounts.unshift(entry)
    }

    // 最多保存 50 条
    if (accounts.length > 50) accounts = accounts.slice(0, 50)

    wx.setStorageSync(CACHE_KEY, accounts)
    this.setData({ accounts })
  },

  getSpeciesName(species) {
    const map = { apple: '苹果树', cherry: '樱花树', oak: '橡树' }
    return map[species] || '未选择'
  }
})
