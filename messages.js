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
    publicNameInput: $('#publicNameInput'),
    publicNameSave: $('#publicNameSave'),
    publicNameMsg: $('#publicNameMsg'),
    wallAdminList: $('#wallAdminList'),
    wallAdminCount: $('#wallAdminCount'),
    adminList: $('#adminList'),
    cleanupBar: $('#cleanupBar'),
    statCards: $('#statCards'),
    urgeChart: $('#urgeChart'),
    gameStats: $('#gameStats'),
    bossUrgeList: $('#bossUrgeList'),
    bossUrgeHint: $('#bossUrgeHint'),
    statsUpdated: $('#statsUpdated'),
    exportCsv: $('#exportCsv'),
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
  var MAX_RESULT_IMAGES = 3;
  var URGE_MILESTONE = 30;

  var state = {
    user: null,
    profile: null,
    currentUserId: null,
    filter: 'all',
    requests: [],
    reviews: [],
    requestImages: [],
    imagesAvailable: true,
    urges: [],
    urgeStats: null,
    bossUrgeStats: [],
    bossUrgeStatsReady: true,
    wallPosts: [],
    wallPostsReady: true,
    bossAccounts: [],
    bossVisible: PAGE_SIZE,
    ownerVisible: PAGE_SIZE,
    ownerLoaded: false,
    bossLoaded: false,
    resetUserId: null,
    autoTimer: 0,
    autoBusy: false,
    manualBusy: false,
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
        await loadOwnerRequests();
        await Promise.all([loadBossAccounts(), loadOwnerStats(), loadWallAdmin()]);
      } else {
        els.authView.hidden = true;
        els.ownerView.hidden = true;
        els.bossView.hidden = false;
        document.title = '老板留言 · 代肝催工事务所';
        els.bossWelcome.textContent = '你好，' + name + '。在这里提交需求，并随时查看店主处理到哪一步。';
        if (els.publicNameInput) {
          els.publicNameInput.value = (state.profile && state.profile.public_name) || '';
        }
        setPublicNameMessage('', '');
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
      .select('display_name, email, role, public_name')
      .eq('id', userId)
      .maybeSingle();

    // 迁移 008 还没跑时，public_name 字段不存在；退回旧字段，保证页面能打开
    if (res.error && /public_name/i.test(res.error.message || '')) {
      res = await sb
        .from('profiles')
        .select('display_name, email, role')
        .eq('id', userId)
        .maybeSingle();
      if (res.data) res.data.public_name = '';
    }

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
    state.requestImages = [];
    state.imagesAvailable = true;
    state.urges = [];
    state.urgeStats = null;
    state.bossUrgeStats = [];
    state.bossUrgeStatsReady = true;
    state.wallPosts = [];
    state.wallPostsReady = true;
    state.bossAccounts = [];
    state.ownerLoaded = false;
    state.bossLoaded = false;
    state.bossVisible = PAGE_SIZE;
    state.ownerVisible = PAGE_SIZE;
    window.clearInterval(state.autoTimer);
    state.autoTimer = 0;
    state.autoBusy = false;
    state.manualBusy = false;
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
      await Promise.all([
        attachImages(state.requests),
        loadRequestImages(state.requests)
      ]);
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
          shotsBlock(item, false) +
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
      await Promise.all([
        attachImages(state.requests),
        loadRequestImages(state.requests)
      ]);
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

  async function loadOwnerStats() {
    try {
      var results = await Promise.all([
        sb.rpc('owner_urge_stats'),
        sb.rpc('owner_boss_urge_stats')
      ]);

      if (results[0].error) {
        console.warn('读取催更统计失败', results[0].error);
        state.urgeStats = null;
      } else {
        state.urgeStats = results[0].data || null;
      }

      if (results[1].error) {
        console.warn('读取老板催更明细失败', results[1].error);
        state.bossUrgeStats = [];
        state.bossUrgeStatsReady = false;
      } else {
        state.bossUrgeStats = Array.isArray(results[1].data) ? results[1].data : [];
        state.bossUrgeStatsReady = true;
      }
    } catch (err) {
      console.warn('读取催更统计失败', err);
      state.urgeStats = null;
      state.bossUrgeStats = [];
      state.bossUrgeStatsReady = false;
    }

    renderOwnerStats();
    renderBossUrgeStats();
  }

  function localDayKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function renderOwnerStats() {
    if (!els.statCards || !els.urgeChart || !els.gameStats) return;

    var now = new Date();
    var stats = state.urgeStats || {};
    var dayCounts = {};

    (stats.days || []).forEach(function (item) {
      if (item && item.day) dayCounts[item.day] = Number(item.count) || 0;
    });

    var totalUrges = Number(stats.total) || 0;
    var uniqueCount = Number(stats.unique) || 0;
    var today = Number(stats.today) || 0;
    var pending = state.requests.filter(function (item) { return item.status === 'pending'; }).length;
    var completed = state.requests.filter(function (item) { return item.status === 'completed'; }).length;
    var ratings = state.reviews.map(function (item) { return Number(item.rating); }).filter(function (n) { return n > 0; });
    var avgRating = ratings.length
      ? (ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length)
      : 0;

    var cards = [
      { k: '总催更', v: totalUrges, s: '全站点击次数' },
      { k: '独立访客', v: uniqueCount, s: '匿名统计' },
      { k: '今日催更', v: today, s: '今天 00:00 起' },
      { k: '需求总数', v: state.requests.length, s: '待审核 ' + pending + ' 条' },
      { k: '已完成', v: completed, s: '累计完成委托' },
      { k: '平均评分', v: ratings.length ? avgRating.toFixed(1) : '—', s: ratings.length + ' 条评价' }
    ];

    els.statCards.innerHTML = cards.map(function (card) {
      return (
        '<div class="stat-card">' +
          '<div class="stat-k">' + escapeHtml(card.k) + '</div>' +
          '<div class="stat-v">' + escapeHtml(card.v) + '</div>' +
          '<div class="stat-s">' + escapeHtml(card.s) + '</div>' +
        '</div>'
      );
    }).join('');

    // 最近 7 天
    var days = [];
    for (var i = 6; i >= 0; i -= 1) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        key: localDayKey(d),
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        count: dayCounts[localDayKey(d)] || 0
      });
    }
    var max = Math.max.apply(null, days.map(function (d) { return d.count; }).concat([1]));

    els.urgeChart.innerHTML = days.map(function (day) {
      var height = Math.max(2, Math.round((day.count / max) * 100));
      return (
        '<div class="chart-col" title="' + escapeHtml(day.key + '：' + day.count + ' 次') + '">' +
          '<div class="chart-bar" style="height:' + height + '%"></div>' +
          '<div class="chart-label">' + escapeHtml(day.label) + '</div>' +
        '</div>'
      );
    }).join('');

    // 游戏分布
    var gameCounts = {};
    state.requests.forEach(function (item) {
      var name = item.game_name || '未填写';
      gameCounts[name] = (gameCounts[name] || 0) + 1;
    });
    var games = Object.keys(gameCounts)
      .map(function (name) { return { name: name, count: gameCounts[name] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 6);

    els.gameStats.innerHTML = games.length
      ? games.map(function (game) {
          return '<div class="game-row"><span>' + escapeHtml(game.name) + '</span><span>' + game.count + ' 单</span></div>';
        }).join('')
      : '<p class="empty">还没有需求数据。</p>';

    if (els.statsUpdated) {
      els.statsUpdated.textContent = '更新于 ' + now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
  }

  function renderBossUrgeStats() {
    if (!els.bossUrgeList) return;

    if (!state.bossUrgeStatsReady) {
      els.bossUrgeList.innerHTML = '<p class="empty">暂时读不到老板明细，请确认 migration-007 已运行。</p>';
      return;
    }

    var rows = (state.bossUrgeStats || []).slice().sort(function (a, b) {
      return (Number(b.total) || 0) - (Number(a.total) || 0);
    });

    if (!rows.length) {
      els.bossUrgeList.innerHTML = '<p class="empty">还没有老板账号，或还没有人催过。</p>';
      return;
    }

    els.bossUrgeList.innerHTML = rows.map(function (row) {
      var total = Number(row.total) || 0;
      var notified = !!row.notified_at;
      var stateText;
      var stateClass = '';

      if (notified) {
        stateText = '已发提醒';
        stateClass = ' is-sent';
      } else if (total >= URGE_MILESTONE) {
        stateText = '待发提醒';
        stateClass = ' is-wait';
      } else if (total === 0) {
        stateText = '还没催过';
        stateClass = ' is-zero';
      } else {
        stateText = '还差 ' + (URGE_MILESTONE - total) + ' 次';
      }

      var name = row.display_name || row.email || '未命名老板';
      var email = row.email || '';
      var last = row.last_at ? '最后催更 ' + formatTime(row.last_at) : '还没有催更记录';
      var button = (!notified && total >= URGE_MILESTONE)
        ? '<button class="btn btn-sm btn-ghost" type="button" data-notify-boss="' +
            escapeHtml(String(row.boss_id)) + '">发送提醒邮件</button>'
        : '';

      return (
        '<div class="boss-urge-row">' +
          '<div class="boss-urge-main">' +
            '<div class="boss-urge-name">' + escapeHtml(name) + '</div>' +
            (email ? '<div class="boss-urge-mail">' + escapeHtml(email) + '</div>' : '') +
            '<div class="boss-urge-last">' + escapeHtml(last) + '</div>' +
          '</div>' +
          '<div class="boss-urge-meta">' +
            '<span class="boss-urge-count">' + total + '<small>次</small></span>' +
            '<span class="boss-urge-state' + stateClass + '"' +
              (notified ? ' title="' + escapeHtml(formatTime(row.notified_at)) + '"' : '') + '>' +
              escapeHtml(stateText) +
            '</span>' +
            button +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function loadWallAdmin() {
    if (!els.wallAdminList) return;

    els.wallAdminList.innerHTML = '<p class="empty">加载中…</p>';

    try {
      var res = await sb.rpc('owner_wall_posts', { p_limit: 40 });
      if (res.error) throw res.error;
      state.wallPosts = Array.isArray(res.data) ? res.data : [];
      state.wallPostsReady = true;
    } catch (err) {
      console.warn('读取首页留言墙失败', err);
      state.wallPosts = [];
      state.wallPostsReady = false;
    }

    renderWallAdmin();
  }

  function renderWallAdmin() {
    if (!els.wallAdminList) return;

    if (els.wallAdminCount) {
      els.wallAdminCount.textContent = (state.wallPosts.length || 0) + ' 条';
    }

    if (!state.wallPostsReady) {
      els.wallAdminList.innerHTML = '<p class="empty">暂时读不到留言墙，请确认 migration-008 已运行。</p>';
      return;
    }

    if (!state.wallPosts.length) {
      els.wallAdminList.innerHTML = '<p class="empty">还没有老板留言。</p>';
      return;
    }

    els.wallAdminList.innerHTML = state.wallPosts.map(function (post) {
      var rating = Number(post.rating) || 0;
      var starsHtml = rating ? '<span class="wall-admin-stars">' + stars(rating) + '</span>' : '';

      return (
        '<div class="wall-admin-row" data-wall-id="' + escapeHtml(String(post.id)) + '">' +
          '<div class="wall-admin-main">' +
            '<div class="wall-admin-top">' +
              '<span class="wall-admin-name">' + escapeHtml(post.display_name || '老板') + '</span>' +
              starsHtml +
            '</div>' +
            '<p class="wall-admin-text">' + escapeHtml(post.content) + '</p>' +
            '<div class="wall-admin-meta">' +
              escapeHtml(post.boss_email || '') + ' · ' + escapeHtml(formatTime(post.created_at)) +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-danger" type="button" data-delete-wall>删除</button>' +
        '</div>'
      );
    }).join('');
  }

  if (els.wallAdminList) {
    els.wallAdminList.addEventListener('click', async function (event) {
      var button = event.target.closest('button[data-delete-wall]');
      if (!button) return;

      var row = button.closest('[data-wall-id]');
      var id = row ? row.getAttribute('data-wall-id') : null;
      if (!id) return;

      if (!window.confirm('删除这条首页留言吗？删除后首页立刻消失，无法恢复。')) return;

      button.disabled = true;

      try {
        var res = await sb.rpc('owner_delete_wall_post', { p_id: Number(id) });
        if (res.error) throw res.error;
        if (res.data === false) {
          toast('这条留言已经不存在了。');
        } else {
          toast('已删除首页留言。');
        }
        await loadWallAdmin();
      } catch (err) {
        console.error(err);
        toast('删除失败：' + wallErrorText(err), true);
        button.disabled = false;
      }
    });
  }

  function csvCell(value) {
    return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportRequestsCsv() {
    if (!state.requests.length) {
      toast('还没有需求可以导出。', true);
      return;
    }

    var header = [
      '提交时间', '老板', '老板邮箱', '游戏', '游戏账号', '游戏昵称',
      '代肝需求', '联系方式', '截止时间', '备注', '状态',
      '店主回复', '评分', '评价', '更新时间'
    ];

    var rows = state.requests.map(function (item) {
      var boss = item.boss || {};
      var review = reviewFor(item.id) || {};
      return [
        formatTime(item.created_at),
        boss.display_name || '',
        boss.email || '',
        item.game_name || '',
        item.game_account || '',
        item.game_nickname || '',
        item.demand || '',
        item.contact || '',
        item.deadline || '',
        item.note || '',
        (STATUS[item.status] || STATUS.pending).label,
        item.owner_note || '',
        review.rating || '',
        review.content || '',
        formatTime(item.updated_at)
      ];
    });

    var csv = [header].concat(rows)
      .map(function (row) { return row.map(csvCell).join(','); })
      .join('\r\n');

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var date = new Date();
    link.href = url;
    link.download = '代肝需求-' + localDayKey(date) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('CSV 已导出。');
  }

  if (els.exportCsv) {
    els.exportCsv.addEventListener('click', exportRequestsCsv);
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

  async function notifyOwner(requestId) {
    try {
      var res = await sb.functions.invoke('notify-owner', {
        body: { requestId: Number(requestId) }
      });
      if (res.error) throw res.error;
      return !!(res.data && res.data.ok);
    } catch (err) {
      console.warn('店主邮件通知发送失败', err);
      return false;
    }
  }

  async function notifyBoss(requestId) {
    try {
      var res = await sb.functions.invoke('notify-boss', {
        body: { requestId: Number(requestId) }
      });
      if (res.error) throw res.error;
      return !!(res.data && res.data.ok);
    } catch (err) {
      console.warn('邮件通知发送失败', err);
      return false;
    }
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

  async function urgeFunctionErrorMessage(error) {
    var message = (error && (error.message || error.error_description)) || '发送失败';
    try {
      if (error && error.context) {
        var body = await error.context.clone().json();
        if (body && body.error) message = body.error;
      }
    } catch (e) {}
    if (/Failed to send a request to the Edge Function|Function not found|404/i.test(message)) {
      return '提醒邮件服务还没部署，请先部署 notify-urge-milestone Edge Function。';
    }
    return message;
  }

  if (els.bossUrgeList) {
    els.bossUrgeList.addEventListener('click', async function (event) {
      var button = event.target.closest('button[data-notify-boss]');
      if (!button) return;

      var bossId = button.getAttribute('data-notify-boss');
      var item = state.bossUrgeStats.find(function (row) {
        return String(row.boss_id) === String(bossId);
      });
      var name = item ? (item.display_name || item.email || '这个老板') : '这个老板';

      if (!window.confirm('给「' + name + '」发送催更提醒邮件吗？')) return;

      var label = button.textContent;
      button.disabled = true;
      button.textContent = '发送中…';

      try {
        var res = await sb.functions.invoke('notify-urge-milestone', {
          body: { bossId: bossId }
        });
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);

        var notifyData = res.data || {};
        if (notifyData.skipped) {
          toast(notifyData.reason || '已经发过提醒。');
        } else if (notifyData.ok) {
          toast('催更提醒邮件已发送。');
        } else {
          toast(notifyData.reason || '发送失败，请稍后重试。', true);
        }

        await loadOwnerStats();
      } catch (err) {
        console.error(err);
        toast('发送失败：' + (await urgeFunctionErrorMessage(err)), true);
        button.disabled = false;
        button.textContent = label;
      }
    });
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
          shotsBlock(item, true) +
          actions +
          reviewHtml +
          '<div class="req-footer">' +
            '<span>提交 ' + escapeHtml(formatTime(item.created_at)) + '</span>' +
            '<span>更新 ' + escapeHtml(formatTime(item.updated_at)) + '</span>' +
            '<button class="btn btn-sm btn-danger" type="button" data-delete>删除</button>' +
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

  async function deleteRequests(items) {
    if (!items || !items.length) return;
    var ids = items.map(function (item) { return Number(item.id); });
    var paths = items.map(function (item) { return item.image_path; }).filter(Boolean);

    // 先把完成截图的路径收集起来；删除需求后 request_images 会级联删除
    try {
      var imgRes = await sb
        .from('request_images')
        .select('storage_path')
        .in('request_id', ids);
      if (imgRes.error) {
        console.warn('读取完成截图路径失败', imgRes.error);
      } else {
        (imgRes.data || []).forEach(function (row) {
          if (row.storage_path) paths.push(row.storage_path);
        });
      }
    } catch (err) {
      console.warn('读取完成截图路径失败', err);
    }

    var res = await sb.from('requests').delete().in('id', ids);
    if (res.error) throw res.error;

    var uniquePaths = paths.filter(function (path, index) {
      return paths.indexOf(path) === index;
    });

    if (uniquePaths.length) {
      try {
        // Storage remove 一次别传太多，分批清理
        for (var i = 0; i < uniquePaths.length; i += 50) {
          var storageRes = await sb.storage
            .from('request-images')
            .remove(uniquePaths.slice(i, i + 50));
          if (storageRes.error) console.warn('删除截图失败', storageRes.error);
        }
      } catch (err) {
        console.warn('删除截图失败', err);
      }
    }

    toast('已删除 ' + items.length + ' 条需求。');
    await loadOwnerRequests();
    await loadOwnerStats();
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

    if (els.cleanupBar) {
      $$('[data-clear]', els.cleanupBar).forEach(function (button) {
        var key = button.getAttribute('data-clear');
        var count = key === 'all' ? counts.all : (counts[key] || 0);
        var badge = button.querySelector('[data-clear-count]');
        if (badge) badge.textContent = count;
        button.disabled = count === 0;
      });
    }
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

  if (els.cleanupBar) {
    els.cleanupBar.addEventListener('click', async function (event) {
    var button = event.target.closest('button[data-clear]');
    if (!button) return;

    var status = button.getAttribute('data-clear');
    var items = status === 'all'
      ? state.requests.slice()
      : state.requests.filter(function (item) { return item.status === status; });

    if (!items.length) {
      toast('这个分类没有可清理的需求。');
      return;
    }

    var labelMap = { completed: '已完成', rejected: '已驳回', accepted: '已接受', all: '全部' };
    var label = labelMap[status] || status;
    if (!window.confirm('确定删除 ' + items.length + ' 条「' + label + '」需求吗？\n截图和评价会一起删除，无法恢复。')) return;
    if (status === 'all' && !window.confirm('最后确认：真的要清空全部需求吗？')) return;

    button.disabled = true;
    try {
      await deleteRequests(items);
    } catch (err) {
      console.error(err);
      toast('清理失败：' + friendlyError(err), true);
    } finally {
      updateFilterCounts();
    }
  });
  }

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
      if (!state.user || document.hidden || state.autoBusy || state.manualBusy) return;

      if (!els.ownerView.hidden) {
        if (hasFocusInside(els.ownerView)) return;
        state.autoBusy = true;
        loadOwnerRequests(true)
          .then(function () { return loadOwnerStats(); })
          .then(function () { return loadWallAdmin(); })
          .finally(function () { state.autoBusy = false; });
      } else if (!els.bossView.hidden) {
        if (hasFocusInside(els.myList)) return;
        state.autoBusy = true;
        loadBossRequests(true).finally(function () { state.autoBusy = false; });
      }
    }, 15000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !state.user || state.autoBusy || state.manualBusy) return;
    if (!els.ownerView.hidden && !hasFocusInside(els.ownerView)) {
      loadOwnerRequests(true)
        .then(function () { return loadOwnerStats(); })
        .then(function () { return loadWallAdmin(); });
    } else if (!els.bossView.hidden && !hasFocusInside(els.myList)) {
      loadBossRequests(true);
    }
  });

  els.adminList.addEventListener('click', async function (event) {
    var removeResultBtn = event.target.closest('button[data-remove-result]');
    if (removeResultBtn) {
      if (!window.confirm('删除这张完成截图吗？老板将看不到它。')) return;
      removeResultBtn.disabled = true;
      try {
        await removeResultImage(removeResultBtn.getAttribute('data-remove-result'));
      } catch (err) {
        console.error(err);
        toast('删除完成截图失败：' + friendlyError(err), true);
        removeResultBtn.disabled = false;
      }
      return;
    }

    var uploadResultBtn = event.target.closest('button[data-upload-result]');
    if (uploadResultBtn) {
      var uploadBlock = uploadResultBtn.closest('[data-upload-request]');
      if (!uploadBlock || uploadBlock.getAttribute('data-uploading') === '1') return;
      var uploadRequestId = uploadBlock.getAttribute('data-upload-request');
      var fileInput = uploadBlock.querySelector('[data-result-input]');
      var files = fileInput && fileInput.files
        ? Array.prototype.slice.call(fileInput.files)
        : [];
      if (!files.length) {
        toast('先选择要上传的图片。', true);
        if (fileInput) fileInput.click();
        return;
      }
      await uploadResultImages(uploadRequestId, files, uploadBlock);
      return;
    }

    var deleteBtn = event.target.closest('button[data-delete]');
    if (deleteBtn) {
      var deleteCard = deleteBtn.closest('.req-card');
      var deleteId = deleteCard ? deleteCard.getAttribute('data-id') : null;
      var deleteItem = state.requests.find(function (item) { return String(item.id) === String(deleteId); });
      if (!deleteItem) return;
      if (!window.confirm('确定删除这条需求吗？\n截图和评价会一起删除，无法恢复。')) return;

      deleteBtn.disabled = true;
      try {
        await deleteRequests([deleteItem]);
      } catch (err) {
        console.error(err);
        toast('删除失败：' + friendlyError(err), true);
        deleteBtn.disabled = false;
      }
      return;
    }

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
    if (action === 'complete' && !window.confirm('确定把这条需求标记为「已完成」吗？\n记得在卡片里上传完成截图，老板能看到。')) return;

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

      var mailSent = await notifyBoss(requestId);
      toast('已' + labels[nextStatus] + '，老板刷新就能看到。' + (mailSent ? ' 邮件已通知老板。' : ''));
      await loadOwnerRequests();
      await loadOwnerStats();
    } catch (err) {
      console.error(err);
      toast('操作失败：' + friendlyError(err), true);
      setCardBusy(card, false);
    }
  });

  els.adminList.addEventListener('change', function (event) {
    var input = event.target.closest('[data-result-input]');
    if (!input) return;
    var block = input.closest('[data-upload-request]');
    var hint = block ? block.querySelector('[data-result-hint]') : null;
    if (!hint) return;

    var requestId = block.getAttribute('data-upload-request');
    var remaining = Math.max(0, MAX_RESULT_IMAGES - resultImagesFor(requestId).length);
    var files = input.files ? Array.prototype.slice.call(input.files) : [];

    if (!files.length) {
      hint.textContent = '还可选 ' + remaining + ' 张，自动压缩，上传后老板立刻能看到。';
      return;
    }

    var totalMb = files.reduce(function (sum, file) {
      return sum + (file.size || 0);
    }, 0) / 1024 / 1024;

    hint.textContent = '已选 ' + files.length + ' 张（' + totalMb.toFixed(1) + 'MB），点「上传完成截图」开始上传。' +
      (files.length > remaining ? ' 每单最多 ' + MAX_RESULT_IMAGES + ' 张，只会传前 ' + remaining + ' 张。' : '');
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
      }).select('id').single();

      if (res.error) throw res.error;

      var newRequestId = res.data ? res.data.id : null;
      var ownerNotified = newRequestId ? await notifyOwner(newRequestId) : false;

      setRequestMessage('提交成功，等店主审核。', 'ok');
      form.reset();
      setImageHint('');
      toast(
        (imageFile ? '需求已提交（含截图），等店主审核。' : '需求已提交，等店主审核。') +
        (ownerNotified ? ' 已邮件通知店主。' : '')
      );
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

  if (els.publicNameSave && els.publicNameInput) {
    els.publicNameSave.addEventListener('click', async function () {
      var name = els.publicNameInput.value.trim();

      if (!name) {
        setPublicNameMessage('请填写公开昵称。', 'error');
        els.publicNameInput.focus();
        return;
      }
      if (name.length > 20) {
        setPublicNameMessage('公开昵称最多 20 个字符。', 'error');
        return;
      }

      els.publicNameSave.disabled = true;
      setPublicNameMessage('保存中…', '');

      try {
        var res = await sb.rpc('set_public_name', { p_name: name });
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);

        if (state.profile) state.profile.public_name = name;
        els.publicNameInput.value = name;
        setPublicNameMessage('已保存，会显示在首页留言墙。', 'ok');
        toast('公开昵称已保存。');
      } catch (err) {
        console.error(err);
        setPublicNameMessage('保存失败：' + wallErrorText(err), 'error');
      } finally {
        els.publicNameSave.disabled = false;
      }
    });
  }

  els.bossRefresh.addEventListener('click', async function () {
    els.bossRefresh.disabled = true;
    await loadBossRequests();
    els.bossRefresh.disabled = false;
    toast('已刷新');
  });

  els.ownerRefresh.addEventListener('click', async function () {
    els.ownerRefresh.disabled = true;
    await loadOwnerRequests();
    await Promise.all([loadBossAccounts(), loadOwnerStats(), loadWallAdmin()]);
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

  function resultImagesFor(requestId) {
    return state.requestImages.filter(function (row) {
      return Number(row.request_id) === Number(requestId);
    });
  }

  function shotFigure(url, alt) {
    return (
      '<figure class="shot">' +
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' +
          '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" loading="lazy">' +
        '</a>' +
      '</figure>'
    );
  }

  function shotsBlock(item, isOwner) {
    var results = resultImagesFor(item.id);
    var canManage = item.status === 'accepted' || item.status === 'completed';
    var remaining = Math.max(0, MAX_RESULT_IMAGES - results.length);

    var originalHtml = item.imageUrl
      ? '<div class="shot-grid">' + shotFigure(item.imageUrl, '老板提交时上传的原始截图') + '</div>'
      : '<p class="shot-empty">老板没有上传原始截图。</p>';

    var resultHtml = results.length
      ? '<div class="shot-grid">' + results.map(function (row) {
          var figure = row.url
            ? '<a href="' + escapeHtml(row.url) + '" target="_blank" rel="noreferrer">' +
                '<img src="' + escapeHtml(row.url) + '" alt="店主上传的完成截图" loading="lazy">' +
              '</a>'
            : '<div class="shot-broken">图片加载失败</div>';
          return (
            '<figure class="shot">' +
              figure +
              (isOwner
                ? '<button class="shot-del" type="button" data-remove-result="' +
                    escapeHtml(String(row.id)) + '" title="删除这张完成截图">删除</button>'
                : '') +
            '</figure>'
          );
        }).join('') + '</div>'
      : '<p class="shot-empty">' +
          (isOwner ? '还没有完成截图，上传后老板就能看到。' : '店主还没有上传完成截图。') +
        '</p>';

    var showResultGroup = state.imagesAvailable && (results.length > 0 || canManage);

    var uploadHtml = '';
    if (isOwner && canManage) {
      var full = remaining === 0;
      uploadHtml =
        '<div class="result-upload" data-upload-request="' + escapeHtml(String(item.id)) + '" data-uploading="0">' +
          '<input class="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple data-result-input' +
            (full ? ' disabled' : '') + '>' +
          '<button class="btn btn-sm btn-blue" type="button" data-upload-result' + (full ? ' disabled' : '') + '>' +
            (full ? '已满 ' + MAX_RESULT_IMAGES + ' 张' : '上传完成截图') +
          '</button>' +
          '<p class="form-hint" data-result-hint>' +
            (full
              ? '每单最多 ' + MAX_RESULT_IMAGES + ' 张，删掉一张后可再传。'
              : '还可选 ' + remaining + ' 张，自动压缩，上传后老板立刻能看到。') +
          '</p>' +
          '<p class="form-msg" data-result-msg role="status"></p>' +
        '</div>';
    }

    return (
      '<div class="shots">' +
        '<div class="shot-group">' +
          '<div class="shot-title"><span>原始截图</span><em>老板提交时上传</em></div>' +
          originalHtml +
        '</div>' +
        (showResultGroup
          ? '<div class="shot-group">' +
              '<div class="shot-title"><span>完成截图</span><em>' +
                (isOwner
                  ? '已上传 ' + results.length + ' / ' + MAX_RESULT_IMAGES
                  : '店主上传 ' + results.length + ' 张') +
              '</em></div>' +
              resultHtml +
              uploadHtml +
            '</div>'
          : '') +
      '</div>'
    );
  }

  async function loadRequestImages(requests) {
    var ids = (requests || [])
      .map(function (item) { return Number(item.id); })
      .filter(function (id) { return id > 0; });
    state.requestImages = [];
    if (!ids.length) return;

    try {
      var res = await sb
        .from('request_images')
        .select('*')
        .in('request_id', ids)
        .order('created_at', { ascending: true });
      if (res.error) throw res.error;

      var rows = res.data || [];
      await Promise.all(rows.map(async function (row) {
        row.url = '';
        if (!row.storage_path) return;
        try {
          var signed = await sb.storage
            .from('request-images')
            .createSignedUrl(row.storage_path, 3600);
          if (!signed.error && signed.data && signed.data.signedUrl) {
            row.url = signed.data.signedUrl;
          }
        } catch (err) {
          console.warn('生成完成截图链接失败', err);
        }
      }));
      state.requestImages = rows;
      state.imagesAvailable = true;
    } catch (err) {
      console.warn('读取完成截图失败', err);
      state.requestImages = [];
      state.imagesAvailable = false;
    }
  }

  async function uploadResultImages(requestId, files, block) {
    var request = state.requests.find(function (item) {
      return String(item.id) === String(requestId);
    });
    if (!request) return;
    if (request.status !== 'accepted' && request.status !== 'completed') {
      toast('只有已接受 / 已完成的需求才能上传完成截图。', true);
      return;
    }

    var existing = resultImagesFor(requestId).length;
    var remaining = MAX_RESULT_IMAGES - existing;
    if (remaining <= 0) {
      toast('每单最多 ' + MAX_RESULT_IMAGES + ' 张，先删掉一张再传。', true);
      return;
    }

    var chosen = files.slice(0, remaining);
    if (files.length > remaining) {
      toast('每单最多 ' + MAX_RESULT_IMAGES + ' 张，这次只上传前 ' + remaining + ' 张。', true);
    }

    var button = block.querySelector('[data-upload-result]');
    var input = block.querySelector('[data-result-input]');
    var hint = block.querySelector('[data-result-hint]');
    var msg = block.querySelector('[data-result-msg]');
    var buttonLabel = button ? button.textContent : '';
    var hintLabel = hint ? hint.textContent : '';
    var uploadedPaths = [];

    function setBusy(busy, text) {
      block.setAttribute('data-uploading', busy ? '1' : '0');
      if (button) {
        button.disabled = busy;
        button.textContent = busy ? text : buttonLabel;
      }
      if (input) input.disabled = busy;
      if (hint) hint.textContent = busy ? text : hintLabel;
    }

    state.manualBusy = true;
    setBusy(true, '上传中…');

    try {
      // 先全部压缩，再统一上传
      var blobs = [];
      for (var i = 0; i < chosen.length; i += 1) {
        if (msg) {
          msg.className = 'form-msg';
          msg.textContent = '处理图片 ' + (i + 1) + ' / ' + chosen.length + '…';
        }
        var file = chosen[i];
        if (!file || !file.size) throw new Error('有一张图片是空的，换一张试试。');
        if (file.size > 10 * 1024 * 1024) throw new Error(file.name + ' 超过 10MB。');
        blobs.push(await compressImage(file));
      }

      // 上传到店主自己的 Storage 目录
      for (var j = 0; j < blobs.length; j += 1) {
        if (msg) msg.textContent = '上传 ' + (j + 1) + ' / ' + blobs.length + '…';
        var path = state.user.id + '/result/' + requestId + '-' + randomName() + '.jpg';
        var up = await sb.storage.from('request-images').upload(path, blobs[j], {
          contentType: 'image/jpeg',
          upsert: false
        });
        if (up.error) throw up.error;
        uploadedPaths.push(path);
      }

      var rows = uploadedPaths.map(function (path) {
        return {
          request_id: Number(requestId),
          uploader_id: state.user.id,
          storage_path: path,
          kind: 'result'
        };
      });

      var ins = await sb.from('request_images').insert(rows);
      if (ins.error) throw ins.error;

      toast('已上传 ' + uploadedPaths.length + ' 张完成截图，老板刷新就能看到。');
      await loadOwnerRequests();
    } catch (err) {
      console.error(err);
      if (uploadedPaths.length) {
        try {
          await sb.storage.from('request-images').remove(uploadedPaths);
        } catch (e) {
          console.warn('清理上传失败的完成截图失败', e);
        }
      }
      if (msg) {
        msg.className = 'form-msg is-error';
        msg.textContent = '上传失败：' + friendlyError(err);
      }
      if (input) input.value = '';
    } finally {
      state.manualBusy = false;
      setBusy(false, '上传中…');
    }
  }

  async function removeResultImage(imageId) {
    var row = state.requestImages.find(function (item) {
      return String(item.id) === String(imageId);
    });
    if (!row) return;

    var res = await sb.from('request_images').delete().eq('id', row.id);
    if (res.error) throw res.error;

    try {
      var removed = await sb.storage.from('request-images').remove([row.storage_path]);
      if (removed.error) console.warn('删除完成截图文件失败', removed.error);
    } catch (err) {
      console.warn('删除完成截图文件失败', err);
    }

    toast('已删除完成截图。');
    await loadOwnerRequests();
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

  function randomName() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  async function uploadScreenshot(file) {
    if (!file) return '';
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('截图不能超过 10MB');
    }
    var blob = await compressImage(file);
    var path = state.user.id + '/' + randomName() + '.jpg';
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

  function setPublicNameMessage(text, type) {
    if (!els.publicNameMsg) return;
    els.publicNameMsg.textContent = text || '';
    els.publicNameMsg.className = 'form-msg' + (type ? ' is-' + type : '');
  }

  function wallErrorText(error) {
    var message = (error && (error.message || error.error_description || error.hint)) || '操作失败';
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      return '留言墙还没启用，请先运行 migration-008。';
    }
    return message;
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
