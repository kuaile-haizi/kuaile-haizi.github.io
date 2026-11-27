/* ============================================================
   联系店主：复制按钮 + 收款码缺失兜底
   首页与老板留言板共用
   ============================================================ */
(function () {
  'use strict';

  var $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  function markMissing(img) {
    var card = img.closest('.pay-card');
    if (card) card.classList.add('is-missing');
  }

  function checkQr(img) {
    if (img.complete && img.naturalWidth === 0) markMissing(img);
  }

  $$('.pay-img').forEach(function (img) {
    img.addEventListener('error', function () { markMissing(img); });
    checkQr(img);
  });

  window.addEventListener('load', function () {
    $$('.pay-img').forEach(checkQr);
  });

  function syncPayGate() {
    $$('[data-pay-agree]').forEach(function (checkbox) {
      var panel = checkbox.closest('.pay-panel');
      var qr = panel ? panel.querySelector('.pay-qr') : null;
      if (qr) qr.hidden = !checkbox.checked;
    });
  }

  syncPayGate();
  window.addEventListener('pageshow', syncPayGate);

  document.addEventListener('change', function (event) {
    var checkbox = event.target.closest('[data-pay-agree]');
    if (!checkbox) return;
    syncPayGate();
  });

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      if (ok) resolve();
      else reject(new Error('copy failed'));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy]');
    if (!button) return;

    var text = button.getAttribute('data-copy') || '';
    if (!text) return;

    var label = button.textContent;
    copyText(text).then(function () {
      button.textContent = '已复制';
      button.classList.add('is-done');
      window.setTimeout(function () {
        button.textContent = label;
        button.classList.remove('is-done');
      }, 1600);
    }).catch(function () {
      button.textContent = '复制失败';
      window.setTimeout(function () {
        button.textContent = label;
      }, 1600);
    });
  });
})();
