// Manual updates until a separately hosted and tested legacy feed exists.
module.exports = { autoUpdater: {
  on() {}, setFeedURL() {},
  async checkForUpdates() { throw new Error('نسخهٔ ویندوز ۷ باید با نصاب مخصوص Win7 به‌روزرسانی شود.'); },
  quitAndInstall() { throw new Error('Legacy automatic updates are disabled'); }
} };
