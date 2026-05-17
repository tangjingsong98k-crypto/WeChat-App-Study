/**
 * 统一 API 请求模块
 * 封装 wx.request，实现请求拦截（自动附加 token）、响应拦截（统一错误处理）
 * 以及 Token 过期自动重新登录逻辑
 */

const BASE_URL = 'http://localhost:3000/api'

/**
 * 执行微信登录流程：wx.login → POST /api/user/login → 存储 token
 * @returns {Promise<object>} 登录返回的用户数据
 */
function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          reject(new Error('wx.login 获取 code 失败'))
          return
        }

        wx.request({
          url: `${BASE_URL}/user/login`,
          method: 'POST',
          data: { code: loginRes.code },
          header: { 'content-type': 'application/json' },
          success(res) {
            if (res.statusCode === 200 && res.data && res.data.success) {
              const { token, userData } = res.data.data
              wx.setStorageSync('token', token)
              resolve(userData)
            } else {
              const msg = (res.data && res.data.error && res.data.error.message) || '登录失败'
              reject(new Error(msg))
            }
          },
          fail(err) {
            reject(new Error(err.errMsg || '网络异常，请重试'))
          }
        })
      },
      fail(err) {
        reject(new Error(err.errMsg || 'wx.login 调用失败'))
      }
    })
  })
}

/**
 * 标记是否正在重新登录，避免并发重复登录
 */
let isRelogging = false
let relogPromise = null

/**
 * 重新登录（Token 过期时调用）
 * @returns {Promise<void>}
 */
function relogin() {
  if (isRelogging) {
    return relogPromise
  }
  isRelogging = true
  relogPromise = login()
    .then(() => {
      isRelogging = false
      relogPromise = null
    })
    .catch((err) => {
      isRelogging = false
      relogPromise = null
      throw err
    })
  return relogPromise
}

/**
 * 统一请求方法，封装 wx.request
 * @param {object} options - 请求配置
 * @param {string} options.url - 请求路径（相对路径，如 '/tree/water'）
 * @param {string} [options.method='GET'] - 请求方法
 * @param {object} [options.data] - 请求数据
 * @param {boolean} [options._isRetry=false] - 内部标记，是否为重试请求
 * @returns {Promise<object>} 响应数据（res.data.data）
 */
function request(options) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || ''

    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'content-type': 'application/json',
        'x-token': token
      },
      success(res) {
        // 处理 401 AUTH_REQUIRED：自动重新登录并重试
        if (res.statusCode === 401) {
          const errorCode = res.data && res.data.error && res.data.error.code
          if (errorCode === 'AUTH_REQUIRED' && !options._isRetry) {
            // 自动重新登录后重试原请求
            relogin()
              .then(() => {
                return request(Object.assign({}, options, { _isRetry: true }))
              })
              .then(resolve)
              .catch(reject)
            return
          }
        }

        // 检查响应是否成功
        if (res.statusCode === 200 && res.data && res.data.success) {
          resolve(res.data.data)
        } else {
          // 业务错误，显示错误提示
          const msg = (res.data && res.data.error && res.data.error.message) || '请求失败'
          wx.showToast({
            title: msg,
            icon: 'none',
            duration: 2000
          })
          reject(new Error(msg))
        }
      },
      fail(err) {
        wx.showToast({
          title: '网络异常，请重试',
          icon: 'none',
          duration: 2000
        })
        reject(new Error(err.errMsg || '网络异常，请重试'))
      }
    })
  })
}

/**
 * GET 请求便捷方法
 * @param {string} url - 请求路径
 * @param {object} [data] - 查询参数
 * @returns {Promise<object>}
 */
function get(url, data) {
  return request({ url, method: 'GET', data })
}

/**
 * POST 请求便捷方法
 * @param {string} url - 请求路径
 * @param {object} [data] - 请求体数据
 * @returns {Promise<object>}
 */
function post(url, data) {
  return request({ url, method: 'POST', data })
}

module.exports = {
  BASE_URL,
  login,
  request,
  get,
  post
}
