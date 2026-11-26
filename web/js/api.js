/* 與本機伺服器溝通、電腦功能（選檔、選資料夾）、小工具。 */
(function () {
  const FB = (window.FB = window.FB || {});
  const qs = new URLSearchParams(location.search);
  const K = qs.get('k') || sessionStorage.getItem('fb_k') || '';
  if (K) sessionStorage.setItem('fb_k', K);
  FB.key = K;
  FB.sid = sessionStorage.getItem('fb_sid') || '';
  FB.setSession = (s) => { FB.sid = s || ''; if (s) sessionStorage.setItem('fb_sid', s); else sessionStorage.removeItem('fb_sid'); };

  async function req(name, opts, q) {
    const url = '/api/' + name + '?k=' + encodeURIComponent(K) + (q || '');
    let r;
    try {
      r = await fetch(url, Object.assign({ headers: { 'X-Session': FB.sid } }, opts));
    } catch (e) {
      throw new Error('無法連到程式核心（可能已關閉），請重新開啟程式');
    }
    let j = null;
    try { j = await r.json(); } catch (e) { /* 非 JSON */ }
    if (!r.ok || !j || j.ok === false) {
      const msg = (j && j.error) || ('錯誤 ' + r.status);
      if (r.status === 401 && FB.onLoggedOut) FB.onLoggedOut();
      throw new Error(msg);
    }
    return j.data;
  }
  FB.api = (name, body) => req(name, { method: 'POST', body: JSON.stringify(body || {}), headers: { 'X-Session': FB.sid, 'Content-Type': 'application/json' } });
  FB.get = (name, params) => req(name, { method: 'GET' }, params ? '&' + new URLSearchParams(params).toString() : '');
  FB.raw = (name, bytes, params) => req(name, { method: 'POST', body: bytes, headers: { 'X-Session': FB.sid, 'Content-Type': 'application/octet-stream' } }, params ? '&' + new URLSearchParams(params).toString() : '');
  FB.mediaURL = (id) => '/media/' + id + '?k=' + encodeURIComponent(K) + '&s=' + encodeURIComponent(FB.sid);
  FB.upload = (file, kind) => FB.raw('upload', file, { name: file.name || 'file', kind: kind || '' });

  // 電腦功能（pywebview）；網頁版沒有時回傳 null
  FB.native = null;
  FB.nativeReady = new Promise((res) => {
    const ok = () => { FB.native = window.pywebview && window.pywebview.api ? window.pywebview.api : null; res(FB.native); };
    if (window.pywebview && window.pywebview.api) ok();
    else { window.addEventListener('pywebviewready', ok); setTimeout(ok, 2500); }
  });

  // ------------------------------------------------------------ 小工具
  FB.$ = (s, el) => (el || document).querySelector(s);
  FB.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  FB.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  FB.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 畫面自動縮放（html 的 CSS zoom）時，滑鼠座標與 getBoundingClientRect 是螢幕像素，style 的 px 卻會再乘上縮放
  // → 一律換算成縮放後的座標再用
  FB.Z = () => parseFloat(document.documentElement.style.zoom) || 1;
  FB.rect = (el) => { const r = el.getBoundingClientRect(), z = FB.Z(); return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z }; };
  FB.cx = (e) => e.clientX / FB.Z();
  FB.cy = (e) => e.clientY / FB.Z();
  FB.fmtTime = (t, ms) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 10);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + (ms ? '.' + f : '');
  };
  FB.fmtSize = (n) => (n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB');

  // 提示訊息
  FB.toast = function (msg, kind) {
    let box = FB.$('#toasts');
    if (!box) { box = FB.h('div', { id: 'toasts' }); document.body.append(box); }
    const t = FB.h('div', { class: 'toast ' + (kind || '') }, msg);
    box.append(t);
    setTimeout(() => t.classList.add('out'), kind === 'err' ? 6000 : 3000);
    setTimeout(() => t.remove(), kind === 'err' ? 6600 : 3600);
  };
  FB.err = (e) => { console.error(e); FB.toast(e && e.message ? e.message : String(e), 'err'); };

  // 對話框：FB.dialog({title, body(元素), buttons:[{label, primary, value, onClick}]}) → Promise(value)
  FB.dialog = function (o) {
    return new Promise((resolve) => {
      const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape' && o.esc !== false) close(null); };
      const btns = (o.buttons || [{ label: '確定', primary: true, value: true }]).map((b) =>
        FB.h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: async () => {
          if (b.onClick) { try { const r = await b.onClick(); if (r === false) return; if (r !== undefined) return close(r); } catch (e) { return FB.err(e); } }
          close(b.value !== undefined ? b.value : b.label);
        } }, b.label));
      const box = FB.h('div', { class: 'dlg ' + (o.cls || ''), style: o.width ? { width: o.width } : null },
        FB.h('div', { class: 'dlg-head' }, FB.h('span', {}, o.title || ''), FB.h('button', { class: 'x', title: '關閉', onclick: () => close(null) }, '✕')),
        FB.h('div', { class: 'dlg-body' }, o.body || ''),
        btns.length ? FB.h('div', { class: 'dlg-foot' }, btns) : null);
      const wrap = FB.h('div', { class: 'dlg-wrap' }, box);
      document.body.append(wrap);
      document.addEventListener('keydown', onKey);
      const f = box.querySelector('input,select,textarea');
      if (f) setTimeout(() => f.focus(), 30);
      if (o.onOpen) o.onOpen(box, close);
    });
  };
  FB.confirm = (msg, okLabel, danger) => FB.dialog({ title: '請確認', body: FB.h('p', {}, msg), buttons: [{ label: '取消', value: false }, { label: okLabel || '確定', primary: true, danger, value: true }] });
  FB.prompt = (title, value, label) => {
    const inp = FB.h('input', { class: 'inp', value: value || '' });
    return FB.dialog({ title, body: FB.h('label', { class: 'fld' }, label || '', inp), buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, onClick: () => inp.value.trim() || false }],
      onOpen: () => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.closest('.dlg').querySelector('.btn.primary').click(); }) });
  };
  FB.busy = function (msg) {
    const el = FB.h('div', { class: 'busy' }, FB.h('div', { class: 'busy-box' }, FB.h('div', { class: 'spinner' }), FB.h('div', { class: 'busy-msg' }, msg || '處理中…')));
    document.body.append(el);
    return { set: (m) => (el.querySelector('.busy-msg').textContent = m), close: () => el.remove() };
  };

  // 下拉選單：FB.selectEl([值, 文字], …, 目前值, onchange)
  FB.selectEl = function (...args) {
    const onchange = args.pop(), value = args.pop();
    const s = FB.h('select', { class: 'inp' }, args.map(([v, t]) => FB.h('option', { value: v }, t)));
    s.value = value;
    s.addEventListener('change', () => onchange(s.value));
    return s;
  };

  // 簡單事件
  const L = {};
  FB.on = (n, f) => (L[n] = L[n] || []).push(f);
  FB.emit = (n, d) => (L[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });
})();
