/**
 * 主题防闪烁脚本
 * 在 React hydration 之前同步执行，设置 <html class="dark">
 * 逻辑与 ThemeProvider.getStoredMode() 完全一致
 */
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark;
    if (stored === 'dark') {
      isDark = true;
    } else if (stored === 'light') {
      isDark = false;
    } else {
      // 'system' 或未设置 → 跟随系统偏好
      isDark = prefersDark;
    }
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {
    // localStorage 不可用，回退系统偏好
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }
})();
