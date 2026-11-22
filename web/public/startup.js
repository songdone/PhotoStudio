// Keep this independent of the module bundle so startup and callback errors remain readable.
(function () {
  var language = 'zh-CN';
  try {
    var stored = JSON.parse(localStorage.getItem('photo-studio-preferences') || '{}');
    if (stored && typeof stored === 'object' && stored.uiLanguage === 'en' && stored.resetOnLaunch !== true) language = 'en';
  } catch (_) {
    // Unavailable or invalid preferences use the application default.
  }

  var copy = {
    'Loading the editor…': '正在加载编辑器…',
    'The editor could not be loaded. Reload the page or try a newer browser.': '编辑器未能加载。请重新加载，或换用较新版的浏览器。',
    'The editor is taking longer than expected to start. You can keep waiting or reload the page.': '编辑器启动时间较长。可以继续等待，或重新加载。',
    'Reload': '重新加载',
    'Enable JavaScript to open Photo Studio.': '请启用 JavaScript 后重新打开 Photo Studio。',
    'Photo Studio — File authorization': '文件授权 · Photo Studio',
    'File authorization': '文件授权',
    'Processing authorization…': '正在处理授权结果…',
    'Return to Photo Studio': '返回 Photo Studio',
    'The authorization handler could not be loaded. Return to Photo Studio and try again.': '无法加载授权处理程序。请返回 Photo Studio 重试。',
  };
  function localized(source) {
    return language === 'en' ? source : copy[source] || source;
  }
  document.documentElement.lang = language;

  var panel = document.getElementById('startup');
  var status = document.getElementById('startup-status');
  if (panel && status) {
    var title = panel.querySelector('h1');
    var reload = panel.querySelector('a');
    var noScript = panel.querySelector('noscript p');
    if (title) title.textContent = 'Photo Studio';
    if (status.textContent) status.textContent = localized(status.textContent.trim());
    if (reload) reload.textContent = localized('Reload');
    if (noScript) noScript.textContent = localized('Enable JavaScript to open Photo Studio.');

    document.addEventListener('DOMContentLoaded', function () {
    // Repeat the idempotent setup for pages restored from the back-forward cache.
    document.documentElement.lang = language;
    if (panel && status && panel.getAttribute('data-state') === 'loading') {
      panel.setAttribute('data-state', 'failed');
      status.textContent = localized('The editor could not be loaded. Reload the page or try a newer browser.');
    }
  });
    window.setTimeout(function () {
      var state = panel.getAttribute('data-state');
      if (state === 'loading' || state === 'starting') {
        status.textContent = localized('The editor is taking longer than expected to start. You can keep waiting or reload the page.');
      }
    }, 30000);
  }

  var authTitle = document.getElementById('auth-title');
  var authStatus = document.getElementById('auth-status');
  var back = document.getElementById('return-to-editor');
  if (authTitle) authTitle.textContent = localized('File authorization');
  if (authStatus && authStatus.textContent) authStatus.textContent = localized(authStatus.textContent.trim());
  if (back) back.textContent = localized('Return to Photo Studio');
  document.title = localized(document.title);
  if (authStatus) {
    window.setTimeout(function () {
      if (authStatus.textContent.trim() !== localized('Processing authorization…')) return;
      authStatus.textContent = localized('The authorization handler could not be loaded. Return to Photo Studio and try again.');
    }, 30000);
  }
  document.addEventListener('error', function (event) {
    var target = event.target;
    if (!authStatus || !target || target.tagName !== 'SCRIPT' || !target.type) return;
    if (target.type === 'module') authStatus.textContent = localized('The authorization handler could not be loaded. Return to Photo Studio and try again.');
  }, true);
}());
