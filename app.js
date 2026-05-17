// app.js
const api = require('./services/api')

// 开发环境检测：本地调试或 BASE_URL 指向 localhost
const IS_DEV = api.BASE_URL.indexOf('localhost') !== -1 || api.BASE_URL.indexOf('127.0.0.1') !== -1

App({
  onLaunch() {
    if (IS_DEV) {
      // 开发环境：不自动登录，等待 dev-panel 选择账号后手动触发
      this._loginPromise = Promise.resolve()
      this.globalData.isDev = true
    } else {
      // 生产环境：正常登录流程
      this._loginPromise = this._doLogin()
    }
  },

  /**
   * 开发环境：使用指定 openid 登录
   */
  devLogin(openid) {
    this._loginPromise = this._doLoginWithOpenid(openid)
    return this._loginPromise
  },

  _doLoginWithOpenid(openid) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${api.BASE_URL}/user/login`,
        method: 'POST',
        data: { code: openid },
        header: { 'content-type': 'application/json' },
        success(res) {
          if (res.statusCode === 200 && res.data && res.data.success) {
            const { token, userData } = res.data.data
            wx.setStorageSync('token', token)
            resolve(userData)
          } else {
            reject(new Error('登录失败'))
          }
        },
        fail(err) {
          reject(new Error(err.errMsg || '网络异常'))
        }
      })
    }).then((userData) => {
      this.globalData.userInfo = userData
      this.globalData.isLoggedIn = true
      return api.get('/tree/status')
        .then((treeData) => {
          if (treeData && treeData.tree) {
            this.globalData.hasTree = true
            this.globalData.treeData = treeData.tree
          } else {
            this.globalData.hasTree = false
          }
        })
        .catch(() => {
          this.globalData.hasTree = false
        })
    })
  },

  /**
   * 生产环境登录流程
   */
  _doLogin() {
    return api.login()
      .then((userData) => {
        this.globalData.userInfo = userData
        this.globalData.isLoggedIn = true
        return api.get('/tree/status')
          .then((treeData) => {
            if (treeData && treeData.tree) {
              this.globalData.hasTree = true
              this.globalData.treeData = treeData.tree
            } else {
              this.globalData.hasTree = false
            }
          })
          .catch(() => {
            this.globalData.hasTree = false
          })
      })
      .catch((err) => {
        console.error('登录失败:', err)
        this.globalData.isLoggedIn = false
        this.globalData.hasTree = false
      })
  },

  getLoginPromise() {
    return this._loginPromise
  },

  globalData: {
    userInfo: null,
    isLoggedIn: false,
    hasTree: false,
    treeData: null,
    isDev: false
  }
})
