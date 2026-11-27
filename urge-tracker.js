/* 首页催更统计：
   - 匿名点击记录为全站统计
   - 老板在 messages.html 登录后，同一浏览器会保留 Supabase 会话，
     首页点击会自动归属到这个老板账号
   - 某个老板累计到 30 次时，通知店主（每个老板只发一封） */
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

  var notifyBusy = false;

  function notifyMilestone() {
    if (notifyBusy) return;
    notifyBusy = true;

    try {
      client.functions.invoke('notify-urge-milestone', { body: {} }).then(
        function (res) {
          if (res && res.error) {
            console.warn('催更提醒邮件发送失败，下次点击会重试', res.error);
          } else if (res && res.data && res.data.error) {
            console.warn('催更提醒邮件发送失败，下次点击会重试', res.data.error);
          }
        },
        function (err) {
          console.warn('催更提醒邮件发送失败，下次点击会重试', err);
        }
      ).then(function () {
        notifyBusy = false;
      }, function () {
        notifyBusy = false;
      });
    } catch (err) {
      notifyBusy = false;
    }
  }

  function record() {
    try {
      client.auth.getSession()
        .then(function () {
          return client.rpc('record_urges', { p_visitor: visitorId, p_count: 1 });
        })
        .then(
          function (res) {
            if (!res || res.error) {
              if (res && res.error) console.warn('记录催更失败', res.error);
              return;
            }
            var data = res.data || {};
            if (data.should_notify) notifyMilestone();
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
