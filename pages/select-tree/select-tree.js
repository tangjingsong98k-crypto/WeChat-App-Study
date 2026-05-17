// pages/select-tree/select-tree.js
const api = require('../../services/api')

Page({
  data: {
    speciesList: [
      { id: 'apple', name: '苹果树', icon: '🍎', desc: '硕果累累，象征丰收' },
      { id: 'cherry', name: '樱花树', icon: '🌸', desc: '浪漫绽放，美丽动人' },
      { id: 'oak', name: '橡树', icon: '🌳', desc: '坚韧挺拔，百年长青' }
    ],
    selectedSpecies: '',
    loading: false
  },

  onSelectSpecies(e) {
    const species = e.currentTarget.dataset.species
    this.setData({ selectedSpecies: species })
  },

  onConfirm() {
    if (!this.data.selectedSpecies || this.data.loading) return

    this.setData({ loading: true })
    wx.showLoading({ title: '正在选择...' })

    api.post('/tree/select', { species: this.data.selectedSpecies })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '选择成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 500)
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ loading: false })
      })
  }
})
