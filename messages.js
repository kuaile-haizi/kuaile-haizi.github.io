/* ============================================================
   老板留言板 / 店主后台
   依赖：vendor/supabase.js + assets/supabase-config.js
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var STATUS = {
    pending: { label: '待审核', hint: '等待店主审核，请耐心等一下。' },
    accepted: { label: '已接受', hint: '店主已接受，正在处理中。' },
    rejected: { label: '已驳回', hint: '店主驳回了这条需求，可以看上方回复。' },
    completed: { label: '已完成', hint: '委托已完成，感谢老板照顾生意。' }
  };

  var els = {
    loadingView: $('#loadingView'),
    authView: $('#authView'),
    bossView: $('#bossView'),
    ownerView: $('#ownerView'),
    navUser: $('#navUser'),
    logoutBtn: $('#logoutBtn'),
    loginForm: $('#loginForm'),
    authMsg: $('#authMsg'),
    bossWelcome: $('#bossWelcome'),
    ownerWelcome: $('#ownerWelcome'),
    requestForm: $('#requestForm'),
    requestMsg: $('#requestMsg'),
    requestImage: $('#requestImage'),
    requestImageHint: $('#requestImageHint'),
    myList: $('#myList'),
    myCount: $('#myCount'),
    bossMore: $('#bossMore'),
    ownerMore: $('#ownerMore'),
    bossRefresh: $('#bossRefresh'),
    ownerRefresh: $('#ownerRefresh'),
    adminList: $('#adminList'),
    bossAccounts: $('#bossAccounts'),
    bossAccountCount: $('#bossAccountCount'),
    resetModal: $('#resetModal'),
    resetTarget: $('#resetTarget'),
    resetForm: $('#resetForm'),
    resetPassword: $('#resetPassword'),
    resetConfirm: $('#resetConfirm'),
    resetMsg: $('#resetMsg'),
    resetCancel: $('#resetCancel'),
    filters: $('#filters'),
    countAll: $('#countAll'),
    countPending: $('#countPending'),
    countAccepted: $('#countAccepted'),
    countRejected: $('#countRejected'),
    countCompleted: $('#countCompleted'),
    toast: $('#toast')
  };

  var cfg = window.SUPABASE_CONFIG || {};
  var hasConfig = !!(cfg.url && cfg.anonKey && cfg.anonKey.length > 20);
  var sb = null;

  if (!hasConfig || !window.supabase || typeof window.supabase.createClient !== 'function') {
    showConfigError();
    return;
  }

  sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  var PAGE_SIZE = 8;

  var state = {
    user: null,
    profile: null,
    currentUserId: null,
    filter: 'all',
    requests: [],
    reviews: [],
    bossAccounts: [],
    bossVisible: PAGE_SIZE,
    ownerVisible: PAGE_SIZE,
    ownerLoaded: false,
    bossLoaded: false,
    resetUserId: null,
    autoTimer: 0,
    autoBusy: false,
    busy: false
  };

  /* ============================================================
     启动
     ============================================================ */
  sb.auth.onAuthStateChange(function (event, session) {
    window.setTimeout(function () {
      if (event === 'SIGNED_OUT' || !session || !session.user) {
        resetToAuth();
        return;
      }
      applySession(session);
    }, 0);
  });

  (sb.auth.getSession ? sb.auth.getSession() : Promise.resolve({ data: { session: null } }))
    .then(function (result) {
      var session = result && result.data ? result.data.session : null;
      if (session && session.user) applySession(session);
      else showAuth();
    })
    .catch(function (err) {
      showAuth();
      setAuthMessage('连接留言服务失败：' + friendlyError(err), 'error');
    });

  /* ============================================================
     认证
     ============================================================ */
  async function applySession(session) {
    if (!session || !session.user) {
      resetToAuth();
      return;
    }

    if (state.currentUserId === session.user.id) return;
    state.currentUserId = session.user.id;
    state.user = session.user;

    showLoading();

    try {
      var profile = await fetchProfile(session.user.id);
      state.profile = profile;

      var name = displayName(session.user, profile);
      var role = profile && profile.role === 'owner' ? 'owner' : 'boss';

      els.loadingView.hidden = true;
      els.navUser.textContent = role === 'owner' ? '店主' : '老板 · ' + name;
      els.navUser.hidden = false;
      els.logoutBtn.hidden = false;

      if (role === 'owner') {
        els.authView.hidden = true;
        els.bossView.hidden = true;
        els.ownerView.hidden = false;
        els.ownerWelcome.textContent = '你正在以店主身份查看全部老板的需求。';
        await Promise.all([loadOwnerRequests(), loadBossAccounts()]);
      } else {
        els.authView.hidden = true;
        els.ownerView.hidden = true;
        els.bossView.hidden = false;
        document.title = '老板留言 · 代肝催工事务所';
        els.bossWelcome.textContent = '你好，' + name + '。在这里提交需求，并随时查看店主处理到哪一步。';
        await loadBossRequests();
      }

      startAutoRefresh();
    } catch (err) {
      console.error(err);
      toast('加载账号信息失败：' + friendlyError(err), true);
      resetToAuth();
      setAuthMessage('加载账号信息失败，请刷新重试。', 'error');
    }
  }

  async function fetchProfile(userId) {
    var res = await sb
      .from('profiles')
      .select('display_name, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (res.error) {
      // 没有 profile 时不要直接崩，后面可以提示；这里只记录
      console.warn('读取 profile 失败', res.error);
      return null;
    }
    return res.data || null;
  }

  function displayName(user, profile) {
    if (profile && profile.display_name) return profile.display_name;
    var meta = user.user_metadata || {};
    if (meta.display_name) return meta.display_name;
    return (user.email || '老板').split('@')[0];
  }

  function resetToAuth() {
    state.user = null;
    state.profile = null;
    state.currentUserId = null;
    state.requests = [];
    state.reviews = [];
    state.bossAccounts = [];
    state.ownerLoaded = false;
    state.bossLoaded = false;
    state.bossVisible = PAGE_SIZE;
    state.ownerVisible = PAGE_SIZE;
    window.clearInterval(state.autoTimer);
    state.autoTimer = 0;
    document.title = '老板留言 · 代肝催工事务所';
    showAuth();
    els.navUser.hidden = true;
    els.logoutBtn.hidden = true;
    els.myList.innerHTML = '<p class="empty">还没有提交过需求。</p>';
    els.adminList.innerHTML = '<p class="empty">还没有老板留言。</p>';
  }

  function showLoading() {
    els.loadingView.hidden = false;
    els.authView.hidden = true;
    els.bossView.hidden = true;
    els.ownerView.hidden = true;
  }

  function showAuth() {
    els.loadingView.hidden = true;
    els.bossView.hidden = true;
    els.ownerView.hidden = true;
    els.authView.hidden = false;
    setAuthMessage('', '');
  }

  els.loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var email = form.email.value.trim();
    var password = form.password.value;

    if (!email || !password) {
      setAuthMessage('请填写邮箱和密码。', 'error');
      return;
    }

    setFormBusy(form, true);
    setAuthMessage('登录中…', '');

    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      setAuthMessage('登录成功。', 'ok');
      if (res.data && res.data.user) applySession({ user: res.data.user });
    } catch (err) {
      setAuthMessage(friendlyError(err), 'error');
    } finally {
      setFormBusy(form, false);
    }
  });

  els.logoutBtn.addEventListener('click', async function () {
    els.logoutBtn.disabled = true;
    try {
      await sb.auth.signOut();
    } finally {
      els.logoutBtn.disabled = false;
      resetToAuth();
    }
  });

  /* ============================================================
     老板数据
     ============================================================ */
  async function loadBossRequests(silent) {
    if (!state.user) return;
    if (!silent) els.myList.innerHTML = '<p class="empty">加载中…</p>';
    try {
      var results = await Promise.all([
        sb.from('requests').select('*').eq('boss_id', state.user.id).order('created_at', { ascending: false }),
        sb.from('reviews').select('*').eq('boss_id', state.user.id)
      ]);

      if (results[0].error) throw results[0].error;
      var next = results[0].data || [];
      var changed = diffRequests(state.requests, next);
      state.requests = next;
      state.reviews = results[1].error ? [] : (results[1].data || []);
      await attachImages(state.requests);
      state.bossLoaded = true;
      state.bossVisible = Math.max(PAGE_SIZE, state.bossVisible);
      renderBossRequests();

      if (silent && changed) toast('你的需求状态有更新，已自动刷新。');
    } catch (err) {
      console.error(err);
      if (!silent) els.myList.innerHTML = '<p class="empty">加载失败：' + escapeHtml(friendlyError(err)) + '</p>';
    }
  }

  function renderBossRequests() {
    var all = state.requests;
    var list = all.slice(0, state.bossVisible);
    els.myCount.textContent = all.length + ' 条';
    els.bossMore.hidden = all.length <= list.length;

    if (!all.length) {
      els.myList.innerHTML = '<p class="empty">还没有提交过需求。填写左侧表单，店主就能看到。</p>';
      return;
    }

    els.myList.innerHTML = list.map(function (item) {
      var meta = STATUS[item.status] || STATUS.pending;
      var note = item.owner_note
        ? '<div class="req-note"><b>店主回复</b>' + escapeHtml(item.owner_note) + '</div>'
        : '';
      var review = item.status === 'completed' ? bossReviewBlock(item) : '';
      return (
        '<article class="req-card" data-status="' + escapeHtml(item.status) + '">' +
          '<div class="req-top">' +
            '<div>' +
              '<div class="req-game">' + escapeHtml(item.game_name) +
                ' <span class="req-nick">@' + escapeHtml(item.game_nickname) + '</span></div>' +
              '<div class="req-sub">提交于 ' + escapeHtml(formatTime(item.created_at)) + '</div>' +
            '</div>' +
            '<span class="badge badge-' + escapeHtml(item.status) + '">' + escapeHtml(meta.label) + '</span>' +
          '</div>' +
          '<div class="req-fields">' +
            reqField('游戏账号', item.game_account) +
            reqField('游戏昵称', item.game_nickname) +
            reqField('代肝需求', item.demand) +
            reqField('联系方式', item.contact) +
            reqField('截止时间', item.deadline) +
            (item.note ? reqField('备注', item.note, true) : '') +
          '</div>' +
          note +
          imageBlock(item) +
          review +
          '<div class="req-footer"><span>' + escapeHtml(meta.hint) + '</span></div>' +
        '</article>'
      );
    }).join('');
  }

  function bossReviewBlock(item) {
    var review = reviewFor(item.id);
    if (review) {
      return (
        '<div class="review-view">' +
          '<b>我的评价</b>' +
          '<span class="review-score">' + stars(review.rating) + '</span>' +
          (review.content ? '<p>' + escapeHtml(review.content) + '</p>' : '') +
        '</div>'
      );
    }

    return (
      '<div class="review-box" data-review-request="' + escapeHtml(String(item.id)) + '" data-rating="0">' +
        '<div class="review-title">给这次代肝打个分</div>' +
        '<div class="review-stars">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button type="button" data-star="' + n + '" aria-label="' + n + ' 星">★</button>';
          }).join('') +
        '</div>' +
        '<textarea class="review-text" maxlength="300" placeholder="说说体验（可选）"></textarea>' +
        '<button class="btn btn-sm btn-ghost" type="button" data-review-submit>提交评价</button>' +
      '</div>'
    );
  }

  /* ============================================================
     店主数据
     ============================================================ */
  async function loadOwnerRequests(silent) {
    if (!silent) els.adminList.innerHTML = '<p class="empty">加载中…</p>';
    try {
      var results = await Promise.all([
        sb.from('requests').select('*').order('created_at', { ascending: false }),
        sb.from('reviews').select('*')
      ]);

      if (results[0].error) throw results[0].error;
      var requests = results[0].data || [];
      state.reviews = results[1].error ? [] : (results[1].data || []);
      var previousIds = {};
      state.requests.forEach(function (item) { previousIds[item.id] = true; });
      var newCount = 0;
      if (state.ownerLoaded) {
        requests.forEach(function (item) {
          if (!previousIds[item.id]) newCount += 1;
        });
      }

      var ids = Array.from(new Set(requests.map(function (item) { return item.boss_id; })));
      var profileMap = {};

      if (ids.length) {
        var profRes = await sb
          .from('profiles')
          .select('id, display_name, email')
          .in('id', ids);

        if (!profRes.error) {
          (profRes.data || []).forEach(function (profile) {
            profileMap[profile.id] = profile;
          });
        }
      }

      state.requests = requests.map(function (item) {
        item.boss = profileMap[item.boss_id] || null;
        return item;
      });
      await attachImages(state.requests);
      state.ownerLoaded = true;
      state.ownerVisible = Math.max(PAGE_SIZE, state.ownerVisible);

      updateFilterCounts();
      renderOwnerRequests();
      updateOwnerTitle();

      if (silent && newCount > 0) {
        toast('收到 ' + newCount + ' 条新老板留言，已自动刷新。');
      }
    } catch (err) {
      console.error(err);
      if (!silent) els.adminList.innerHTML = '<p class="empty">加载失败：' + escapeHtml(friendlyError(err)) + '</p>';
    }
  }

  async function loadBossAccounts() {
    els.bossAccounts.innerHTML = '<p class="empty">加载中…</p>';
    try {
      var res = await sb
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('role', 'boss')
        .order('created_at', { ascending: false });

      if (res.error) throw res.error;
      state.bossAccounts = res.data || [];
      renderBossAccounts();
    } catch (err) {
      console.error(err);
      els.bossAccounts.innerHTML = '<p class="empty">加载失败：' + escapeHtml(friendlyError(err)) + '</p>';
    }
  }

  function renderBossAccounts() {
    var accounts = state.bossAccounts;
    els.bossAccountCount.textContent = accounts.length + ' 个';

    if (!accounts.length) {
      els.bossAccounts.innerHTML = '<p class="empty">还没有老板账号。去 Supabase → Authentication → Users 创建后刷新这里。</p>';
      return;
    }

    els.bossAccounts.innerHTML = accounts.map(function (account) {
      var name = account.display_name || account.email || '未命名老板';
      return (
        '<div class="account-row">' +
          '<div class="account-main">' +
            '<div class="account-name">' + escapeHtml(name) + '</div>' +
            '<div class="account-email">' + escapeHtml(account.email || '') + '</div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-reset="' + escapeHtml(account.id) + '">重置密码</button>' +
        '</div>'
      );
    }).join('');
  }

  function openResetModal(account) {
    state.resetUserId = account.id;
    var name = account.display_name || account.email || '老板';
    els.resetTarget.textContent = '给「' + name + '」(' + (account.email || '') + ') 设置新密码，重置后把新密码发给他。';
    els.resetForm.reset();
    setResetMessage('', '');
    els.resetModal.hidden = false;
    window.setTimeout(function () { els.resetPassword.focus(); }, 30);
  }

  function closeResetModal() {
    els.resetModal.hidden = true;
    state.resetUserId = null;
  }

  function setResetMessage(text, type) {
    els.resetMsg.textContent = text || '';
    els.resetMsg.className = 'form-msg' + (type ? ' is-' + type : '');
  }

  async function functionErrorMessage(error) {
    var message = (error && (error.message || error.error_description)) || '重置失败';
    try {
      if (error && error.context) {
        var body = await error.context.clone().json();
        if (body && body.error) message = body.error;
      }
    } catch (e) {
      try {
        var text = await error.context.clone().text();
        if (text) message = text.slice(0, 200);
      } catch (e2) {}
    }
    if (/Failed to send a request to the Edge Function|Function not found|404/i.test(message)) {
      return '重置服务还没部署，请先在 Supabase 部署 admin-reset-password Edge Function。';
    }
    return message;
  }

  els.bossAccounts.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-reset]');
    if (!button) return;
    var account = state.bossAccounts.find(function (item) {
      return item.id === button.getAttribute('data-reset');
    });
    if (account) openResetModal(account);
  });

  els.resetCancel.addEventListener('click', closeResetModal);

  els.resetModal.addEventListener('click', function (event) {
    if (event.target && event.target.getAttribute('data-close') === '1') closeResetModal();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !els.resetModal.hidden) closeResetModal();
  });

  els.resetForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.resetUserId) return;

    var password = els.resetPassword.value;
    var confirm = els.resetConfirm.value;
    if (password.length < 6) {
      setResetMessage('新密码至少 6 位。', 'error');
      return;
    }
    if (password !== confirm) {
      setResetMessage('两次输入的新密码不一致。', 'error');
      return;
    }

    var submit = els.resetForm.querySelector('button[type="submit"]');
    var inputs = [els.resetPassword, els.resetConfirm];
    submit.disabled = true;
    inputs.forEach(function (input) { input.disabled = true; });
    setResetMessage('重置中…', '');

    try {
      var res = await sb.functions.invoke('admin-reset-password', {
        body: { userId: state.resetUserId, newPassword: password }
      });

      if (res.error) throw res.error;
      if (res.data && res.data.error) throw new Error(res.data.error);

      var account = state.bossAccounts.find(function (item) { return item.id === state.resetUserId; });
      var who = account ? (account.display_name || account.email) : '老板';
      closeResetModal();
      toast('已重置「' + who + '」的密码，记得把新密码发给他。');
    } catch (err) {
      console.error(err);
      setResetMessage(await functionErrorMessage(err), 'error');
    } finally {
      submit.disabled = false;
      inputs.forEach(function (input) { input.disabled = false; });
    }
  });

  function renderOwnerRequests() {
    var drafts = {};
    $$('#adminList .req-card[data-id]').forEach(function (card) {
      var input = card.querySelector('[data-note]');
      if (input) drafts[card.getAttribute('data-id')] = input.value;
    });

    var filtered = state.requests.filter(function (item) {
      return state.filter === 'all' || item.status === state.filter;
    });
    var list = filtered.slice(0, state.ownerVisible);

    updateFilterCounts();
    els.ownerMore.hidden = filtered.length <= list.length;

    if (!list.length) {
      els.adminList.innerHTML = '<p class="empty">这个分类下还没有留言。</p>';
      return;
    }

    els.adminList.innerHTML = list.map(function (item) {
      var meta = STATUS[item.status] || STATUS.pending;
      var boss = item.boss || {};
      var canAct = item.status === 'pending' || item.status === 'accepted';
      var actions = '';
      var review = reviewFor(item.id);
      var reviewHtml = review
        ? '<div class="review-view"><b>老板评价</b>' +
            '<span class="review-score">' + stars(review.rating) + '</span>' +
            (review.content ? '<p>' + escapeHtml(review.content) + '</p>' : '') +
          '</div>'
        : '';

      if (canAct) {
        var buttons = '';
        if (item.status === 'pending') {
          buttons += '<button class="btn btn-sm btn-ok" type="button" data-action="accept">接受</button>';
          buttons += '<button class="btn btn-sm btn-danger" type="button" data-action="reject">驳回</button>';
        } else {
          buttons += '<button class="btn btn-sm btn-blue" type="button" data-action="complete">标记完成</button>';
          buttons += '<button class="btn btn-sm btn-danger" type="button" data-action="reject">驳回</button>';
        }

        actions =
          '<div class="req-actions">' +
            '<textarea class="req-note-input" data-note placeholder="给老板的回复：接受说明 / 驳回原因 / 完成说明">' +
              escapeHtml(item.owner_note || '') +
            '</textarea>' +
            '<div class="req-btns">' + buttons + '</div>' +
          '</div>';
      }

      var note = item.owner_note && !canAct
        ? '<div class="req-note"><b>店主回复</b>' + escapeHtml(item.owner_note) + '</div>'
        : '';

      return (
        '<article class="req-card" data-status="' + escapeHtml(item.status) + '" data-id="' + escapeHtml(String(item.id)) + '">' +
          '<div class="req-top">' +
            '<div>' +
              '<div class="req-game">' + escapeHtml(item.game_name) +
                ' <span class="req-nick">@' + escapeHtml(item.game_nickname) + '</span></div>' +
              '<div class="req-sub">老板：<b>' + escapeHtml(boss.display_name || '未知') + '</b> · ' +
                escapeHtml(boss.email || '') + '</div>' +
            '</div>' +
            '<span class="badge badge-' + escapeHtml(item.status) + '">' + escapeHtml(meta.label) + '</span>' +
          '</div>' +
          '<div class="req-fields">' +
            reqField('游戏账号', item.game_account) +
            reqField('代肝需求', item.demand) +
            reqField('联系方式', item.contact) +
            reqField('截止时间', item.deadline) +
            (item.note ? reqField('备注', item.note, true) : '') +
          '</div>' +
          note +
          imageBlock(item) +
          actions +
          reviewHtml +
          '<div class="req-footer">' +
            '<span>提交 ' + escapeHtml(formatTime(item.created_at)) + '</span>' +
            '<span>更新 ' + escapeHtml(formatTime(item.updated_at)) + '</span>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    Object.keys(drafts).forEach(function (id) {
      var card = els.adminList.querySelector('.req-card[data-id="' + id + '"]');
      var input = card ? card.querySelector('[data-note]') : null;
      if (input && drafts[id]) input.value = drafts[id];
    });
  }

  function updateFilterCounts() {
    var counts = { all: state.requests.length, pending: 0, accepted: 0, rejected: 0, completed: 0 };
    state.requests.forEach(function (item) {
      if (counts[item.status] !== undefined) counts[item.status] += 1;
    });
    els.countAll.textContent = counts.all;
    els.countPending.textContent = counts.pending;
    els.countAccepted.textContent = counts.accepted;
    els.countRejected.textContent = counts.rejected;
    els.countCompleted.textContent = counts.completed;
  }

  els.filters.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-filter]');
    if (!button) return;
    state.filter = button.getAttribute('data-filter');
    state.ownerVisible = PAGE_SIZE;
    $$('.filter', els.filters).forEach(function (item) {
      item.classList.toggle('is-active', item === button);
    });
    renderOwnerRequests();
  });

  els.bossMore.addEventListener('click', function () {
    state.bossVisible += PAGE_SIZE;
    renderBossRequests();
  });

  els.ownerMore.addEventListener('click', function () {
    state.ownerVisible += PAGE_SIZE;
    renderOwnerRequests();
  });

  els.myList.addEventListener('click', async function (event) {
    var star = event.target.closest('button[data-star]');
    if (star) {
      var box = star.closest('.review-box');
      var rating = Number(star.getAttribute('data-star'));
      box.setAttribute('data-rating', String(rating));
      $$('.review-stars button', box).forEach(function (button) {
        button.classList.toggle('is-on', Number(button.getAttribute('data-star')) <= rating);
      });
      return;
    }

    var submit = event.target.closest('button[data-review-submit]');
    if (!submit) return;

    var reviewBox = submit.closest('.review-box');
    if (!reviewBox) return;
    var requestId = Number(reviewBox.getAttribute('data-review-request'));
    var ratingValue = Number(reviewBox.getAttribute('data-rating'));
    var text = reviewBox.querySelector('.review-text').value.trim();

    if (!ratingValue) {
      toast('先点星星打个分吧。', true);
      return;
    }

    submit.disabled = true;
    try {
      var res = await sb.from('reviews').insert({
        request_id: requestId,
        boss_id: state.user.id,
        rating: ratingValue,
        content: text
      });
      if (res.error) throw res.error;
      toast('评价已提交，谢谢老板！');
      await loadBossRequests(true);
    } catch (err) {
      console.error(err);
      toast('评价失败：' + friendlyError(err), true);
      submit.disabled = false;
    }
  });

  function startAutoRefresh() {
    window.clearInterval(state.autoTimer);
    state.autoTimer = window.setInterval(function () {
      if (!state.user || document.hidden || state.autoBusy) return;

      if (!els.ownerView.hidden) {
        if (hasFocusInside(els.ownerView)) return;
        state.autoBusy = true;
        loadOwnerRequests(true).finally(function () { state.autoBusy = false; });
      } else if (!els.bossView.hidden) {
        if (hasFocusInside(els.myList)) return;
        state.autoBusy = true;
        loadBossRequests(true).finally(function () { state.autoBusy = false; });
      }
    }, 15000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !state.user || state.autoBusy) return;
    if (!els.ownerView.hidden && !hasFocusInside(els.ownerView)) {
      loadOwnerRequests(true);
    } else if (!els.bossView.hidden && !hasFocusInside(els.myList)) {
      loadBossRequests(true);
    }
  });

  els.adminList.addEventListener('click', async function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var card = button.closest('.req-card');
    var requestId = card ? card.getAttribute('data-id') : null;
    if (!requestId) return;

    var action = button.getAttribute('data-action');
    var noteInput = card.querySelector('[data-note]');
    var note = noteInput ? noteInput.value.trim() : '';
    var nextStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'completed';
    var labels = { accepted: '接受', rejected: '驳回', completed: '标记完成' };
    var meta = STATUS[nextStatus] || STATUS.pending;

    if (action === 'reject' && !note) {
      toast('驳回时请写一下原因，老板能看到。', true);
      if (noteInput) noteInput.focus();
      return;
    }

    if (action === 'reject' && !window.confirm('确定驳回这条需求吗？驳回原因会发给老板。')) return;
    if (action === 'complete' && !window.confirm('确定把这条需求标记为「已完成」吗？')) return;

    setCardBusy(card, true);

    try {
      var payload = {
        status: nextStatus,
        owner_note: note
      };

      if (nextStatus === 'accepted' || nextStatus === 'rejected') {
        payload.decided_at = new Date().toISOString();
      }
      if (nextStatus === 'completed') {
        payload.completed_at = new Date().toISOString();
      }

      var res = await sb
        .from('requests')
        .update(payload)
        .eq('id', requestId);

      if (res.error) throw res.error;

      toast('已' + labels[nextStatus] + '，老板刷新页面就能看到。');
      await loadOwnerRequests();
    } catch (err) {
      console.error(err);
      toast('操作失败：' + friendlyError(err), true);
      setCardBusy(card, false);
    }
  });

  /* ============================================================
     老板提交需求
     ============================================================ */
  els.requestForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.user) return;

    var form = event.currentTarget;
    var gameName = form.game_name.value.trim();
    var gameAccount = form.game_account.value.trim();
    var gameNickname = form.game_nickname.value.trim();
    var demand = form.demand.value.trim();
    var contact = form.contact.value.trim();
    var deadline = form.deadline.value;
    var note = form.note.value.trim();
    var imageFile = els.requestImage && els.requestImage.files ? els.requestImage.files[0] : null;

    if (!gameName || !gameAccount || !gameNickname) {
      setRequestMessage('游戏名称、游戏账号、游戏昵称都是必填的。', 'error');
      return;
    }

    setFormBusy(form, true);
    setRequestMessage('提交中…', '');
    var imagePath = '';

    try {
      if (imageFile) {
        setRequestMessage('截图上传中…', '');
        imagePath = await uploadScreenshot(imageFile);
        setRequestMessage('提交中…', '');
      }

      var res = await sb.from('requests').insert({
        boss_id: state.user.id,
        game_name: gameName,
        game_account: gameAccount,
        game_nickname: gameNickname,
        demand: demand,
        contact: contact,
        deadline: deadline || null,
        note: note,
        image_path: imagePath
      });

      if (res.error) throw res.error;

      setRequestMessage('提交成功，等店主审核。', 'ok');
      form.reset();
      setImageHint('');
      toast(imageFile ? '需求已提交（含截图），等店主审核。' : '需求已提交，等店主审核。');
      await loadBossRequests(false);
    } catch (err) {
      console.error(err);
      if (imagePath) {
        try { await sb.storage.from('request-images').remove([imagePath]); } catch (e) {}
      }
      setRequestMessage('提交失败：' + friendlyError(err), 'error');
    } finally {
      setFormBusy(form, false);
    }
  });

  function setImageHint(text) {
    if (!els.requestImageHint) return;
    els.requestImageHint.textContent = text || '支持 JPG / PNG / WebP，自动压缩，只有店主能看到。';
  }

  els.requestImage.addEventListener('change', function () {
    var file = els.requestImage.files && els.requestImage.files[0];
    if (!file) {
      setImageHint('');
      return;
    }
    setImageHint(file.name + ' · ' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
  });

  els.bossRefresh.addEventListener('click', async function () {
    els.bossRefresh.disabled = true;
    await loadBossRequests();
    els.bossRefresh.disabled = false;
    toast('已刷新');
  });

  els.ownerRefresh.addEventListener('click', async function () {
    els.ownerRefresh.disabled = true;
    await Promise.all([loadOwnerRequests(), loadBossAccounts()]);
    els.ownerRefresh.disabled = false;
    toast('已刷新');
  });

  /* ============================================================
     工具函数
     ============================================================ */
  function reviewFor(requestId) {
    return state.reviews.find(function (item) {
      return Number(item.request_id) === Number(requestId);
    }) || null;
  }

  function stars(rating) {
    var value = Math.max(0, Math.min(5, Number(rating) || 0));
    return '★★★★★'.slice(0, value) + '☆☆☆☆☆'.slice(0, 5 - value);
  }

  function imageBlock(item) {
    if (!item.imageUrl) return '';
    var url = escapeHtml(item.imageUrl);
    return (
      '<div class="req-image">' +
        '<a href="' + url + '" target="_blank" rel="noreferrer">' +
          '<img src="' + url + '" alt="老板上传的需求截图" loading="lazy">' +
        '</a>' +
      '</div>'
    );
  }

  async function attachImages(list) {
    if (!list || !list.length) return;
    await Promise.all(list.map(async function (item) {
      if (!item.image_path) {
        item.imageUrl = '';
        return;
      }
      try {
        var res = await sb.storage
          .from('request-images')
          .createSignedUrl(item.image_path, 3600);
        item.imageUrl = res.data && res.data.signedUrl ? res.data.signedUrl : '';
      } catch (err) {
        item.imageUrl = '';
      }
    }));
  }

  function diffRequests(previous, next) {
    if (previous.length !== next.length) return true;
    var map = {};
    previous.forEach(function (item) { map[String(item.id)] = item; });
    return next.some(function (item) {
      var old = map[String(item.id)];
      return !old || old.status !== item.status || old.owner_note !== item.owner_note || old.updated_at !== item.updated_at;
    });
  }

  function updateOwnerTitle() {
    var pending = state.requests.filter(function (item) { return item.status === 'pending'; }).length;
    document.title = pending > 0
      ? '(' + pending + ') 店主后台 · 代肝催工事务所'
      : '店主后台 · 代肝催工事务所';
  }

  function hasFocusInside(element) {
    if (!element || !document.activeElement) return false;
    if (!element.contains(document.activeElement)) return false;
    return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement.tagName);
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        try {
          var max = 1280;
          var scale = Math.min(1, max / Math.max(image.width, image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#1a1028';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('图片压缩失败')); return; }
            resolve(blob);
          }, 'image/jpeg', 0.82);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片打不开，换一张试试'));
      };
      image.src = url;
    });
  }

  async function uploadScreenshot(file) {
    if (!file) return '';
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('截图不能超过 10MB');
    }
    var blob = await compressImage(file);
    var random = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    var path = state.user.id + '/' + random + '.jpg';
    var res = await sb.storage.from('request-images').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false
    });
    if (res.error) throw res.error;
    return path;
  }

  function reqField(label, value, wide) {
    var text = value === null || value === undefined || value === '' ? '未填写' : String(value);
    var empty = text === '未填写' ? ' is-empty' : '';
    return (
      '<div class="req-field' + (wide ? ' wide' : '') + '">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<b class="' + empty + '">' + escapeHtml(text) + '</b>' +
      '</div>'
    );
  }

  function formatTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function friendlyError(error) {
    var message = (error && (error.message || error.error_description)) || String(error || '操作失败');
    if (/Invalid login credentials/i.test(message)) return '邮箱或密码不正确。';
    if (/Email not confirmed/i.test(message)) return '邮箱还没确认，请查收确认邮件后再登录。';
    if (/User already registered/i.test(message)) return '这个邮箱已经注册过了，请直接登录。';
    if (/Password should be at least/i.test(message)) return '密码太短，至少 6 位。';
    if (/duplicate key value/i.test(message)) return '数据重复，请刷新后重试。';
    if (/row-level security|permission denied|42501/i.test(message)) return '没有权限执行这个操作。';
    if (/Failed to fetch|NetworkError/i.test(message)) return '网络连接失败，请检查网络后重试。';
    return message;
  }

  function setAuthMessage(text, type) {
    els.authMsg.textContent = text || '';
    els.authMsg.className = 'form-msg' + (type ? ' is-' + type : '');
  }

  function setRequestMessage(text, type) {
    els.requestMsg.textContent = text || '';
    els.requestMsg.className = 'form-msg' + (type ? ' is-' + type : '');
  }

  function setFormBusy(form, busy) {
    $$('button, input, textarea', form).forEach(function (element) {
      element.disabled = busy;
    });
    var submit = form.querySelector('button[type="submit"]');
    if (submit) {
      if (!submit.dataset.label) submit.dataset.label = submit.textContent;
      submit.textContent = busy ? '请稍候…' : submit.dataset.label;
    }
  }

  function setCardBusy(card, busy) {
    $$('button, textarea', card).forEach(function (element) {
      element.disabled = busy;
    });
  }

  var toastTimer = 0;
  function toast(text, isError) {
    els.toast.textContent = text;
    els.toast.className = 'toast is-show' + (isError ? ' is-error' : '');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      els.toast.className = 'toast';
    }, 2600);
  }

  function showConfigError() {
    els.loadingView.hidden = false;
    els.loadingView.innerHTML =
      '<h2>留言功能还没配置</h2>' +
      '<p>缺少 Supabase 配置，请联系店主完成初始化。</p>';
  }
})();
