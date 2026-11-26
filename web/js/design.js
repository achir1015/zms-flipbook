/* 第 2 步：外觀設計 — 範本主題、動態背景、工具列、翻頁方式（單頁／雙頁、右翻書、硬封面、速度、聲音）、
 * 標誌、背景音樂、自動翻頁、密碼、下載原始檔；右邊即時預覽（用真正的閱讀器）。 */
(function () {
  const FB = window.FB;
  const { $, h } = FB;
  const S = FB.S;
  let pv = null, pvT = 0;
  const st = () => S.book.data.settings;
  const set = (k, v) => FB.edit(() => { st()[k] = v; }, 'design');
  const fld = (label, el, hint) => h('label', { class: 'fld' }, label, el, hint ? h('div', { class: 'hint', style: { padding: '2px 0' } }, hint) : null);
  const chk = (k, label) => { const i = h('input', { type: 'checkbox', checked: st()[k] ? true : null }); i.addEventListener('change', () => set(k, i.checked)); return h('label', { class: 'inline ds-chk' }, i, label); };
  const BTN_NAMES = { zoom: '放大縮小', first: '翻頁按鈕', lens: '放大鏡', read: '朗讀', eye: '眼控', print: '列印', mail: 'Email', download: '下載', help: '說明', full: '全螢幕', thumbs: '縮圖', toc: '目錄', search: '搜尋', mark: '書籤', auto: '自動翻頁', sound: '聲音', share: '分享' };

  function render() {
    const box = $('#ds-side');
    box.innerHTML = '';
    const s = st();
    // 範本主題（縮圖卡）
    box.append(h('div', { class: 'pane-title' }, '範本主題'));
    const themes = h('div', { class: 'theme-grid' });
    for (const [k, t] of Object.entries(FB.THEMES)) {
      const sw = h('div', { class: 'sw ' + (t.cls || '') });
      if (t.bg) sw.style.background = t.bg;
      if (k === 'custom') sw.style.background = 'radial-gradient(ellipse at center, ' + s.bg1 + ', ' + s.bg2 + ')';
      themes.append(h('div', { class: 'theme' + (s.theme === k ? ' on' : ''), onclick: () => set('theme', k) }, sw, h('span', {}, t.name)));
    }
    box.append(themes);
    if (s.theme === 'custom') box.append(h('div', { class: 'row' }, colorFld('中間顏色', 'bg1'), colorFld('外圍顏色', 'bg2')));
    box.append(h('div', { class: 'row' },
      fld('動態背景', FB.selectEl(...Object.entries(FB.SCENES), s.scene || 'none', (v) => set('scene', v))),
      fld('工具列位置', FB.selectEl(['top', '上方'], ['bottom', '下方'], ['none', '不顯示'], s.bar || 'top', (v) => set('bar', v)))));
    box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('image'); if (a) set('bgImage', a.id); } }, s.bgImage ? '🖼 換背景圖' : '🖼 用自己的背景圖'), s.bgImage ? h('button', { class: 'btn sm', onclick: () => set('bgImage', null) }, '移除背景圖') : h('span')));

    box.append(h('div', { class: 'pane-title' }, '翻頁方式'));
    box.append(h('div', { class: 'row' },
      fld('版面', FB.selectEl(['auto', '自動（寬螢幕雙頁、手機單頁）'], ['double', '一律雙頁'], ['single', '一律單頁'], s.layout || 'auto', (v) => set('layout', v))),
      fld('翻頁速度', FB.selectEl(['0.5', '快'], ['0.8', '一般'], ['1.2', '慢'], ['1.8', '很慢'], String(s.flipTime || 0.8), (v) => set('flipTime', +v)))));
    box.append(h('div', { class: 'ds-chks' }, chk('hard', '硬封面（封面封底不會彎）'), chk('rtl', '右翻書（由右往左翻，直排中文書）'), chk('center', '封面封底置中'), chk('flipSound', '翻頁聲音'), chk('wheel', '滑鼠滾輪翻頁'), chk('linkHl', '連結黃色標示')));
    box.append(fld('一開始顯示第幾頁', numInp('startPage', 1, Math.max(1, S.book.data.pages.length))));

    box.append(h('div', { class: 'pane-title' }, '標題與標誌'));
    box.append(h('div', { class: 'ds-chks' }, chk('showTitle', '在工具列顯示書名')));
    box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('image'); if (a) set('logo', a.id); } }, s.logo ? '換公司標誌' : '加上公司標誌'), s.logo ? h('button', { class: 'btn sm', onclick: () => set('logo', null) }, '移除標誌') : h('span')));
    box.append(fld('點標誌開啟的網址', txtInp('logoUrl', 'https://')));

    box.append(h('div', { class: 'pane-title' }, '聲音與自動翻頁'));
    box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('audio'); if (a) set('music', a.id); } }, s.music ? '♫ 換背景音樂' : '♫ 加背景音樂'), s.music ? h('button', { class: 'btn sm', onclick: () => set('music', null) }, '移除音樂') : h('span')));
    box.append(h('div', { class: 'row' }, fld('自動翻頁每頁幾秒', numInp('autoplay', 2, 60)), h('div', { class: 'ds-chks' }, chk('autoLoop', '翻到最後從頭再來'))));

    box.append(h('div', { class: 'pane-title' }, '工具列按鈕'));
    const bt = h('div', { class: 'ds-chks btns' });
    for (const [k, n] of Object.entries(BTN_NAMES)) {
      const i = h('input', { type: 'checkbox', checked: s.btn[k] !== 0 ? true : null });
      i.addEventListener('change', () => FB.edit(() => { s.btn = Object.assign({}, s.btn, { [k]: i.checked ? 1 : 0 }); }, 'design'));
      bt.append(h('label', { class: 'inline ds-chk' }, i, n));
    }
    box.append(bt);

    box.append(h('div', { class: 'pane-title' }, '保護與下載'));
    const pw = h('input', { class: 'inp', type: 'password', placeholder: s.pwHash ? '（已設定密碼，輸入新密碼可更換）' : '空白＝不用密碼' });
    pw.addEventListener('change', () => set('pwHash', pw.value ? FB.sha256('fbr:' + pw.value) : ''));
    box.append(fld('開啟電子書的密碼', h('div', { class: 'row' }, pw, s.pwHash ? h('button', { class: 'mini', style: { flex: 'none' }, onclick: () => set('pwHash', '') }, '取消密碼') : h('span', { style: { flex: 'none' } })), '發佈出去的電子書打開時要先輸入密碼（簡易保護，防一般人隨意觀看）。'));
    box.append(fld('「下載」按鈕的檔案網址', txtInp('downloadUrl', '例如 https://…/原始檔.pdf'), '空白＝不顯示下載按鈕'));
    box.append(h('div', { style: { height: '30px' } }));
  }
  function colorFld(label, k) { const i = h('input', { type: 'color', value: st()[k] }); i.addEventListener('change', () => set(k, i.value)); return fld(label, i); }
  function numInp(k, min, max) { const i = h('input', { class: 'inp num', type: 'number', min, max, value: st()[k] }); i.addEventListener('change', () => set(k, Math.max(min, Math.min(max, +i.value || min)))); return i; }
  function txtInp(k, ph) { const i = h('input', { class: 'inp', value: st()[k] || '', placeholder: ph }); i.addEventListener('change', () => set(k, i.value.trim())); return i; }

  function preview() {
    clearTimeout(pvT);
    pvT = setTimeout(() => {
      if (pv) { pv.destroy(); pv = null; }
      if (S.tab !== 'design' || !S.book || !S.book.data.pages.length) return;
      const b = FB.bookForReader(S.book);
      b.settings = Object.assign({}, b.settings, { pwHash: '' });
      pv = FB.Reader.mount($('#ds-preview'), b, FB.readerOpts({ embedded: true, keys: false, startPage: S.page }));
    }, 250);
  }
  FB.on('tab', (t) => { if (t === 'design') { render(); preview(); } else if (pv) { pv.destroy(); pv = null; } });
  FB.on('change', (w) => { if (S.tab === 'design') { render(); preview(); } });
})();
