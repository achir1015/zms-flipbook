/* 電子書閱讀器：工具列、縮圖、目錄、搜尋、書籤、放大鏡、朗讀（可選性別年齡）、眼控（凝視停留點擊）、
 * 頁面上的連結／影片／聲音／文字／圖片／圖形／按鈕／QR 碼、自動翻頁、背景音樂、列印、分享、密碼。
 * 程式內預覽、發佈出去的網頁、線上版、手機版都用這一份。
 *
 * FB.Reader.mount(容器, book, opts) → reader
 *   book = { id, title, pages:[{asset|src, thumb, w, h, text, runs, items, speak, audio}], toc, settings, assets:{id:路徑} }
 *   opts = { url(id)→網址, tts(text, voice, speed)→Promise<網址|null>, narration, voices, pref, savePref(p), embedded, onPage(i), onClose }
 */
(function () {
  const FB = (window.FB = window.FB || {});
  const Z = () => (FB.Z && FB.Z()) || 1;

  // ------------------------------------------------------------ 小工具
  function h(tag, attrs, ...kids) {
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
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IC = { // 線條圖示（自己畫的 SVG）
    zin: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M10 7v6M7 10h6"/></svg>',
    zout: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M7 10h6"/></svg>',
    first: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 5l-8 7 8 7"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-8 7 8 7"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 5l8 7-8 7"/></svg>',
    last: '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l8 7-8 7"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M12 17.5v.1"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
    toc: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1"/></svg>',
    mark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-5-6 5z"/></svg>',
    lens: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11a3 3 0 0 1 3-3"/></svg>',
    read: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 4v16M17 4v16"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    aL: '<svg viewBox="0 0 34 60"><path d="M28 4L6 30l22 26"/></svg>',
    aR: '<svg viewBox="0 0 34 60"><path d="M6 4l22 26L6 56"/></svg>',
  };

  // 背景主題（範本）：經典木紋、深色、淺色……；scene＝會動的背景
  const THEMES = {
    wood: { name: '經典木紋', cls: 'wood', bar: 'rgba(15,15,15,.9)' },
    night: { name: '深夜藍', bg: 'radial-gradient(ellipse at center, #34507a 0%, #16233a 70%)', bar: 'rgba(10,18,32,.9)' },
    gray: { name: '簡約灰', bg: 'linear-gradient(#5b616b, #2f343b)', bar: 'rgba(20,22,26,.9)' },
    light: { name: '明亮白', bg: 'linear-gradient(#f4f5f7, #d9dde3)', bar: 'rgba(60,64,72,.92)' },
    paper: { name: '牛皮紙', bg: 'radial-gradient(ellipse at center, #d9c4a0 0%, #a98b5f 80%)', bar: 'rgba(70,50,30,.92)' },
    green: { name: '森林綠', bg: 'radial-gradient(ellipse at center, #4f8a62 0%, #1e3b2a 75%)', bar: 'rgba(16,36,24,.9)' },
    pink: { name: '粉紅花語', bg: 'radial-gradient(ellipse at center, #f6c9d8 0%, #c9728f 85%)', bar: 'rgba(90,30,50,.9)' },
    sea: { name: '海洋藍', bg: 'linear-gradient(160deg, #6fc3df, #1d5f8c)', bar: 'rgba(10,40,64,.9)' },
    sunset: { name: '夕陽橘', bg: 'linear-gradient(160deg, #ffb36b, #b8476a)', bar: 'rgba(70,24,30,.9)' },
    custom: { name: '自訂顏色' },
  };
  const SCENES = { none: '無', snow: '雪花', stars: '星空閃爍', bubbles: '泡泡', petals: '花瓣飄落', leaves: '落葉', hearts: '愛心' };
  FB.THEMES = THEMES; FB.SCENES = SCENES;
  FB.defaultSettings = () => ({ theme: 'wood', scene: 'none', bg1: '#3a4a5c', bg2: '#1b2430', bgImage: null, bar: 'top', layout: 'auto',
    rtl: false, hard: false, flipTime: 0.8, flipSound: true, music: null, musicLoop: true, autoplay: 4, autoLoop: false, center: true,
    logo: null, logoUrl: '', showTitle: true, linkHl: true, wheel: true, startPage: 1, pwHash: '', downloadUrl: '', paper: '#ffffff',
    btn: { zoom: 1, first: 1, print: 1, mail: 1, help: 1, full: 1, thumbs: 1, toc: 1, search: 1, mark: 1, lens: 1, read: 1, eye: 1, auto: 1, sound: 1, share: 1, download: 1 } });

  // 小 SHA-256（密碼保護用；file:// 也能用）
  function sha256(s) {
    const K = [], H = [];
    let n = 2, c = 0;
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0;
    while (c < 64) { let p = true; for (let f = 2; f * f <= n; f++) if (n % f === 0) { p = false; break; } if (p) { if (c < 8) H[c] = frac(Math.pow(n, 1 / 2)); K[c] = frac(Math.pow(n, 1 / 3)); c++; } n++; }
    const bytes = Array.from(new TextEncoder().encode(s));
    const l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    const r = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, cc, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, cc, d, e, f, g, hh].forEach((v, i) => (H[i] = (H[i] + v) | 0));
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  FB.sha256 = sha256;

  // 句子切分（朗讀用）：句號、問號、驚嘆號、分號、換行；太長的再用逗號切
  function sentences(text) {
    const out = [];
    // 不用 regex lookbehind（舊版 iPhone Safari 不支援，整頁會掛掉）
    const parts = String(text || '').replace(/\r/g, '').replace(/([。！？!?；;\n])/g, '$1\u0001').replace(/(\.\s)/g, '$1\u0001').split('\u0001');
    for (let p of parts) {
      p = p.replace(/\s+/g, ' ').trim();
      if (!p || !/[\p{L}\p{N}]/u.test(p)) continue;
      while (p.length > 110) {
        let k = Math.max(p.lastIndexOf('，', 100), p.lastIndexOf(',', 100), p.lastIndexOf('、', 100), p.lastIndexOf(' ', 100));
        if (k < 30) k = 100;
        out.push(p.slice(0, k + 1)); p = p.slice(k + 1).trim();
      }
      if (p) out.push(p);
    }
    return out;
  }
  FB.sentences = sentences;
  FB._ttsWait = {};
  window.__zmsTtsDone = (id) => { const f = FB._ttsWait[id]; if (f) f(); };

  // ================================================================ 閱讀器
  class Reader {
    constructor(root, book, opts) {
      this.root = root; this.book = book; this.o = opts || {};
      this.s = Object.assign(FB.defaultSettings(), book.settings || {});
      this.s.btn = Object.assign(FB.defaultSettings().btn, (book.settings || {}).btn || {});
      this.pages = book.pages || [];
      this.imgs = {}; this.thumbImgs = {};
      this.pref = Object.assign({ voice: 'f-adult', speed: 1, dwell: 1.2, lensZoom: 2.5, lensSize: 260, autoTurn: true, contrast: 'normal', bigUi: false }, this.o.pref || {});
      this.build();
    }
    url(x) {
      if (x === null || x === undefined || x === '') return '';
      if (typeof x === 'number') return this.o.url ? this.o.url(x) : (this.book.assets && this.book.assets[x]) || '';
      return x;
    }
    img(i) {
      if (i < 0 || i >= this.pages.length) return null;
      let im = this.imgs[i];
      if (!im) {
        im = this.imgs[i] = new Image();
        im.decoding = 'async';
        im.onload = () => { if (this.fl && !this.fl.anim) this.fl.draw(); };
        im.src = this.url(this.pages[i].asset ?? this.pages[i].src);
      }
      return im;
    }
    preload() {
      const v = this.fl.visiblePages();
      const a = Math.min(...v, 999999), b = Math.max(...v, -1);
      for (let i = a - 4; i <= b + 6; i++) this.img(i);
    }
    savePref(p) { Object.assign(this.pref, p); if (this.o.savePref) this.o.savePref(p); else try { localStorage.setItem('fbr_pref', JSON.stringify(this.pref)); } catch (e) { /* */ } }
    say(msg) {
      const m = h('div', { class: 'fbr-msg' }, msg);
      this.el.append(m); setTimeout(() => m.remove(), 2200);
    }

    // ------------------------------------------------------------ 畫面
    build() {
      const s = this.s, B = s.btn;
      this.root.innerHTML = '';
      const el = (this.el = h('div', { class: 'fbr' + (s.bar === 'bottom' ? ' bar-bottom' : '') + (s.bar === 'none' ? ' no-bar' : '') }));
      this.root.append(el);
      // 背景
      const th = THEMES[s.theme] || THEMES.wood;
      const bg = h('div', { class: 'fbr-bg ' + (th.cls || '') });
      if (s.bgImage) Object.assign(bg.style, { backgroundImage: 'url("' + this.url(s.bgImage) + '")', backgroundSize: 'cover', backgroundPosition: 'center' });
      else if (s.theme === 'custom') bg.style.background = 'radial-gradient(ellipse at center, ' + s.bg1 + ' 0%, ' + s.bg2 + ' 80%)';
      else if (th.bg) bg.style.background = th.bg;
      if (th.bar) el.style.setProperty('--bar', th.bar);
      el.append(bg);
      this.sceneCv = h('canvas', { class: 'fbr-scene' });
      el.append(this.sceneCv);
      // 書
      this.stage = h('div', { class: 'fbr-stage' });
      this.cv = h('canvas', { class: 'fbr-cv' });
      this.layer = h('div', { class: 'fbr-layer' });
      this.stage.append(this.cv, this.layer);
      el.append(this.stage);
      // 左右大箭頭、眼控翻頁區
      this.aL = h('button', { class: 'fbr-arrow l', title: '上一頁', html: IC.aL, onclick: () => this.fl.flip(this.s.rtl ? 1 : -1) });
      this.aR = h('button', { class: 'fbr-arrow r', title: '下一頁', html: IC.aR, onclick: () => this.fl.flip(this.s.rtl ? -1 : 1) });
      this.zL = h('div', { class: 'fbr-zone l', 'data-dwell': 'flip', onclick: () => this.fl.flip(this.s.rtl ? 1 : -1) }, '‹', h('small', {}, '上一頁'));
      this.zR = h('div', { class: 'fbr-zone r', 'data-dwell': 'flip', onclick: () => this.fl.flip(this.s.rtl ? -1 : 1) }, '›', h('small', {}, '下一頁'));
      if (this.s.rtl) { this.zL.querySelector('small').textContent = '下一頁'; this.zR.querySelector('small').textContent = '上一頁'; }
      el.append(this.aL, this.aR, this.zL, this.zR);
      // 上方工具列（照 FlipBuilder 經典版面：置中）
      const b = (key, ic, tip, fn) => (B[key] === 0 ? null : h('button', { class: 'fbr-b', 'data-k': key, 'data-dwell': '1', title: tip, html: IC[ic], onclick: fn }));
      this.pgInp = h('input', { class: 'fbr-pg', title: '輸入頁碼後按 Enter', onkeydown: (e) => { if (e.key === 'Enter') { this.goto(parseInt(this.pgInp.value, 10) - 1); this.pgInp.blur(); } } });
      const top = h('div', { class: 'fbr-top' },
        b('zoom', 'zin', '放大', () => this.zoomBy(1)), b('zoom', 'zout', '縮小', () => this.zoomBy(-1)),
        b('first', 'first', '第一頁', () => this.goto(0)), b('first', 'prev', '上一頁', () => this.fl.prev()),
        this.pgInp,
        b('first', 'next', '下一頁', () => this.fl.next()), b('first', 'last', '最後一頁', () => this.goto(this.pages.length - 1)),
        b('lens', 'lens', '放大鏡', () => this.toggleLens()),
        b('read', 'read', '朗讀（自然人聲）', () => this.panel('read')),
        b('eye', 'eye', '眼控模式（眼動鼠：注視就能按）', () => this.panel('eye')),
        b('print', 'print', '列印', () => this.print()),
        b('mail', 'mail', '用 Email 分享', () => this.mail()),
        this.s.downloadUrl ? b('download', 'down', '下載', () => window.open(this.url(this.s.downloadUrl), '_blank')) : null,
        b('help', 'help', '使用說明', () => this.help()),
        b('full', 'full', '全螢幕', () => this.fullscreen()));
      if (s.logo || (s.showTitle && this.book.title)) {
        const lg = h(s.logoUrl ? 'a' : 'div', { class: 'fbr-logo', href: s.logoUrl || null, target: '_blank' },
          s.logo ? h('img', { src: this.url(s.logo), alt: '' }) : null, s.showTitle ? this.book.title || '' : '');
        top.append(lg);
      }
      if (s.bar !== 'none') el.append(top);
      // 下方列
      const t = (key, ic, label, fn) => (B[key] === 0 ? null : h('button', { class: 'fbr-t', 'data-k': key, 'data-dwell': '1', onclick: fn, html: IC[ic].replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"') + esc(label) }));
      this.bot = h('div', { class: 'fbr-bot' },
        t('thumbs', 'grid', '縮圖', () => this.panel('thumbs')),
        (this.book.toc && this.book.toc.length) ? t('toc', 'toc', '目錄', () => this.panel('toc')) : null,
        t('search', 'search', '搜尋', () => this.panel('search')),
        t('mark', 'mark', '書籤', () => this.panel('mark')),
        h('div', { class: 'sp' }),
        t('auto', 'play', '自動翻頁', () => this.toggleAuto()),
        t('sound', s.flipSound ? 'sound' : 'mute', '聲音', () => this.toggleSound()),
        t('share', 'share', '分享', () => this.share()));
      if (s.bar !== 'none') el.append(this.bot);
      // 面板、字幕、放大鏡、眼控圓圈
      this.panels = {};
      this.cap = h('div', { class: 'fbr-cap' });
      this.lens = h('canvas', { class: 'fbr-lens' });
      this.ring = h('div', { class: 'fbr-ring', html: '<svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="163.4" stroke-dashoffset="163.4"/></svg>' });
      el.append(this.cap, this.lens, this.ring);
      this.applyContrast();
      // 翻頁引擎
      const p0 = this.pages[0] || { w: 595, h: 842 };
      this.fl = new FB.Flip(this.cv, {
        count: this.pages.length, aspect: (p0.w || 595) / (p0.h || 842), image: (i) => this.img(i),
        single: this.isSingle(), rtl: !!s.rtl, hard: !!s.hard, duration: +s.flipTime || 0.8, center: s.center !== false,
        wheel: s.wheel !== false, paper: s.paper || '#fff', sound: () => this.flipSound(),
        onChange: () => this.changed(), onFlipStart: () => { this.layer.style.visibility = 'hidden'; this.stopMedia(); },
        onFlipEnd: () => { this.layer.style.visibility = ''; this.renderLayer(); },
        onDraw: () => { if (!this.fl || !this.fl.anim) this.renderLayer(); },
        onTap: () => { if (this.lensOn) return false; },
      });
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.stage);
      this.bindKeys();
      this.bindGaze();
      this.bindLens();
      this.startScene();
      if (s.music) { this.music = new Audio(this.url(s.music)); this.music.loop = s.musicLoop !== false; this.music.volume = 0.5; }
      const sp = Math.max(0, Math.min(this.pages.length - 1, (this.o.startPage ?? (s.startPage || 1) - 1)));
      this.fl.spread = this.fl.spreadOf(sp);
      this.changed();
      if (this.pref.gaze) this.setGaze(true);
      if (s.pwHash && !this.o.embedded) this.lock();
    }
    isSingle() {
      const L = this.s.layout;
      if (L === 'single') return true;
      if (L === 'double') return false;
      const r = this.stage ? this.stage.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
      const p0 = this.pages[0] || { w: 595, h: 842 };
      return r.width / Math.max(1, r.height) < ((p0.w || 595) / (p0.h || 842)) * 1.35;   // 直式螢幕（手機）自動單頁
    }
    resize() {
      if (!this.fl) return;
      const single = this.isSingle();
      if (single !== this.fl.o.single) {
        const page = this.fl.visiblePages()[0] || 0;
        this.fl.o.single = single;
        this.fl.spread = this.fl.spreadOf(page);
      }
      this.fl.resize();
      this.sizeScene();
      // 視窗太窄時，書名會壓到置中的工具列 → 先藏起來
      const lg = this.el.querySelector('.fbr-logo');
      if (lg) lg.style.display = this.el.clientWidth < 1060 && !this.s.logo ? 'none' : '';
    }
    changed() {
      const v = this.fl.visiblePages();
      const n = this.pages.length;
      this.pgInp.value = v.length ? (v.length > 1 ? v[0] + 1 + '-' + (v[1] + 1) : v[0] + 1) + ' / ' + n : '';
      const atStart = this.fl.spread <= 0, atEnd = this.fl.spread >= this.fl.spreads() - 1;
      this.aL.disabled = this.s.rtl ? atEnd : atStart;
      this.aR.disabled = this.s.rtl ? atStart : atEnd;
      this.preload();
      this.renderLayer();
      if (this.panels.thumbs && this.panels.thumbs.classList.contains('show')) this.markThumb();
      if (this.o.onPage) this.o.onPage(v[0] || 0);
      // 自動播放頁面上的聲音
      for (const i of v) for (const it of (this.pages[i].items || [])) if (it.type === 'audio' && it.autoplay) this.playAudio(it);
      if (this.reading && !this.readFlipping) this.readStop();
    }
    goto(i) {
      if (isNaN(i)) return;
      i = Math.max(0, Math.min(this.pages.length - 1, i));
      this.fl.goto(i);
    }
    zoomBy(d) {
      const z = this.fl.zoom;
      const nz = d > 0 ? Math.min(4, z * 1.5) : Math.max(1, z / 1.5);
      this.fl.setZoom(nz < 1.05 ? 1 : nz);
      this.cv.style.cursor = this.fl.zoom > 1 ? 'grab' : 'default';
    }
    fullscreen() {
      if (this.o.fullscreen) return this.o.fullscreen();
      const d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (this.root.requestFullscreen || this.root.webkitRequestFullscreen || (() => 0)).call(this.root);
    }
    applyContrast() {
      const c = this.pref.contrast;
      this.cv.style.filter = c === 'high' ? 'contrast(1.6) saturate(0.6)' : c === 'invert' ? 'invert(1) hue-rotate(180deg)' : c === 'warm' ? 'sepia(0.35) brightness(0.97)' : '';
    }

    // ------------------------------------------------------------ 頁面上的元素
    renderLayer() {
      const L = this.layer;
      if (!this.fl || this.fl.anim) return;
      const rects = this.fl.pageRects();
      const key = JSON.stringify(rects) + '|' + (this.hlKey || '');
      if (key === this._layerKey) return;
      this._layerKey = key;
      this.stopMedia();
      L.innerHTML = '';
      for (const k in rects) {
        const i = +k, r = rects[k], pg = this.pages[i];
        const box = h('div', { class: 'fbr-page', style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } });
        for (const it of pg.items || []) { const e = this.itemEl(it, r, i); if (e) box.append(e); }
        // 搜尋或朗讀的黃色標示
        for (const m of this.highlights || []) if (m.page === i) for (const q of m.boxes) box.append(h('div', { class: 'fbr-hl' + (m.read ? ' read' : ''), style: { left: q[0] * 100 + '%', top: q[1] * 100 + '%', width: q[2] * 100 + '%', height: q[3] * 100 + '%' } }));
        L.append(box);
      }
    }
    itemEl(it, r, pageIdx) {
      const W = r.w, H = r.h;
      const st = { left: it.x * 100 + '%', top: it.y * 100 + '%', width: it.w * 100 + '%', height: it.h * 100 + '%', opacity: it.opacity ?? 1 };
      if (it.rot) st.transform = 'rotate(' + it.rot + 'deg)';
      let e;
      const fs = (k) => Math.max(6, (k || 0.03) * H) + 'px';
      switch (it.type) {
        case 'link':
          e = h('div', { class: 'fbr-it link act' + (this.s.linkHl !== false && it.hl !== false ? ' hl' : ''), title: it.tip || '' });
          break;
        case 'text':
          e = h('div', { class: 'fbr-it' }, h('div', { class: 'txt', style: { fontSize: fs(it.size), color: it.color || '#222', background: it.bg || 'transparent', fontWeight: it.bold ? 'bold' : 'normal', fontStyle: it.italic ? 'italic' : 'normal', textAlign: it.align || 'left', fontFamily: it.font || 'inherit', padding: (it.bg ? 0.2 : 0) + 'em', borderRadius: '4px' } }, it.text || ''));
          break;
        case 'image':
          e = h('div', { class: 'fbr-it' }, h('img', { src: this.url(it.asset ?? it.src), alt: it.tip || '', style: { objectFit: it.fit || 'contain' }, draggable: 'false' }));
          break;
        case 'video': {
          e = h('div', { class: 'fbr-it' });
          const yt = FB.videoEmbed(it.src, it.autoplay);
          if (yt) e.append(h('iframe', { src: yt, allow: 'autoplay; fullscreen; encrypted-media', allowfullscreen: true }));
          else { const v = h('video', { src: this.url(it.asset ?? it.src), controls: true, playsinline: true, preload: 'metadata', poster: it.poster ? this.url(it.poster) : null }); v.style.background = '#000'; if (it.autoplay) { v.muted = true; v.autoplay = true; } if (it.loop) v.loop = true; e.append(v); }
          break;
        }
        case 'audio':
          e = h('div', { class: 'fbr-it act', title: it.tip || '播放聲音' }, it.hidden ? '' : h('div', { class: 'aud', style: { fontSize: Math.min(it.w * W, it.h * H) * 0.55 + 'px' } }, '🔊'));
          e.addEventListener('click', (ev) => { ev.stopPropagation(); this.playAudio(it, true); });
          break;
        case 'shape':
          e = h('div', { class: 'fbr-it', html: FB.shapeSVG(it) });
          break;
        case 'button':
          e = h('div', { class: 'fbr-it act' }, h('button', { class: 'btn', style: { background: it.bg || '#ff9800', color: it.color || '#fff', fontSize: fs(it.size || 0.028) } }, it.text || '按鈕'));
          break;
        case 'qr': {
          e = h('div', { class: 'fbr-it' + (it.action ? ' act' : '') });
          if (window.qrcode) { try { const q = window.qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(it.text || ''))); q.make(); e.innerHTML = q.createSvgTag({ scalable: true, margin: 2 }); e.firstChild.style.background = '#fff'; } catch (x) { /* */ } }
          break;
        }
        default: return null;
      }
      Object.assign(e.style, st);
      if (it.anim && it.anim !== 'none') e.animate(FB.ANIMS[it.anim] || FB.ANIMS.fade, { duration: (it.animDur || 0.8) * 1000, delay: (it.animDelay || 0) * 1000, fill: 'both', easing: 'ease-out' });
      const act = it.action || (it.type === 'link' ? it.link : null);
      if (act && act.kind) {
        e.classList.add('act');
        e.setAttribute('data-dwell', '1');
        e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        e.addEventListener('click', (ev) => { ev.stopPropagation(); this.doAction(act, e); });
      } else if (['video', 'button', 'image', 'text', 'qr'].includes(it.type)) e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      return e;
    }
    doAction(a, el) {
      const v = a.value || '';
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 400); }
      switch (a.kind) {
        case 'url': if (v) window.open(/^[a-z]+:/i.test(v) ? v : 'https://' + v, a.target === 'self' ? '_self' : '_blank', 'noopener'); break;
        case 'page': this.goto((parseInt(v, 10) || 1) - 1); break;
        case 'tel': location.href = 'tel:' + v.replace(/[^\d+#*]/g, ''); break;
        case 'mail': location.href = 'mailto:' + v; break;
        case 'popup': this.popup('web', v); break;
        case 'image': this.popup('img', this.url(a.asset ?? v)); break;
        case 'video': this.popup('video', a.asset ? this.url(a.asset) : v); break;
        case 'audio': this.playAudio({ asset: a.asset, src: v }, true); break;
        case 'read': this.readStart(); break;
      }
    }
    popup(kind, src) {
      if (!src) return;
      const box = h('div', { class: 'box' + (kind === 'img' ? ' img' : '') });
      const close = () => w.remove();
      const w = h('div', { class: 'fbr-pop', onclick: (e) => { if (e.target === w) close(); } }, box);
      box.append(h('button', { class: 'close', 'data-dwell': '1', onclick: close }, '✕'));
      if (kind === 'img') box.append(h('img', { src }));
      else if (kind === 'video') { const yt = FB.videoEmbed(src, true); box.append(yt ? h('iframe', { src: yt, allow: 'autoplay; fullscreen', allowfullscreen: true }) : h('video', { src, controls: true, autoplay: true })); }
      else box.append(h('iframe', { src: /^[a-z]+:/i.test(src) ? src : 'https://' + src }));
      this.el.append(w);
    }
    playAudio(it, toggle) {
      const src = this.url(it.asset ?? it.src);
      if (!src) return;
      if (this.pageAudio && this.pageAudio._src === src) { if (toggle) { if (this.pageAudio.paused) this.pageAudio.play(); else this.pageAudio.pause(); } return; }
      if (this.pageAudio) this.pageAudio.pause();
      this.pageAudio = new Audio(src); this.pageAudio._src = src;
      this.pageAudio.play().catch(() => 0);
    }
    stopMedia() {
      if (this.pageAudio) { this.pageAudio.pause(); this.pageAudio = null; }
      this.layer.querySelectorAll('video').forEach((v) => v.pause());
    }

    // ------------------------------------------------------------ 聲音、自動翻頁
    flipSound() {
      if (!this.s.flipSound) return;
      try {
        const A = window.AudioContext || window.webkitAudioContext;
        const ac = (FB._ac = FB._ac || new A());
        const len = 0.32, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * t), 2) * (0.5 + 0.5 * Math.sin(t * 40)); }
        const src = ac.createBufferSource(); src.buffer = buf;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
        const g = ac.createGain(); g.gain.value = 0.35;
        src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
      } catch (e) { /* 沒有聲音裝置 */ }
    }
    toggleSound() {
      this.s.flipSound = !this.s.flipSound;
      const btn = this.bot.querySelector('[data-k=sound]');
      if (btn) btn.innerHTML = IC[this.s.flipSound ? 'sound' : 'mute'].replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"') + '聲音';
      if (this.music) { if (this.s.flipSound) this.music.play().catch(() => 0); else this.music.pause(); }
      this.say(this.s.flipSound ? '聲音：開' : '聲音：關');
    }
    toggleAuto(on) {
      on = on === undefined ? !this.autoT : on;
      clearInterval(this.autoT); this.autoT = null;
      const btn = this.bot && this.bot.querySelector('[data-k=auto]');
      if (on) {
        this.autoT = setInterval(() => {
          if (this.reading) return;
          if (!this.fl.next()) { if (this.s.autoLoop) this.goto(0); else this.toggleAuto(false); }
        }, Math.max(1.5, +this.s.autoplay || 4) * 1000);
        if (this.music && this.s.flipSound) this.music.play().catch(() => 0);
      }
      if (btn) btn.classList.toggle('on', !!on);
      this.say(on ? '自動翻頁：開始' : '自動翻頁：停止');
    }

    // ------------------------------------------------------------ 面板
    panel(name) {
      const cur = this.panels[name];
      for (const k in this.panels) if (k !== name) this.panels[k].classList.remove('show');
      if (cur && cur.classList.contains('show')) { cur.classList.remove('show'); return; }
      const p = cur || (this.panels[name] = this['build_' + name]());
      p.classList.add('show');
      if (p.onShow) p.onShow();
    }
    shell(cls, title) {
      const p = h('div', { class: 'fbr-panel ' + cls }, h('h3', {}, title, h('button', { class: 'x', 'data-dwell': '1', onclick: () => p.classList.remove('show') }, '✕')));
      const body = h('div', { class: 'fbr-body' });
      p.append(body); p.body = body;
      this.el.append(p);
      return p;
    }
    build_thumbs() {
      const p = this.shell('fbr-thumbs', '縮圖');
      p.onShow = () => {
        p.body.innerHTML = '';
        const groups = [];
        for (let k = 0; k < this.fl.spreads(); k++) { const q = this.fl.pagesOf(k); groups.push({ k, pages: [q.A, q.B].filter((x) => x >= 0).sort((a, b) => (this.s.rtl ? b - a : a - b)) }); }
        for (const g of groups) {
          const pair = h('div', { class: 'pair' }, g.pages.map((i) => { const pg = this.pages[i]; return h('img', { src: this.url(pg.thumb ?? pg.asset ?? pg.src), loading: 'lazy', alt: '' }); }));
          p.body.append(h('div', { class: 'fbr-th', 'data-k': g.k, 'data-dwell': '1', onclick: () => this.goto(g.pages[0]) }, pair, g.pages.map((i) => i + 1).join('-')));
        }
        this.markThumb();
      };
      return p;
    }
    markThumb() {
      const p = this.panels.thumbs;
      if (!p) return;
      p.body.querySelectorAll('.fbr-th').forEach((t) => {
        const on = +t.dataset.k === this.fl.spread;
        t.classList.toggle('cur', on);
        if (on) t.scrollIntoView({ inline: 'center', block: 'nearest' });
      });
    }
    build_toc() {
      const p = this.shell('fbr-side fbr-toc', '目錄');
      const add = (list, depth) => {
        for (const t of list || []) {
          p.body.append(h('a', { class: depth ? 'sub' : '', style: { paddingLeft: 8 + depth * 16 + 'px' }, 'data-dwell': '1', onclick: () => this.goto((t.page || 1) - 1) }, t.title || '', h('small', {}, String(t.page || ''))));
          add(t.children, depth + 1);
        }
      };
      add(this.book.toc, 0);
      return p;
    }
    build_search() {
      const p = this.shell('fbr-side fbr-search', '搜尋');
      const inp = h('input', { placeholder: '輸入要找的文字…', onkeydown: (e) => { if (e.key === 'Enter') run(); } });
      const res = h('div');
      p.body.append(inp, res);
      const run = () => {
        const q = inp.value.trim();
        res.innerHTML = '';
        this.highlights = [];
        if (q.length < 1) return;
        const ql = q.toLowerCase();
        let n = 0;
        this.pages.forEach((pg, i) => {
          const t = pg.text || '';
          let at = t.toLowerCase().indexOf(ql);
          if (at < 0) return;
          const boxes = this.boxesFor(pg, at, q.length);
          this.highlights.push({ page: i, boxes });
          let cnt = 0;
          while (at >= 0 && cnt < 3) {
            const a = Math.max(0, at - 18), snip = t.slice(a, at) + '\u0000' + t.slice(at, at + q.length) + '\u0001' + t.slice(at + q.length, at + q.length + 26);
            res.append(h('div', { class: 'fbr-res', 'data-dwell': '1', onclick: () => this.goto(i), html: '<b>第 ' + (i + 1) + ' 頁</b>　' + esc(snip).replace('\u0000', '<mark>').replace('\u0001', '</mark>') }));
            at = t.toLowerCase().indexOf(ql, at + q.length); cnt++; n++;
          }
        });
        if (!n) res.append(h('div', { class: 'fbr-note' }, '找不到「' + q + '」' + (this.pages.some((x) => x.text) ? '' : '（這本書的頁面是圖片，沒有文字可以搜尋）')));
        this.hlKey = 's' + q; this._layerKey = ''; this.renderLayer();
      };
      p.onShow = () => setTimeout(() => inp.focus(), 50);
      return p;
    }
    // 文字範圍 → 頁面上的方框（pdf 匯入時記下每一段文字的位置 runs:[[字串,x,y,w,h],…]）
    boxesFor(pg, at, len) {
      const out = [];
      let pos = 0;
      for (const r of pg.runs || []) {
        const s = r[0] || '', a = pos, b = pos + s.length;
        if (b > at && a < at + len && s.length) {
          const f0 = Math.max(0, (at - a) / s.length), f1 = Math.min(1, (at + len - a) / s.length);
          out.push([r[1] + r[3] * f0, r[2], r[3] * (f1 - f0), r[4]]);
        }
        pos = b + (r[5] ? 1 : 0);   // r[5]＝這一段後面接換行
      }
      return out;
    }
    build_mark() {
      const p = this.shell('fbr-side', '書籤');
      const key = 'fbr_marks_' + (this.book.id || this.book.title || '');
      const load = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } };
      const save = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* */ } };
      p.onShow = () => {
        p.body.innerHTML = '';
        const marks = load();
        p.body.append(h('button', { class: 'fbr-bigbtn', 'data-dwell': '1', onclick: () => { const i = this.fl.visiblePages()[0] || 0; if (!marks.includes(i)) { marks.push(i); marks.sort((a, b) => a - b); save(marks); } p.onShow(); } }, '＋ 把這一頁加入書籤'));
        if (!marks.length) p.body.append(h('div', { class: 'fbr-note' }, '還沒有書籤。'));
        for (const i of marks) p.body.append(h('div', { class: 'fbr-res', 'data-dwell': '1', onclick: () => this.goto(i) }, '🔖 第 ' + (i + 1) + ' 頁 ', h('span', { style: { float: 'right', color: '#f88' }, onclick: (e) => { e.stopPropagation(); save(marks.filter((x) => x !== i)); p.onShow(); } }, '刪除')));
      };
      return p;
    }

    // ------------------------------------------------------------ 朗讀（自然人聲，可選性別與年齡）
    build_read() {
      const p = this.shell('fbr-side', '🔊 朗讀這本書');
      const voices = this.o.voices || FB.VOICES;
      const sel = h('select', { onchange: () => { this.savePref({ voice: sel.value }); if (this.reading) this.readStart(); } },
        ['女', '男'].map((g) => h('optgroup', { label: g === '女' ? '女聲' : '男聲' }, voices.filter((v) => v.gender === g).map((v) => h('option', { value: v.id, selected: v.id === this.pref.voice ? true : null }, v.name)))));
      const sp = h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.1, value: this.pref.speed, oninput: () => { spv.textContent = (+sp.value).toFixed(1) + ' 倍'; }, onchange: () => this.savePref({ speed: +sp.value }) });
      const spv = h('span', {}, (+this.pref.speed).toFixed(1) + ' 倍');
      const auto = h('input', { type: 'checkbox', checked: this.pref.autoTurn ? true : null, onchange: () => this.savePref({ autoTurn: auto.checked }) });
      const capBox = h('input', { type: 'checkbox', checked: this.pref.caption !== false ? true : null, onchange: () => { this.savePref({ caption: capBox.checked }); if (!capBox.checked) this.cap.classList.remove('show'); } });
      this.readBtn = h('button', { class: 'fbr-bigbtn', 'data-dwell': '1', onclick: () => (this.reading ? this.readStop() : this.readStart()) }, '▶ 開始朗讀');
      p.body.append(
        h('div', { class: 'fbr-row' }, '聲音', sel),
        h('div', { class: 'fbr-row' }, '速度', sp, spv),
        h('label', { class: 'fbr-row' }, auto, '唸完自動翻到下一頁（不用動手）'),
        h('label', { class: 'fbr-row' }, capBox, '顯示大字幕'),
        h('div', { class: 'fbr-row' }, this.readBtn, h('button', { class: 'fbr-bigbtn ghost', 'data-dwell': '1', onclick: () => this.readStart(true) }, '⏭ 從下一頁唸')),
        h('div', { class: 'fbr-note' }, this.o.tts ? '使用微軟自然人聲（需要網路；唸過的句子會留在電腦裡，下次不用網路）。' : (this.book.narration ? '這本書附有預先錄好的自然人聲。' : '使用這台裝置的語音；Edge 瀏覽器有自然人聲可用。')));
      return p;
    }
    async readStart(fromNext) {
      this.readStop(true);
      if (fromNext && !this.fl.next()) return;
      if (fromNext) await new Promise((r) => setTimeout(r, (this.fl.o.duration || 0.8) * 1000 + 100));
      const me = (this.reading = { stop: false });
      if (this.readBtn) this.readBtn.textContent = '⏸ 停止朗讀';
      this.el.querySelectorAll('[data-k=read]').forEach((b) => b.classList.add('on'));
      while (!me.stop) {
        const pages = this.fl.visiblePages();
        for (const i of pages) {
          if (me.stop) break;
          const pg = this.pages[i];
          if (pg.audio) { await this.playWait(me, this.url(pg.audio)); continue; }   // 這一頁有錄好的旁白
          const text = (pg.speak && pg.speak.trim()) || pg.text || '';
          const ss = sentences(text);
          let pos = 0;
          for (let k = 0; k < ss.length && !me.stop; k++) {
            const t = ss[k];
            const at = text.indexOf(t.slice(0, Math.min(8, t.length)), pos);
            if (at >= 0) pos = at;
            this.showReading(i, pg.speak ? -1 : pos, t);
            const pre = this.narrationFor(i, k, t);
            if (pre) await this.playWait(me, pre);
            else if (this.o.tts) {
              let url = null;
              try { url = await this.o.tts(t, this.pref.voice, this.pref.speed); } catch (e) { this.say(e.message || '語音產生失敗'); }
              if (me.stop) break;
              if (url) { this.prefetch(ss[k + 1]); await this.playWait(me, url); } else await this.speakLocal(me, t);
            } else await this.speakLocal(me, t);
            pos += t.length;
          }
        }
        this.showReading(-1);
        if (me.stop) break;
        if (!this.pref.autoTurn) break;
        this.readFlipping = true;
        const ok = this.fl.next();
        if (!ok) { this.readFlipping = false; break; }
        await new Promise((r) => setTimeout(r, (this.fl.o.duration || 0.8) * 1000 + 250));
        this.readFlipping = false;
      }
      if (this.reading === me) this.readStop();
    }
    prefetch(t) { if (t && this.o.tts) this.o.tts(t, this.pref.voice, this.pref.speed, true).catch(() => 0); }
    narrationFor(i, k, t) {
      const n = this.book.narration;
      if (!n) return null;
      const v = n[this.pref.voice] ? this.pref.voice : Object.keys(n)[0];
      const list = n[v] && n[v][i];
      if (!list) return null;
      const hit = list.find((x) => x.t === t) || list[k];
      return hit ? this.url(hit.src) : null;
    }
    readStop(keep) {
      if (this.reading) this.reading.stop = true;
      this.reading = null;
      if (this.readAudio) { this.readAudio.pause(); this.readAudio.onended && this.readAudio.onended(); this.readAudio = null; }
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (window.ZMSAndroid && window.ZMSAndroid.ttsStop) try { window.ZMSAndroid.ttsStop(); } catch (e) { /* */ }
      if (this._wake) this._wake();
      if (!keep) {
        this.showReading(-1);
        if (this.readBtn) this.readBtn.textContent = '▶ 開始朗讀';
        this.el.querySelectorAll('[data-k=read]').forEach((b) => b.classList.remove('on'));
      }
    }
    playWait(me, url) {
      return new Promise((res) => {
        const a = (this.readAudio = new Audio(url));
        let done = false;
        const fin = () => { if (!done) { done = true; this._wake = null; res(); } };
        this._wake = fin;
        a.onended = fin; a.onerror = fin;
        a.play().catch(fin);
      });
    }
    speakLocal(me, text) {
      // Android App：WebView 沒有網頁語音 → 用手機的文字轉語音
      const A = window.ZMSAndroid;
      if (A && A.ttsSpeak && A.ttsAvailable && A.ttsAvailable()) {
        return new Promise((res) => {
          const id = 't' + Date.now() + Math.random().toString(36).slice(2, 6);
          let done = false;
          const fin = () => { if (!done) { done = true; this._wake = null; delete FB._ttsWait[id]; res(); } };
          FB._ttsWait[id] = fin;
          this._wake = () => { try { A.ttsStop(); } catch (e) { /* */ } fin(); };
          const v = this.pref.voice || '';
          A.ttsSpeak(text, this.pref.speed || 1, /child/.test(v) ? 1.4 : /elder/.test(v) ? 0.8 : /^m-/.test(v) ? 0.9 : 1.05, id);
        });
      }
      return new Promise((res) => {
        if (!window.speechSynthesis) return setTimeout(res, 600);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-TW'; u.rate = this.pref.speed || 1;
        const vs = speechSynthesis.getVoices().filter((x) => /^zh/i.test(x.lang));
        const male = /^m-/.test(this.pref.voice);
        const want = male ? /YunJhe|Yunyang|Yunxi|Zhiwei|male|男/i : /HsiaoChen|HsiaoYu|Xiaoxiao|Hanhan|Yating|female|女/i;
        const v = vs.find((x) => /Natural|Online/i.test(x.name) && want.test(x.name) && /TW/i.test(x.lang)) || vs.find((x) => /Natural|Online/i.test(x.name) && want.test(x.name))
          || vs.find((x) => want.test(x.name) && /TW/i.test(x.lang)) || vs.find((x) => /TW/i.test(x.lang)) || vs[0];
        if (v) u.voice = v;
        if (/child/.test(this.pref.voice)) u.pitch = 1.5; else if (/elder/.test(this.pref.voice)) { u.pitch = 0.75; u.rate *= 0.88; }
        let done = false;
        const fin = () => { if (!done) { done = true; this._wake = null; res(); } };
        this._wake = fin;
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
      });
    }
    showReading(page, at, text) {
      if (page < 0) { this.cap.classList.remove('show'); this.highlights = (this.highlights || []).filter((m) => !m.read); this.hlKey = ''; this._layerKey = ''; this.renderLayer(); return; }
      if (this.pref.caption !== false) { this.cap.textContent = text; this.cap.classList.add('show'); }
      this.highlights = (this.highlights || []).filter((m) => !m.read);
      if (at >= 0) this.highlights.push({ page, read: true, boxes: this.boxesFor(this.pages[page], at, text.length) });
      this.hlKey = 'r' + page + ':' + at; this._layerKey = ''; this.renderLayer();
    }

    // ------------------------------------------------------------ 眼控（眼動鼠：注視停留就等於按一下）
    build_eye() {
      const p = this.shell('fbr-side', '👁 眼控與無障礙');
      const on = h('input', { type: 'checkbox', checked: this.gaze ? true : null, onchange: () => this.setGaze(on.checked) });
      const dw = h('input', { type: 'range', min: 0.5, max: 3, step: 0.1, value: this.pref.dwell, oninput: () => { dv.textContent = (+dw.value).toFixed(1) + ' 秒'; }, onchange: () => this.savePref({ dwell: +dw.value }) });
      const dv = h('span', {}, (+this.pref.dwell).toFixed(1) + ' 秒');
      const lz = h('input', { type: 'range', min: 1.5, max: 5, step: 0.5, value: this.pref.lensZoom, oninput: () => { lv.textContent = lz.value + ' 倍'; this.pref.lensZoom = +lz.value; }, onchange: () => this.savePref({ lensZoom: +lz.value }) });
      const lv = h('span', {}, this.pref.lensZoom + ' 倍');
      const ls = h('input', { type: 'range', min: 160, max: 520, step: 20, value: this.pref.lensSize, onchange: () => this.savePref({ lensSize: +ls.value }) });
      const ct = h('select', { onchange: () => { this.savePref({ contrast: ct.value }); this.applyContrast(); } },
        [['normal', '一般'], ['high', '高對比'], ['invert', '黑底白字（反白）'], ['warm', '護眼暖色']].map(([v, n]) => h('option', { value: v, selected: this.pref.contrast === v ? true : null }, n)));
      p.body.append(
        h('label', { class: 'fbr-row', style: { fontSize: '17px' } }, on, '開啟眼控模式'),
        h('div', { class: 'fbr-note' }, '給使用眼動鼠（Tobii 等）、頭控滑鼠或臥床的讀者：眼睛注視按鈕或兩側的「上一頁／下一頁」大區塊，黃色圓圈轉滿就自動按下去，不用點滑鼠。'),
        h('div', { class: 'fbr-row' }, '注視多久算按下', dw, dv),
        h('div', { class: 'fbr-row' }, h('button', { class: 'fbr-bigbtn', 'data-dwell': '1', onclick: () => this.toggleLens() }, '🔍 放大鏡 開／關')),
        h('div', { class: 'fbr-row' }, '放大倍數', lz, lv),
        h('div', { class: 'fbr-row' }, '放大鏡大小', ls),
        h('div', { class: 'fbr-row' }, '頁面顯示', ct),
        h('div', { class: 'fbr-row' }, h('button', { class: 'fbr-bigbtn ghost', 'data-dwell': '1', onclick: () => { this.panel('read'); } }, '🔊 朗讀設定（自然人聲）')),
        h('div', { class: 'fbr-note' }, '小技巧：開啟「朗讀」並勾選「唸完自動翻頁」，就能整本書從頭聽到尾，完全不用動手。'));
      return p;
    }
    setGaze(on) {
      this.gaze = !!on;
      this.el.classList.toggle('gaze', this.gaze);
      this.el.style.setProperty('--dwell', this.pref.dwell + 's');
      this.savePref({ gaze: this.gaze });
      this.el.querySelectorAll('[data-k=eye]').forEach((b) => b.classList.toggle('on', this.gaze));
      setTimeout(() => this.resize(), 50);
    }
    bindGaze() {
      let target = null, t0 = 0, raf = 0, cool = 0, lastX = 0, lastY = 0;
      const fg = this.ring.querySelector('.fg');
      const reset = () => { if (target) target.classList.remove('dwelling'); target = null; this.ring.classList.remove('show'); cancelAnimationFrame(raf); };
      const tick = () => {
        if (!target) return;
        const need = this.pref.dwell * 1000 * (target.classList.contains('fbr-zone') ? 1 : 1);
        const k = Math.min(1, (performance.now() - t0) / need);
        fg.setAttribute('stroke-dashoffset', (163.4 * (1 - k)).toFixed(1));
        if (k >= 1) {
          const el = target;
          reset();
          cool = performance.now() + 900;
          el.click();
          // 停在同一個翻頁區：再等一次就翻下一頁
          if (el.classList.contains('fbr-zone')) setTimeout(() => { if (this.gaze) start(el); }, 900);
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      const start = (el) => {
        reset();
        target = el; t0 = performance.now();
        el.classList.add('dwelling');
        Object.assign(this.ring.style, { left: lastX + 'px', top: lastY + 'px' });
        this.ring.classList.add('show');
        raf = requestAnimationFrame(tick);
      };
      this.el.addEventListener('pointermove', (e) => {
        if (!this.gaze || e.pointerType === 'touch') return;
        const r = this.el.getBoundingClientRect(), z = Z();
        lastX = (e.clientX - r.left) / z; lastY = (e.clientY - r.top) / z;
        if (target) Object.assign(this.ring.style, { left: lastX + 'px', top: lastY + 'px' });
        const el = e.target.closest && e.target.closest('[data-dwell]');
        if (el === target) return;
        if (!el || !this.el.contains(el) || performance.now() < cool) return reset();
        start(el);
      });
      this.el.addEventListener('pointerleave', reset);
    }

    // ------------------------------------------------------------ 放大鏡
    toggleLens(on) {
      this.lensOn = on === undefined ? !this.lensOn : on;
      this.lens.classList.toggle('show', false);
      this.el.querySelectorAll('[data-k=lens]').forEach((b) => b.classList.toggle('on', this.lensOn));
      this.say(this.lensOn ? '放大鏡：開（移動滑鼠或眼睛就能看清楚）' : '放大鏡：關');
    }
    bindLens() {
      let sx = 0, sy = 0, tx = 0, ty = 0, raf = 0;
      const draw = () => {
        raf = 0;
        // 跟著指標平滑移動（眼動鼠的抖動不會讓畫面晃）
        sx += (tx - sx) * (this.gaze ? 0.25 : 0.6); sy += (ty - sy) * (this.gaze ? 0.25 : 0.6);
        const size = this.pref.lensSize, zoom = this.pref.lensZoom;
        const st = this.stage.getBoundingClientRect(), er = this.el.getBoundingClientRect(), z = Z();
        const px = sx - (st.left - er.left) / z, py = sy - (st.top - er.top) / z;
        const hit = this.fl.pageAt(px, py);
        if (!hit) { this.lens.classList.remove('show'); return; }
        const dpr = window.devicePixelRatio || 1;
        const L = this.lens;
        if (L.width !== Math.round(size * dpr)) { L.width = L.height = Math.round(size * dpr); }
        Object.assign(L.style, { width: size + 'px', height: size + 'px', left: sx - size / 2 + 'px', top: sy - size / 2 + 'px', filter: this.cv.style.filter });
        L.classList.add('show');
        const c = L.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
        const im = this.img(hit.page);
        const scale = zoom * hit.rect.w; // 頁寬放大後的像素
        const ph = scale * (hit.rect.h / hit.rect.w);
        if (im && im.naturalWidth) c.drawImage(im, size / 2 - hit.u * scale, size / 2 - hit.v * ph, scale, ph);
        if (Math.abs(tx - sx) + Math.abs(ty - sy) > 0.5) raf = requestAnimationFrame(draw);
      };
      this.el.addEventListener('pointermove', (e) => {
        if (!this.lensOn) return;
        const r = this.el.getBoundingClientRect(), z = Z();
        tx = (e.clientX - r.left) / z; ty = (e.clientY - r.top) / z;
        if (!sx && !sy) { sx = tx; sy = ty; }
        if (!raf) raf = requestAnimationFrame(draw);
      });
      this.el.addEventListener('pointerleave', () => this.lens.classList.remove('show'));
    }

    // ------------------------------------------------------------ 列印、分享、說明、密碼
    print() {
      const v = this.fl.visiblePages();
      const dlg = h('div', { class: 'fbr-pop' });
      const go = (list) => {
        dlg.remove();
        const w = window.open('', '_blank');
        if (!w) return this.say('請允許開啟新視窗才能列印');
        const imgs = list.map((i) => '<img src="' + esc(new URL(this.url(this.pages[i].asset ?? this.pages[i].src), location.href).href) + '">').join('');
        w.document.write('<!doctype html><meta charset=utf-8><title>' + esc(this.book.title || '列印') + '</title><style>@page{margin:0}body{margin:0}img{width:100%;page-break-after:always;display:block}</style>' + imgs + '<script>Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>i.onload=i.onerror=r))).then(()=>{print();})<\/script>');
        w.document.close();
      };
      const box = h('div', { class: 'fbr-lock' }, h('div', { class: 'box' }, h('h3', {}, '列印'),
        h('div', { class: 'fbr-row', style: { justifyContent: 'center' } },
          h('button', { class: 'fbr-bigbtn', 'data-dwell': '1', onclick: () => go(v) }, '目前這 ' + v.length + ' 頁'),
          h('button', { class: 'fbr-bigbtn ghost', style: { color: '#222', background: '#eee' }, 'data-dwell': '1', onclick: () => go(this.pages.map((_, i) => i)) }, '全部 ' + this.pages.length + ' 頁')),
        h('button', { class: 'fbr-bigbtn ghost', style: { color: '#222', background: '#eee', marginTop: '8px' }, 'data-dwell': '1', onclick: () => dlg.remove() }, '取消')));
      dlg.append(box); this.el.append(dlg);
    }
    link() { return this.o.shareUrl || (location.protocol.startsWith('http') && !/127\.0\.0\.1|localhost/.test(location.host) ? location.href.split('#')[0] : ''); }
    mail() {
      const u = this.link();
      location.href = 'mailto:?subject=' + encodeURIComponent(this.book.title || '電子書') + '&body=' + encodeURIComponent((this.book.title || '') + '\n' + (u || ''));
    }
    share() {
      const u = this.link();
      if (!u) return this.say('發佈到網站上之後才能分享連結');
      const t = this.book.title || '電子書';
      if (navigator.share) { navigator.share({ title: t, url: u }).catch(() => 0); return; }
      const sites = [['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u)], ['LINE', 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(u)],
        ['X', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t) + '&url=' + encodeURIComponent(u)]];
      const dlg = h('div', { class: 'fbr-lock', onclick: (e) => { if (e.target === dlg) dlg.remove(); } }, h('div', { class: 'box' }, h('h3', {}, '分享這本電子書'),
        sites.map(([n, href]) => h('div', { class: 'fbr-row', style: { justifyContent: 'center' } }, h('a', { class: 'fbr-bigbtn', href, target: '_blank', style: { textDecoration: 'none', width: '100%' } }, n))),
        h('div', { class: 'fbr-row', style: { justifyContent: 'center' } }, h('button', { class: 'fbr-bigbtn ghost', style: { color: '#222', background: '#eee', width: '100%' }, onclick: () => { navigator.clipboard && navigator.clipboard.writeText(u); this.say('已複製連結'); dlg.remove(); } }, '複製連結'))));
      this.el.append(dlg);
    }
    help() {
      const rows = [['翻頁', '拖曳書頁的一角、點頁面兩側、按左右箭頭或鍵盤 ← →；滑鼠滾輪也可以'], ['放大', '工具列的放大鏡＋／－，放大後可以拖曳移動'], ['放大鏡', '開啟後移動滑鼠（或眼睛），圓形放大鏡會跟著放大文字'],
        ['朗讀', '自然人聲唸出頁面文字，可選男聲女聲、兒童到長輩，唸完自動翻頁'], ['眼控', '用眼動鼠注視按鈕就能按，兩側有大大的翻頁區'], ['縮圖／目錄／搜尋', '在下方工具列']];
      const dlg = h('div', { class: 'fbr-lock', onclick: (e) => { if (e.target === dlg) dlg.remove(); } }, h('div', { class: 'box', style: { width: '480px', textAlign: 'left' } }, h('h3', {}, '使用說明'),
        rows.map(([a, b]) => h('p', { style: { margin: '8px 0', lineHeight: '1.6' } }, h('b', {}, a + '：'), b)),
        h('button', { class: 'fbr-bigbtn', 'data-dwell': '1', style: { width: '100%' }, onclick: () => dlg.remove() }, '知道了')));
      this.el.append(dlg);
    }
    lock() {
      const inp = h('input', { type: 'password', placeholder: '請輸入密碼' });
      const msg = h('div', { style: { color: '#c00', minHeight: '1.2em' } });
      const go = () => { if (sha256('fbr:' + inp.value) === this.s.pwHash) box.remove(); else { msg.textContent = '密碼不正確'; inp.select(); } };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const box = h('div', { class: 'fbr-lock', style: { background: '#222' } }, h('div', { class: 'box' }, h('h3', {}, '🔒 ' + (this.book.title || '這本電子書') + ' 需要密碼'), inp, msg, h('button', { class: 'fbr-bigbtn', onclick: go }, '開啟')));
      this.el.append(box);
      setTimeout(() => inp.focus(), 50);
    }

    // ------------------------------------------------------------ 鍵盤、會動的背景
    bindKeys() {
      this.onKey = (e) => {
        if (!this.el.isConnected || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
        if (this.o.keys === false) return;
        const k = e.key;
        if (k === 'ArrowRight' || k === 'PageDown') { this.fl.flip(this.s.rtl ? -1 : 1); e.preventDefault(); }
        else if (k === 'ArrowLeft' || k === 'PageUp') { this.fl.flip(this.s.rtl ? 1 : -1); e.preventDefault(); }
        else if (k === 'Home') this.goto(0);
        else if (k === 'End') this.goto(this.pages.length - 1);
        else if (k === '+' || k === '=') this.zoomBy(1);
        else if (k === '-') this.zoomBy(-1);
        else if (k === 'Escape') { for (const p in this.panels) this.panels[p].classList.remove('show'); if (this.lensOn) this.toggleLens(false); }
      };
      document.addEventListener('keydown', this.onKey);
    }
    sizeScene() {
      const r = this.el.getBoundingClientRect(), z = Z();
      this.sceneCv.width = r.width / z; this.sceneCv.height = r.height / z;
    }
    startScene() {
      const kind = this.s.scene;
      if (!kind || kind === 'none') return;
      this.sizeScene();
      const c = this.sceneCv.getContext('2d');
      const W = () => this.sceneCv.width, H = () => this.sceneCv.height;
      const N = kind === 'stars' ? 120 : 60;
      const ps = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), p: Math.random() * 6.28, v: 0.3 + Math.random() * 0.7 }));
      const col = { snow: '#fff', bubbles: 'rgba(255,255,255,.5)', petals: '#ffb7c9', leaves: '#d98b2b', hearts: '#ff5d8f', stars: '#fff' }[kind];
      let last = performance.now();
      const loop = (now) => {
        if (!this.el.isConnected) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        c.clearRect(0, 0, W(), H());
        for (const p of ps) {
          p.p += dt * p.v * 2;
          if (kind === 'stars') { c.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(p.p)); c.fillStyle = col; c.beginPath(); c.arc(p.x * W(), p.y * H(), p.s * 1.4, 0, 6.28); c.fill(); continue; }
          const up = kind === 'bubbles';
          p.y += (up ? -1 : 1) * dt * p.v * 0.06; p.x += Math.sin(p.p) * dt * 0.01;
          if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); } if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
          const x = p.x * W(), y = p.y * H(), s = p.s * (kind === 'snow' ? 3 : 7);
          c.globalAlpha = 0.85; c.fillStyle = col; c.strokeStyle = col;
          c.save(); c.translate(x, y); c.rotate(p.p);
          if (kind === 'bubbles') { c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, s * 1.4, 0, 6.28); c.stroke(); }
          else if (kind === 'hearts') { c.font = s * 3 + 'px sans-serif'; c.fillText('♥', -s, s); }
          else if (kind === 'petals' || kind === 'leaves') { c.beginPath(); c.ellipse(0, 0, s, s * 0.5, 0, 0, 6.28); c.fill(); }
          else { c.beginPath(); c.arc(0, 0, s * 0.6, 0, 6.28); c.fill(); }
          c.restore();
        }
        c.globalAlpha = 1;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    destroy() {
      this.readStop(); this.toggleAuto(false); this.stopMedia();
      if (this.music) this.music.pause();
      document.removeEventListener('keydown', this.onKey);
      if (this.ro) this.ro.disconnect();
      this.root.innerHTML = '';
    }
  }

  // ------------------------------------------------------------ 共用：影片網址、圖形、動畫、聲音清單
  FB.videoEmbed = function (src, autoplay) {
    if (!src || typeof src !== 'string') return '';
    let m = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/) || (/^[\w-]{11}$/.test(src) ? [0, src] : null);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + '?rel=0&playsinline=1' + (autoplay ? '&autoplay=1&mute=1' : '');
    m = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + (autoplay ? '?autoplay=1&muted=1' : '');
    return '';
  };
  FB.shapeSVG = function (it) {
    const f = it.fill || 'rgba(255,152,0,.5)', s = it.stroke || '#ff9800', w = it.sw ?? 2;
    const a = 'fill="' + esc(f) + '" stroke="' + esc(s) + '" stroke-width="' + w + '" vector-effect="non-scaling-stroke"';
    const shapes = {
      rect: '<rect x="1" y="1" width="98" height="98" rx="' + (it.radius || 0) + '" ' + a + '/>',
      ellipse: '<ellipse cx="50" cy="50" rx="49" ry="49" ' + a + '/>',
      line: '<line x1="0" y1="50" x2="100" y2="50" stroke="' + esc(s) + '" stroke-width="' + Math.max(1, w) + '" vector-effect="non-scaling-stroke"/>',
      arrow: '<path d="M0 38h66V18l34 32-34 32V62H0z" ' + a + '/>',
      star: '<path d="M50 3l14 30 33 4-24 22 6 33-29-16-29 16 6-33L3 37l33-4z" ' + a + '/>',
      heart: '<path d="M50 90C20 68 3 50 3 30A22 22 0 0 1 50 18a22 22 0 0 1 47 12c0 20-17 38-47 60z" ' + a + '/>',
      bubble: '<path d="M8 6h84a6 6 0 0 1 6 6v54a6 6 0 0 1-6 6H40L22 94V72H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" ' + a + '/>',
      triangle: '<path d="M50 3L97 97H3z" ' + a + '/>',
    };
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible">' + (shapes[it.shape] || shapes.rect) + '</svg>';
  };
  FB.ANIMS = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    zoom: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }],
    slideL: [{ opacity: 0, transform: 'translateX(-60%)' }, { opacity: 1, transform: 'none' }],
    slideR: [{ opacity: 0, transform: 'translateX(60%)' }, { opacity: 1, transform: 'none' }],
    slideU: [{ opacity: 0, transform: 'translateY(60%)' }, { opacity: 1, transform: 'none' }],
    slideD: [{ opacity: 0, transform: 'translateY(-60%)' }, { opacity: 1, transform: 'none' }],
    bounce: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.6 }, { transform: 'scale(.95)', offset: 0.8 }, { opacity: 1, transform: 'scale(1)' }],
    spin: [{ opacity: 0, transform: 'rotate(-180deg) scale(.4)' }, { opacity: 1, transform: 'none' }],
    flip: [{ opacity: 0, transform: 'perspective(400px) rotateY(90deg)' }, { opacity: 1, transform: 'none' }],
    pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
  };
  FB.ANIM_NAMES = { none: '無', fade: '淡入', zoom: '放大出現', slideL: '從左滑入', slideR: '從右滑入', slideU: '從下滑入', slideD: '從上滑入', bounce: '彈跳', spin: '旋轉出現', flip: '翻轉出現', pulse: '心跳' };
  FB.VOICES = [
    { id: 'f-child', name: '小女孩', gender: '女', age: '兒童' }, { id: 'f-young', name: '年輕女生', gender: '女', age: '青年' },
    { id: 'f-adult', name: '成年女性', gender: '女', age: '成年' }, { id: 'f-elder', name: '阿嬤（長輩女性）', gender: '女', age: '長輩' },
    { id: 'm-child', name: '小男孩', gender: '男', age: '兒童' }, { id: 'm-young', name: '年輕男生', gender: '男', age: '青年' },
    { id: 'm-adult', name: '成年男性', gender: '男', age: '成年' }, { id: 'm-elder', name: '阿公（長輩男性）', gender: '男', age: '長輩' }];

  FB.Reader = { mount: (root, book, opts) => new Reader(root, book, opts), Reader };
})();
