/* 首页匿名催更统计：每次点击记录一条，店主后台可看汇总 */
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) return;

  var client;
  try {
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch (err) {
    return;
  }

  var visitorId = '';
  try {
    visitorId = window.localStorage.getItem('whip.visitor') || '';
    if (!visitorId) {
      visitorId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
      window.localStorage.setItem('whip.visitor', visitorId);
    }
  } catch (err) {
    visitorId = 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  function record() {
    try {
      client.rpc('record_urges', { p_visitor: visitorId, p_count: 1 }).then(
        function (res) {
          if (res && res.error) console.warn('记录催更失败', res.error);
        },
        function (err) {
          console.warn('记录催更失败', err);
        }
      );
    } catch (err) {
      /* 统计失败不影响首页动画 */
    }
  }

  window.addEventListener('whip:hit', record);
})();
