/* ============================================================
   首页老板留言墙
   - 游客可看，登录老板可发布留言 / 评分
   - 公开接口只返回昵称、留言、评分、时间
   - 首次发布时会把公开昵称保存到 profiles.public_name
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var feed = document.getElementById('wallFeed');
  if (!feed) return;

  var els = {
    form: document.getElementById('wallForm'),
    name: document.getElementById('wallName'),
    content: document.getElementById('wallContent'),
    stars: document.getElementById('wallStars'),
    msg: document.getElementById('wallMsg'),
    submit: document.getElementById('wallSubmit'),
    login: document.getElementById('wallLoggedOut'),
    ownerNote: document.getElementById('wallOwnerNote')
  };

  var state = {
    user: null,
    profile: null,
    rating: 0,
    busy: false
  };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function starsText(rating) {
    var value = Math.max(0, Math.min(5, Number(rating) || 0));
    return value ? '★★★★★'.slice(0, value) : '';
  }

  function errorText(err) {
    var message = (err && (err.message || err.details || err.hint)) || String(err || '操作失败');
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      return '留言墙还没启用，请先运行 migration-008。';
    }
    if (/permission denied|row-level security|42501/i.test(message)) {
      return '没有权限发布留言，请重新登录后再试。';
    }
    return message;
  }

  function setMessage(text, type) {
    if (!els.msg) return;
    els.msg.textContent = text || '';
    els.msg.className = 'wall-msg' + (type ? ' is-' + type : '');
  }

  function setBusy(busy, text) {
    state.busy = busy;
    if (els.submit) {
      els.submit.disabled = busy;
      if (!els.submit.dataset.label) els.submit.dataset.label = els.submit.textContent;
      els.submit.textContent = busy ? text : els.submit.dataset.label;
    }
  }

  function renderFeed(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      feed.innerHTML = '<p class="wall-empty">还没有留言，登录后可以做第一个。</p>';
      return;
    }

    feed.innerHTML = rows.map(function (row) {
      var stars = starsText(row.rating);
      return (
        '<article class="wall-card">' +
          '<div class="wall-card-top">' +
            '<span class="wall-nickname" title="' + escapeHtml(row.display_name) + '">' +
              escapeHtml(row.display_name || '老板') +
            '</span>' +
            (stars ? '<span class="wall-stars-view" aria-label="' + Number(row.rating) + ' 星">' + stars + '</span>' : '') +
          '</div>' +
          '<p class="wall-text">' + escapeHtml(row.content) + '</p>' +
          '<div class="wall-date">' + escapeHtml(formatDate(row.created_at)) + '</div>' +
        '</article>'
      );
    }).join('');
  }

  async function loadFeed() {
    feed.innerHTML = '<p class="wall-loading">正在加载留言…</p>';
    try {
      var res = await client.rpc('public_wall_feed', { p_limit: 9 });
      if (res.error) throw res.error;
      renderFeed(res.data || []);
    } catch (err) {
      console.warn('读取留言墙失败', err);
      feed.innerHTML = '<p class="wall-error">' + escapeHtml(errorText(err)) + '</p>';
    }
  }

  function showLoggedOut() {
    if (els.form) els.form.hidden = true;
    if (els.ownerNote) els.ownerNote.hidden = true;
    if (els.login) els.login.hidden = false;
  }

  function showOwnerNote() {
    if (els.form) els.form.hidden = true;
    if (els.login) els.login.hidden = true;
    if (els.ownerNote) els.ownerNote.hidden = false;
  }

  function showForm(profile) {
    if (els.form) els.form.hidden = false;
    if (els.login) els.login.hidden = true;
    if (els.ownerNote) els.ownerNote.hidden = true;
    if (els.name) els.name.value = (profile && profile.public_name) || '';
    setMessage('', '');
    updateStars();
  }

  function updateStars() {
    if (!els.stars) return;
    Array.prototype.slice.call(els.stars.querySelectorAll('button')).forEach(function (button) {
      button.classList.toggle('is-on', Number(button.getAttribute('data-star')) <= state.rating);
    });
  }

  async function loadProfile(userId) {
    var res = await client
      .from('profiles')
      .select('role, public_name, display_name')
      .eq('id', userId)
      .maybeSingle();

    if (res.error && /public_name/i.test(res.error.message || '')) {
      res = await client
        .from('profiles')
        .select('role, display_name')
        .eq('id', userId)
        .maybeSingle();
      if (res.data) res.data.public_name = '';
    }

    if (res.error) throw res.error;
    return res.data || null;
  }

  async function loadSession() {
    try {
      var sessionRes = await client.auth.getSession();
      var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
      if (!session || !session.user) {
        state.user = null;
        state.profile = null;
        showLoggedOut();
        return;
      }

      state.user = session.user;
      var profile = await loadProfile(session.user.id);
      if (!profile) {
        showLoggedOut();
        return;
      }

      state.profile = profile;
      if (profile.role === 'boss') {
        showForm(profile);
      } else {
        showOwnerNote();
      }
    } catch (err) {
      console.warn('读取留言墙登录状态失败', err);
      showLoggedOut();
    }
  }

  if (els.stars) {
    els.stars.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-star]');
      if (!button) return;
      var value = Number(button.getAttribute('data-star'));
      state.rating = state.rating === value ? 0 : value;
      updateStars();
    });
  }

  if (els.form) {
    els.form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (state.busy) return;

      var name = els.name ? els.name.value.trim() : '';
      var content = els.content ? els.content.value.trim() : '';

      if (!name) {
        setMessage('请先填写公开昵称。', 'error');
        if (els.name) els.name.focus();
        return;
      }
      if (name.length > 20) {
        setMessage('公开昵称最多 20 个字符。', 'error');
        return;
      }
      if (!content) {
        setMessage('留言内容不能为空。', 'error');
        if (els.content) els.content.focus();
        return;
      }
      if (content.length > 300) {
        setMessage('留言最多 300 个字符。', 'error');
        return;
      }

      setBusy(true, '发布中…');
      setMessage('', '');

      try {
        var res = await client.rpc('post_wall_message', {
          p_content: content,
          p_rating: state.rating || null,
          p_name: name
        });
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);

        if (state.profile) state.profile.public_name = name;
        if (els.content) els.content.value = '';
        state.rating = 0;
        updateStars();
        setMessage('发布成功，已经显示在留言墙。', 'ok');
        await loadFeed();
      } catch (err) {
        console.warn('发布留言失败', err);
        setMessage(errorText(err), 'error');
      } finally {
        setBusy(false, '发布中…');
      }
    });
  }

  if (!window.supabase || !cfg.url || !cfg.anonKey) {
    feed.innerHTML = '<p class="wall-error">留言墙配置缺失，暂时无法加载。</p>';
    showLoggedOut();
    return;
  }

  var client = window.supabase.createClient(cfg.url, cfg.anonKey);

  loadFeed();
  loadSession();
})();
