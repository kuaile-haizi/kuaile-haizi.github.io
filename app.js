/* ============================================================
   代肝催工事务所 · 交互逻辑
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  const $ = (sel) => document.querySelector(sel);
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const format = (n) => n.toLocaleString('zh-CN');

  /* ---------- DOM ---------- */
  const dom = {
    affection: $('#affectionValue'),
    whipped: $('#whippedValue'),
    comboStat: $('#comboStat'),
    comboValue: $('#comboValue'),
    encourage: $('#encourage'),
    encourageTitle: $('#encourageTitle'),
    encourageText: $('#encourageText'),
    avatarCard: $('#avatarCard'),
    avatarWrap: $('#avatarWrap'),
    avatarFrame: $('#avatarFrame'),
    avatarImg: $('#avatarImg'),
    avatarEdit: $('#avatarEdit'),
    avatarInput: $('#avatarInput'),
    whipLayer: $('#whipLayer'),
    impact: $('#impact'),
    popLayer: $('#popLayer'),
    whipBtn: $('#whipBtn'),
    soundToggle: $('#soundToggle'),
    statusText: $('#statusText'),
    toast: $('#toast'),
    bgHearts: $('#bgHearts')
  };

  /* ---------- 本地存储 ---------- */
  const KEY = {
    affection: 'whip.affection',
    count: 'whip.count',
    muted: 'whip.muted',
    avatar: 'whip.avatar'
  };

  const store = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        /* 隐私模式、容量超限时静默忽略 */
      }
    }
  };

  /* ---------- 状态 ---------- */
  const state = {
    affection: Math.max(0, parseInt(store.get(KEY.affection, '0'), 10) || 0),
    count: Math.max(0, parseInt(store.get(KEY.count, '0'), 10) || 0),
    muted: store.get(KEY.muted, '0') === '1',
    lastHit: 0,
    comboLast: 0,
    combo: 0,
    comboResetTimer: 0,
    encourageTimer: 0,
    hitToken: 0,
    statusLockedUntil: 0,
    impactTimer: 0,
    audio: null
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMPACT_DELAY = reducedMotion ? 30 : 200;
  const HIT_COOLDOWN = reducedMotion ? 320 : 640;
  const COMBO_WINDOW = 1800;

  /* 连击达到这些数字时弹出鼓励语（每个阶段随机一句） */
  const COMBO_MILESTONES = [
    { at: 5, lines: ['手感不错，继续保持！', '节奏起来了，别停！', '这一套连打很丝滑！'] },
    { at: 10, lines: ['你已经是催工小能手了！', '代肝人开始怀疑人生了。', '手速在线，继续输出！'] },
    { at: 20, lines: ['代肝人开始怕你了，再来！', '好感度正在狂飙！', '这波连击，稳！'] },
    { at: 30, lines: ['这手速，值得一个大大的赞！', '键盘都要冒烟了！', '再快一点，他快答应了！'] },
    { at: 50, lines: ['传说级手速，继续冲！', '整个代肝界都听见了鞭声！', '你已经进入无人之境！'] },
    { at: 100, lines: ['你就是传说中的催工之王！', '好感度已溢出，请手下留情！', '这一百连击，值得载入史册！'] }
  ];

  /* 每次点击随机弹出 1~5 个「好感度 +1」（权重偏向 1~2 个） */
  const POP_WEIGHTS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5];

  const STATUSES = [
    '在线摸鱼中',
    '假装在肝',
    '肝度 12%',
    '说“马上就好”',
    '正在看攻略',
    '其实在刷视频',
    '不想动，一点也不想动'
  ];

  const HIT_STATUSES = [
    '被抽得一个激灵',
    '嘴上说不要，好感度很诚实',
    '肝：我谢谢你啊',
    '摸鱼被逮个正着',
    '这一鞭，是爱（确信）',
    '边挨打边涨好感度',
    '代肝人的尊严碎了'
  ];

  const POPUP_LABEL = '<span class="popup-label">好感度</span><span class="popup-num">+1</span>';
  const HEART_SVG =
    '<svg viewBox="0 0 32 29" aria-hidden="true"><path d="M16 28S2 18 2 9.5C2 4.8 5.8 1 10.5 1c2.6 0 4.6 1.2 5.5 2.6C16.9 2.2 18.9 1 21.5 1 26.2 1 30 4.8 30 9.5 30 18 16 28 16 28Z"/></svg>';
  const HEART_COLORS = ['#ff5c8a', '#ffd166', '#b98bff', '#ff2d6f', '#2ee6c5'];

  /* ---------- 初始渲染 ---------- */
  dom.affection.textContent = format(state.affection);
  dom.whipped.textContent = format(state.count);
  updateComboUI();
  updateSoundButton();
  restoreAvatar();
  initAmbientHearts();

  window.setInterval(() => {
    if (Date.now() < state.statusLockedUntil) return;
    setStatus(pick(STATUSES));
  }, 6000);

  /* ---------- 事件绑定 ---------- */
  dom.whipBtn.addEventListener('click', trigger);
  dom.avatarFrame.addEventListener('click', trigger);
  bindAvatarUpload();

  dom.soundToggle.addEventListener('click', () => {
    state.muted = !state.muted;
    store.set(KEY.muted, state.muted ? '1' : '0');
    updateSoundButton();
    if (!state.muted) playSound('pop');
  });

  /* ============================================================
     主流程：抽一鞭
     ============================================================ */
  function trigger(evt) {
    const now = performance.now();
    if (now - state.lastHit < HIT_COOLDOWN) return;
    state.lastHit = now;
    const token = ++state.hitToken;

    /* 在用户手势内解锁音频，保证稍后 setTimeout 里的音效也能播放 */
    ensureAudio();

    const popCount = pick(POP_WEIGHTS);

    /* 连击：1.8 秒内继续点击就会累计，断档自动归零 */
    const comboGap = now - state.comboLast;
    state.combo = comboGap < COMBO_WINDOW ? state.combo + 1 : 1;
    state.comboLast = now;
    const comboNow = state.combo;
    const milestone = findComboMilestone(comboNow);
    updateComboUI();

    window.clearTimeout(state.comboResetTimer);
    state.comboResetTimer = window.setTimeout(() => {
      state.combo = 0;
      updateComboUI();
    }, COMBO_WINDOW + 60);

    /* 1. 甩鞭 */
    dom.whipLayer.classList.remove('is-swung');
    void dom.whipLayer.offsetWidth;
    dom.whipLayer.classList.add('is-swung');
    window.setTimeout(() => {
      if (state.hitToken === token) dom.whipLayer.classList.remove('is-swung');
    }, 560);

    /* 2. 按钮反馈 */
    dom.whipBtn.classList.add('is-pressed');
    window.setTimeout(() => dom.whipBtn.classList.remove('is-pressed'), 150);
    spawnRipple(evt);

    /* 3. 鞭子落下：命中特效 + 飘字 */
    window.setTimeout(() => {
      if (state.hitToken !== token) return;

      restartHitAnimation();
      spawnImpact();
      spawnPopups(popCount);
      spawnHearts();
      addAffection(popCount);
      playSound('crack');
      playSound('pops', popCount);

      if (milestone) {
        spawnHearts(8);
        showEncourage(milestone, comboNow);
        playSound('milestone');
      }

      setStatus(
        comboNow >= 2 ? '连击 ×' + comboNow + '，还嘴硬' : pick(HIT_STATUSES),
        2600
      );
    }, IMPACT_DELAY);

    /* 4. 清理命中状态（被下一次点击打断时由 token 自动跳过） */
    window.setTimeout(() => {
      if (state.hitToken !== token) return;
      dom.avatarWrap.classList.remove('is-hit');
      dom.avatarCard.classList.remove('is-shaking');
    }, IMPACT_DELAY + 900);
  }

  function restartHitAnimation() {
    dom.avatarWrap.classList.remove('is-hit');
    dom.avatarCard.classList.remove('is-shaking');
    void dom.avatarWrap.offsetWidth;
    void dom.avatarCard.offsetWidth;
    dom.avatarWrap.classList.add('is-hit');
    dom.avatarCard.classList.add('is-shaking');
  }

  /* ---------- 连击计数 ---------- */
  function updateComboUI() {
    dom.comboValue.textContent = '×' + state.combo;
    const hot = state.combo >= 2;
    dom.comboStat.classList.toggle('is-hot', hot);

    if (hot) {
      dom.comboStat.classList.remove('is-bump');
      void dom.comboStat.offsetWidth;
      dom.comboStat.classList.add('is-bump');
    }
  }

  function findComboMilestone(combo) {
    for (let i = 0; i < COMBO_MILESTONES.length; i++) {
      if (COMBO_MILESTONES[i].at === combo) return COMBO_MILESTONES[i];
    }
    if (combo > 100 && combo % 50 === 0) {
      return { lines: ['连击还在涨，好感度已经装不下了！', '这就是催工之神的领域吗！'] };
    }
    return null;
  }

  function showEncourage(milestone, combo) {
    dom.encourageTitle.textContent = '连击 ×' + combo + '！';
    dom.encourageText.textContent = pick(milestone.lines);
    dom.encourage.classList.remove('is-show');
    void dom.encourage.offsetWidth;
    dom.encourage.classList.add('is-show');

    window.clearTimeout(state.encourageTimer);
    state.encourageTimer = window.setTimeout(() => {
      dom.encourage.classList.remove('is-show');
    }, 3200);
  }

  /* ---------- 按钮水波纹 ---------- */
  function spawnRipple(evt) {
    let x = dom.whipBtn.clientWidth / 2;
    let y = dom.whipBtn.clientHeight / 2;

    if (evt && typeof evt.clientX === 'number' && (evt.clientX || evt.clientY)) {
      const rect = dom.whipBtn.getBoundingClientRect();
      x = Math.min(rect.width, Math.max(0, evt.clientX - rect.left));
      y = Math.min(rect.height, Math.max(0, evt.clientY - rect.top));
    }

    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    dom.whipBtn.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 700);
  }

  /* ---------- 随机个数的「好感度 +1」 ---------- */
  /* 预先分配位置（横向百分比, 纵向百分比），避免多个飘字叠在一起 */
  const POP_SLOTS = {
    1: [[50, 42]],
    2: [[31, 40], [69, 44]],
    3: [[26, 36], [74, 36], [50, 54]],
    4: [[24, 34], [76, 34], [34, 56], [66, 56]],
    5: [[22, 32], [78, 32], [34, 48], [66, 48], [50, 64]]
  };

  function spawnPopups(count) {
    const slots = (POP_SLOTS[count] || POP_SLOTS[1]).slice();
    const avatarWidth = dom.avatarWrap.clientWidth || 300;
    const baseSize = Math.max(18, Math.min(30, avatarWidth * 0.1));

    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      const popup = document.createElement('div');
      popup.className = 'popup';
      popup.style.left = (slot[0] + rand(-2.5, 2.5)).toFixed(2) + '%';
      popup.style.top = (slot[1] + rand(-2.5, 2.5)).toFixed(2) + '%';
      popup.style.fontSize = (baseSize * (count >= 4 ? 0.82 : 1) * rand(0.94, 1.08)).toFixed(1) + 'px';
      popup.style.setProperty('--dx', rand(-14, 14).toFixed(1) + 'px');
      popup.style.setProperty('--rot', rand(-9, 9).toFixed(1) + 'deg');
      popup.style.setProperty('--dur', rand(1050, 1350).toFixed(0) + 'ms');
      popup.style.setProperty('--delay', (i * 110 + rand(0, 50)).toFixed(0) + 'ms');
      popup.style.setProperty('--pop-scale', rand(0.95, 1.12).toFixed(2));
      popup.innerHTML = POPUP_LABEL;
      dom.popLayer.appendChild(popup);

      popup.addEventListener('animationend', (event) => {
        if (event.target === popup) popup.remove();
      });
      window.setTimeout(() => popup.remove(), 3600);
    }
  }

  /* ---------- 爱心迸出 ---------- */
  function spawnHearts(bonus) {
    const count = randInt(6, 10) + (bonus || 0);

    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.innerHTML = HEART_SVG;
      heart.style.left = (50 + rand(-24, 24)).toFixed(2) + '%';
      heart.style.top = (52 + rand(-12, 18)).toFixed(2) + '%';
      heart.style.color = pick(HEART_COLORS);
      heart.style.setProperty('--tx', rand(-100, 100).toFixed(0) + 'px');
      heart.style.setProperty('--ty', rand(-160, -70).toFixed(0) + 'px');
      heart.style.setProperty('--rot', rand(-25, 25).toFixed(0) + 'deg');
      heart.style.setProperty('--size', rand(14, 28).toFixed(0) + 'px');
      heart.style.setProperty('--dur', rand(820, 1250).toFixed(0) + 'ms');
      heart.style.setProperty('--delay', rand(0, 120).toFixed(0) + 'ms');
      dom.popLayer.appendChild(heart);

      heart.addEventListener('animationend', (event) => {
        if (event.target === heart) heart.remove();
      });
      window.setTimeout(() => heart.remove(), 2200);
    }
  }

  /* ---------- 冲击波 ---------- */
  function spawnImpact() {
    dom.impact.classList.remove('is-on');
    void dom.impact.offsetWidth;
    dom.impact.classList.add('is-on');
    window.clearTimeout(state.impactTimer);
    state.impactTimer = window.setTimeout(() => dom.impact.classList.remove('is-on'), 800);
  }

  /* ---------- 数值与存档 ---------- */
  function addAffection(amount) {
    state.affection += amount;
    state.count += 1;
    store.set(KEY.affection, String(state.affection));
    store.set(KEY.count, String(state.count));

    dom.affection.textContent = format(state.affection);
    dom.whipped.textContent = format(state.count);

    const stat = dom.affection.closest('.stat');
    if (stat) {
      stat.classList.remove('is-bump');
      void stat.offsetWidth;
      stat.classList.add('is-bump');
    }
  }

  /* ---------- 状态文案 ---------- */
  function setStatus(text, lockMs) {
    dom.statusText.textContent = text;
    if (lockMs) state.statusLockedUntil = Date.now() + lockMs;
  }

  /* ============================================================
     音效（WebAudio 合成，无需音频文件）
     ============================================================ */
  function updateSoundButton() {
    dom.soundToggle.textContent = state.muted ? '🔇' : '🔊';
    dom.soundToggle.setAttribute('aria-pressed', String(!state.muted));
    dom.soundToggle.setAttribute('aria-label', state.muted ? '开启音效' : '关闭音效');
    dom.soundToggle.title = state.muted ? '开启音效' : '关闭音效';
  }

  function ensureAudio() {
    if (state.muted) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!state.audio) state.audio = new Ctx();
      if (state.audio.state === 'suspended') state.audio.resume();
      return state.audio;
    } catch (err) {
      return null;
    }
  }

  function playPopAt(ctx, when, base) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base + rand(-40, 40), when);
    osc.frequency.exponentialRampToValueAtTime(base * 1.7, when + 0.09);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.09, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.18);
  }

  function playSound(kind, count) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime + 0.01;

    if (kind === 'crack') {
      /* 高频"啪"的噪声 */
      const duration = 0.1;
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const fade = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * fade * fade;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2600;
      band.Q.value = 1.1;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      noise.connect(band).connect(noiseGain).connect(ctx.destination);
      noise.start(now);

      /* 低频"闷响" */
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(190, now);
      thump.frequency.exponentialRampToValueAtTime(48, now + 0.13);
      thumpGain.gain.setValueAtTime(0.32, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      thump.connect(thumpGain).connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.18);
    } else if (kind === 'pops') {
      const total = count || 1;
      for (let i = 0; i < total; i++) {
        playPopAt(ctx, now + i * 0.055, 700 + i * 90);
      }
    } else if (kind === 'pop') {
      playPopAt(ctx, now, 820);
    } else if (kind === 'milestone') {
      /* 连击里程碑的小上扬音阶 */
      const notes = [659.25, 783.99, 1046.5, 1318.51];
      for (let i = 0; i < notes.length; i++) {
        const start = now + i * 0.085;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      }
    }
  }

  /* ============================================================
     头像：读取 / 拖拽上传 / 裁剪
     ============================================================ */
  function restoreAvatar() {
    const saved = store.get(KEY.avatar, '');
    if (saved) {
      dom.avatarImg.src = saved;
      return;
    }

    /* 若 assets 下放了 avatar.jpg / avatar.png，则自动使用 */
    const candidates = ['assets/avatar.jpg', 'assets/avatar.png'];
    let index = 0;

    const tryNext = () => {
      if (index >= candidates.length) return;
      const src = candidates[index++];
      const probe = new Image();
      probe.onload = () => {
        dom.avatarImg.src = src;
      };
      probe.onerror = tryNext;
      probe.src = src;
    };

    tryNext();
  }

  function bindAvatarUpload() {
    dom.avatarEdit.addEventListener('click', () => dom.avatarInput.click());

    dom.avatarInput.addEventListener('change', () => {
      const file = dom.avatarInput.files && dom.avatarInput.files[0];
      dom.avatarInput.value = '';
      if (file) handleAvatarFile(file);
    });

    let dragDepth = 0;

    const hasFiles = (event) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return false;
      if (!dataTransfer.types) return true;
      for (let i = 0; i < dataTransfer.types.length; i++) {
        if (dataTransfer.types[i] === 'Files') return true;
      }
      return false;
    };

    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      dom.avatarWrap.classList.add('is-drop');
    });

    window.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    });

    window.addEventListener('dragleave', (event) => {
      if (!event.dataTransfer) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || !event.relatedTarget) {
        dragDepth = 0;
        dom.avatarWrap.classList.remove('is-drop');
      }
    });

    window.addEventListener('drop', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      dom.avatarWrap.classList.remove('is-drop');

      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handleAvatarFile(file);
    });
  }

  function handleAvatarFile(file) {
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showToast('请丢一张图片进来～');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        try {
          const size = Math.min(image.naturalWidth, image.naturalHeight);
          const output = 512;
          const canvas = document.createElement('canvas');
          canvas.width = output;
          canvas.height = output;

          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#1a1028';
          ctx.fillRect(0, 0, output, output);
          ctx.drawImage(
            image,
            (image.naturalWidth - size) / 2,
            (image.naturalHeight - size) / 2,
            size,
            size,
            0,
            0,
            output,
            output
          );

          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          dom.avatarImg.src = dataUrl;
          store.set(KEY.avatar, dataUrl);
          showToast('头像已更换 ✦');
        } catch (err) {
          showToast('这张图片处理失败了，换一张试试');
        }
      };

      image.onerror = () => showToast('这张图片打不开，换一张试试');
      image.src = reader.result;
    };

    reader.onerror = () => showToast('读取失败了，再试一次');
    reader.readAsDataURL(file);
  }

  /* ---------- Toast ---------- */
  let toastTimer = 0;

  function showToast(text) {
    dom.toast.textContent = text;
    dom.toast.classList.add('is-show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-show'), 2200);
  }

  /* ---------- 背景漂浮爱心 ---------- */
  function initAmbientHearts() {
    if (reducedMotion) return;

    for (let i = 0; i < 16; i++) {
      const heart = document.createElement('span');
      heart.className = 'bg-heart';
      heart.textContent = '♥';
      heart.style.left = rand(0, 100).toFixed(2) + '%';
      heart.style.fontSize = rand(10, 22).toFixed(0) + 'px';
      heart.style.animationDuration = rand(15, 28).toFixed(1) + 's';
      heart.style.animationDelay = (-rand(0, 28)).toFixed(1) + 's';
      heart.style.setProperty('--sway', rand(-90, 90).toFixed(0) + 'px');
      dom.bgHearts.appendChild(heart);
    }
  }
})();
