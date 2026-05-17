// app.js
const api = require('./services/api')

App({
  onLaunch() {
    // 执行登录流程
    this._loginPromise = this._doLogin()
  },

  /**
   * 执行登录流程：调用 api.login() 获取 token，然后检查树状态
   */
  _doLogin() {
    return api.login()
      .then((userData) => {
        this.globalData.userInfo = userData
        this.globalData.isLoggedIn = true
        // 登录成功后检查用户是否已选择树种
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

  /**
   * 提供给页面等待登录完成的方法
   * @returns {Promise<void>}
   */
  getLoginPromise() {
    return this._loginPromise
  },

  globalData: {
    userInfo: null,
    isLoggedIn: false,
    hasTree: false,
    treeData: null
  }
})
