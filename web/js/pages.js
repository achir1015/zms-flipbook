/* 第 1 步：頁面與互動 — 頁面清單（排序、插入、刪除）、在頁面上加連結／文字／圖片／影片／聲音／圖形／按鈕／QR 碼、
 * 拖曳移動與縮放、屬性（動畫、點了要做什麼）、每一頁的朗讀文字與旁白、目錄。 */
(function () {
  const FB = window.FB;
  const { $, $$, h } = FB;
  const S = FB.S;
  const P = (FB.Pages = {});
  const book = () => S.book.data;
  const page = () => book().pages[S.page];
  const sel = () => (page() && S.sel ? (page().items || []).find((x) => x.id === S.sel) : null);
  const TYPE_NAMES = { link: '連結區', text: '文字', image: '圖片', video: '影片', audio: '聲音', shape: '圖形', button: '按鈕', qr: 'QR 碼' };
  const ACTS = [['', '（不做事）'], ['url', '開啟網頁'], ['page', '跳到第幾頁'], ['tel', '打電話'], ['mail', '寄 Email'], ['popup', '跳出網頁視窗'], ['image', '跳出大圖'], ['video', '跳出影片'], ['audio', '播放聲音'], ['read', '開始朗讀']];

  // ------------------------------------------------------------ 頁面清單
  function renderList() {
    const box = $('#pg-thumbs');
    const pages = book().pages;
    $('#pg-count').textContent = pages.length + ' 頁';
    box.innerHTML = '';
    pages.forEach((p, i) => {
      const t = h('div', { class: 'pg-th' + (i === S.page ? ' on' : ''), draggable: 'true', onclick: () => { S.page = i; S.sel = null; render(); } },
        h('img', { src: FB.mediaURL(p.thumb ?? p.asset), loading: 'lazy', alt: '' }),
        h('span', { class: 'n' }, String(i + 1)),
        (p.items || []).length ? h('span', { class: 'k', title: '這一頁有互動物件' }, '★' + p.items.length) : null,
        p.audio ? h('span', { class: 'k2', title: '這一頁有旁白' }, '🎤') : null);
      t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/fb-page', String(i)); });
      t.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/fb-page')) { e.preventDefault(); t.classList.add('over'); } });
      t.addEventListener('dragleave', () => t.classList.remove('over'));
      t.addEventListener('drop', (e) => { e.preventDefault(); t.classList.remove('over'); const from = +e.dataTransfer.getData('text/fb-page'); move(from, i); });
      box.append(t);
    });
    const cur = box.children[S.page];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function move(from, to) {
    if (from === to || isNaN(from)) return;
    FB.edit(() => { const [p] = book().pages.splice(from, 1); book().pages.splice(to, 0, p); S.page = to; fixToc(from, to); }, 'pages');
  }
  function fixToc() { /* 目錄用頁碼記錄，移動頁面後請在目錄調整 */ }
  $('#pg-up').addEventListener('click', () => move(S.page, Math.max(0, S.page - 1)));
  $('#pg-down').addEventListener('click', () => move(S.page, Math.min(book().pages.length - 1, S.page + 1)));
  $('#pg-del').addEventListener('click', async () => {
    if (!page()) return;
    if (book().pages.length <= 1) return FB.toast('至少要留一頁', 'err');
    if (!(await FB.confirm('確定要刪除第 ' + (S.page + 1) + ' 頁嗎？（可以按「復原」救回來）', '刪除', true))) return;
    FB.edit(() => { book().pages.splice(S.page, 1); S.page = Math.min(S.page, book().pages.length - 1); S.sel = null; }, 'pages');
  });
  $('#pg-blank').addEventListener('click', async () => {
    const p0 = book().pages[0] || { w: 1131, h: 1600 };
    const b = FB.busy('建立空白頁…');
    try {
      const pg = await FB.Import.blankPage(p0.w, p0.h, '#ffffff');
      FB.edit(() => { book().pages.splice(S.page + 1, 0, pg); S.page += 1; S.sel = null; }, 'pages');
    } catch (e) { FB.err(e); } finally { b.close(); }
  });
  $('#pg-add').addEventListener('click', () => {
    const kinds = [['pdf', '📕 PDF'], ['image', '🖼 圖片'], ['ppt', '📊 PowerPoint'], ['word', '📝 Word'], ['web', '🌐 網頁']];
    FB.menu($('#pg-add'), kinds.map(([k, t]) => [t + '（加在第 ' + (S.page + 1) + ' 頁後面）', () => FB.Import.start(k, { append: true, at: S.page + 1, q: S.pref.importQ || 'std' })]));
  });

  // ------------------------------------------------------------ 編輯中的頁面
  function sheetSize() {
    const st = $('#pg-stage');
    const p = page() || { w: 1131, h: 1600 };
    const aw = st.clientWidth - 40, ah = st.clientHeight - 40;
    let hh = ah, w = hh * p.w / p.h;
    if (w > aw) { w = aw; hh = w * p.h / p.w; }
    return { w: Math.max(50, w), h: Math.max(50, hh) };
  }
  // 借用閱讀器畫物件的程式（畫面一模一樣）
  const fake = { url: (x) => (typeof x === 'number' ? FB.mediaURL(x) : x || ''), s: { linkHl: false }, doAction() {}, playAudio() {}, pages: [] };
  function renderSheet() {
    const sh = $('#pg-sheet');
    sh.innerHTML = '';
    const p = page();
    if (!p) { sh.style.width = sh.style.height = '0'; return; }
    const sz = sheetSize();
    Object.assign(sh.style, { width: sz.w + 'px', height: sz.h + 'px', backgroundImage: 'url("' + FB.mediaURL(p.asset) + '")' });
    const rect = { x: 0, y: 0, w: sz.w, h: sz.h };
    for (const it of p.items || []) {
      const inner = FB.Reader.Reader.prototype.itemEl.call(fake, Object.assign({}, it, { anim: 'none', autoplay: false }), rect, S.page);
      const wrap = h('div', { class: 'ed-it ' + (it.type === 'link' ? 'is-link' : '') + (it.id === S.sel ? ' on' : ''), style: { left: it.x * 100 + '%', top: it.y * 100 + '%', width: it.w * 100 + '%', height: it.h * 100 + '%' } });
      if (inner) { Object.assign(inner.style, { left: 0, top: 0, width: '100%', height: '100%' }); inner.style.pointerEvents = 'none'; wrap.append(inner); }
      wrap.append(h('div', { class: 'ed-hit', title: TYPE_NAMES[it.type] + (it.action && it.action.kind ? '（點了會：' + (ACTS.find((a) => a[0] === it.action.kind) || ['', ''])[1] + '）' : '') }));
      if (it.id === S.sel) wrap.append(h('div', { class: 'ed-hd' }), h('div', { class: 'ed-tag' }, TYPE_NAMES[it.type]));
      wrap.addEventListener('pointerdown', (e) => startDrag(e, it, wrap, e.target.classList.contains('ed-hd')));
      sh.append(wrap);
    }
  }
  function startDrag(e, it, wrap, resize) {
    e.preventDefault(); e.stopPropagation();
    if (!S.book.editable) return;
    if (S.sel !== it.id) { S.sel = it.id; render(); return; }
    const sh = FB.rect($('#pg-sheet'));
    const x0 = FB.cx(e), y0 = FB.cy(e), o = { x: it.x, y: it.y, w: it.w, h: it.h };
    let moved = false;
    const mv = (ev) => {
      const dx = (FB.cx(ev) - x0) / sh.width, dy = (FB.cy(ev) - y0) / sh.height;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 0.003) return;
      if (!moved) { S.undo.push(JSON.stringify(book())); S.redo = []; moved = true; }
      if (resize) { it.w = Math.max(0.02, Math.min(1 - o.x, o.w + dx)); it.h = Math.max(0.015, Math.min(1 - o.y, o.h + dy)); if (ev.shiftKey && it.type !== 'link') it.h = it.w * (o.h / o.w) * (sh.width / sh.height) / (sh.width / sh.height); }
      else { it.x = Math.max(-o.w * 0.5, Math.min(1 - o.w * 0.5, o.x + dx)); it.y = Math.max(-o.h * 0.5, Math.min(1 - o.h * 0.5, o.y + dy)); }
      Object.assign(wrap.style, { left: it.x * 100 + '%', top: it.y * 100 + '%', width: it.w * 100 + '%', height: it.h * 100 + '%' });
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (moved) { FB.changed('item'); renderSheet(); } };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  }
  $('#pg-stage').addEventListener('pointerdown', (e) => { if (e.target.id === 'pg-stage' || e.target.id === 'pg-sheet') { if (S.sel) { S.sel = null; render(); } } });
  new ResizeObserver(() => { if (S.tab === 'pages' && S.book) renderSheet(); }).observe($('#pg-stage'));

  // ------------------------------------------------------------ 加入物件
  const DEFAULTS = {
    link: { w: 0.3, h: 0.06, action: { kind: 'url', value: 'https://' }, tip: '' },
    text: { w: 0.5, h: 0.08, text: '輸入文字', size: 0.032, color: '#222222', align: 'left' },
    image: { w: 0.4, h: 0.25, fit: 'contain' },
    video: { w: 0.6, h: 0.34, src: '' },
    audio: { w: 0.08, h: 0.056 },
    shape: { w: 0.25, h: 0.15, shape: 'rect', fill: 'rgba(255,152,0,0.35)', stroke: '#ff9800', sw: 2 },
    button: { w: 0.3, h: 0.06, text: '按我', bg: '#ff9800', color: '#ffffff', size: 0.026, action: { kind: 'url', value: 'https://' } },
    qr: { w: 0.22, h: 0.155, text: 'https://' },
  };
  async function addItem(type) {
    if (!page() || !S.book.editable) return;
    const it = Object.assign({ id: FB.uid(), type, x: 0, y: 0 }, JSON.parse(JSON.stringify(DEFAULTS[type])));
    const p = page();
    if (type === 'qr' || type === 'audio') it.h = it.w * (p.w / p.h);
    if (type === 'image') {
      const a = await FB.pickAsset('image');
      if (!a) return;
      it.asset = a.id;
      if (a.w && a.h) it.h = Math.min(0.6, it.w * (a.h / a.w) * (p.w / p.h));
    }
    if (type === 'audio') { const a = await FB.pickAsset('audio'); if (!a) return; it.asset = a.id; }
    if (type === 'video') {
      const v = await videoSource();
      if (!v) return;
      Object.assign(it, v);
    }
    it.x = (1 - it.w) / 2; it.y = (1 - it.h) / 2;
    FB.edit(() => { (p.items = p.items || []).push(it); S.sel = it.id; }, 'item');
  }
  async function videoSource() {
    return FB.dialog({ title: '加入影片', width: '460px', body: h('p', {}, '要放哪一種影片？'),
      buttons: [{ label: '取消', value: null },
        { label: '▶ YouTube／Vimeo 網址', onClick: async () => { const u = await FB.prompt('YouTube 或 Vimeo', 'https://www.youtube.com/watch?v=', '影片網址'); if (!u) return false; if (!FB.videoEmbed(u)) throw new Error('看不懂這個網址，請貼 YouTube 或 Vimeo 的影片網址'); return { src: u }; } },
        { label: '🎬 電腦裡的影片檔', primary: true, onClick: async () => { const a = await FB.pickAsset('video'); return a ? { asset: a.id } : false; } }] });
  }
  // 選一個圖片／影片／聲音檔放進素材庫
  FB.pickAsset = async function (kind) {
    await FB.nativeReady;
    if (FB.native) {
      const paths = await FB.native.pick_files(kind);
      if (!paths || !paths.length) return null;
      const r = await FB.api('import_paths', { paths: [paths[0]], kind });
      if (r.errors.length) FB.toast(r.errors[0], 'err');
      return r.items[0] || null;
    }
    return new Promise((res) => {
      const inp = $('#file-input');
      inp.accept = { image: 'image/*', video: 'video/*', audio: 'audio/*' }[kind] || '';
      inp.multiple = false; inp.value = '';
      inp.onchange = async () => { inp.multiple = true; const f = inp.files[0]; if (!f) return res(null); const b = FB.busy('上傳…'); try { res(await FB.upload(f, kind)); } catch (e) { FB.err(e); res(null); } finally { b.close(); } };
      inp.click();
    });
  };
  $$('#el-tools [data-add]').forEach((b) => b.addEventListener('click', () => addItem(b.dataset.add)));
  function delSel() { const it = sel(); if (!it) return; FB.edit(() => { page().items = page().items.filter((x) => x !== it); S.sel = null; }, 'item'); }
  $('#el-del').addEventListener('click', delSel);
  $('#el-dup').addEventListener('click', () => { const it = sel(); if (!it) return; const c = Object.assign(JSON.parse(JSON.stringify(it)), { id: FB.uid(), x: it.x + 0.03, y: it.y + 0.03 }); FB.edit(() => { page().items.push(c); S.sel = c.id; }, 'item'); });
  document.addEventListener('keydown', (e) => {
    if (S.tab !== 'pages' || !$('#editor').classList.contains('show') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'Delete' && S.sel) { e.preventDefault(); delSel(); }
    if (!S.sel && (e.key === 'PageDown' || e.key === 'ArrowDown') && S.page < book().pages.length - 1) { S.page++; render(); }
    if (!S.sel && (e.key === 'PageUp' || e.key === 'ArrowUp') && S.page > 0) { S.page--; render(); }
    const it = sel();
    if (it && /^Arrow/.test(e.key)) {
      e.preventDefault();
      const d = e.shiftKey ? 0.01 : 0.002;
      FB.edit(() => { if (e.key === 'ArrowLeft') it.x -= d; if (e.key === 'ArrowRight') it.x += d; if (e.key === 'ArrowUp') it.y -= d; if (e.key === 'ArrowDown') it.y += d; }, 'item');
    }
  });

  // ------------------------------------------------------------ 屬性面板
  const fld = (label, el) => h('label', { class: 'fld' }, label, el);
  const inp = (v, on, attrs) => { const i = h('input', Object.assign({ class: 'inp', value: v ?? '' }, attrs || {})); i.addEventListener('change', () => on(i.value)); return i; };
  const color = (v, on) => { const i = h('input', { type: 'color', value: toHex(v) }); i.addEventListener('change', () => on(i.value)); return i; };
  const chk = (v, label, on) => { const i = h('input', { type: 'checkbox', checked: v ? true : null }); i.addEventListener('change', () => on(i.checked)); return h('label', { class: 'inline' }, i, label); };
  const range = (v, min, max, step, on, fmt) => { const out = h('span', { class: 'rv' }, fmt ? fmt(v) : v); const i = h('input', { type: 'range', min, max, step, value: v }); i.addEventListener('input', () => (out.textContent = fmt ? fmt(+i.value) : i.value)); i.addEventListener('change', () => on(+i.value)); return h('div', { class: 'row' }, i, out); };
  function toHex(c) { if (!c) return '#000000'; if (/^#[0-9a-f]{6}$/i.test(c)) return c; const m = c.match(/\d+(\.\d+)?/g); if (!m) return '#000000'; return '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join(''); }
  const ed = (fn) => FB.edit(fn, 'item');

  function renderProps() {
    const box = $('#pg-props');
    box.innerHTML = '';
    const p = page();
    if (!p) { box.append(h('p', { class: 'hint' }, '這本書還沒有頁面，按左上「＋ 加頁」匯入。')); return; }
    const it = sel();
    if (it) return itemProps(box, it);
    // 頁面屬性
    box.append(h('h4', {}, '第 ' + (S.page + 1) + ' 頁'));
    box.append(h('p', { class: 'hint' }, '點選頁面上的物件可以修改；用上方「加入」放連結、文字、影片…。拖曳物件移動，拉右下角的小方塊改大小。'));
    const speak = h('textarea', { class: 'inp', rows: 6, placeholder: p.text ? '（空白＝唸頁面上的文字）' : '這一頁是圖片，沒有文字。要朗讀的話，請在這裡輸入要唸的內容。' }, p.speak || '');
    speak.addEventListener('change', () => FB.edit(() => (p.speak = speak.value), 'page'));
    box.append(fld('朗讀內容（自然人聲會唸這段）', speak));
    if (p.text) box.append(h('details', {}, h('summary', { class: 'hint' }, '頁面上讀到的文字（' + p.text.length + ' 字）'), h('pre', { class: 'pg-text' }, p.text.slice(0, 3000))));
    box.append(h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: async () => { const v = FB.S.pref.voice || 'f-adult'; const t = (p.speak || p.text || '').trim(); if (!t) return FB.toast('這一頁沒有可以唸的文字'); const s = FB.sentences(t)[0]; const u = await FB.tts(s, v, 1); if (u) new Audio(u).play(); } }, '▶ 試聽第一句'),
      h('button', { class: 'btn sm', onclick: () => FB.preview(S.page) }, '📖 從這頁預覽')));
    box.append(h('h4', {}, '這一頁的旁白錄音'));
    box.append(h('p', { class: 'hint' }, '有錄好的旁白（MP3 等），朗讀時就播放旁白，不用合成語音。'));
    box.append(h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('audio'); if (a) FB.edit(() => (p.audio = a.id), 'page'); } }, p.audio ? '🎤 換一個旁白檔' : '🎤 選擇旁白檔'),
      p.audio ? h('button', { class: 'btn sm', onclick: () => new Audio(FB.mediaURL(p.audio)).play() }, '▶ 播放') : null,
      p.audio ? h('button', { class: 'btn sm', onclick: () => FB.edit(() => delete p.audio, 'page') }, '移除') : null));
    // 目錄
    box.append(h('h4', {}, '目錄'));
    const toc = book().toc;
    const list = h('div', { class: 'toc-ed' });
    const flat = [];
    const walk = (l, d) => l.forEach((t) => { flat.push([t, d, l]); walk(t.children || [], d + 1); });
    walk(toc, 0);
    for (const [t, d, l] of flat) {
      const ti = inp(t.title, (v) => FB.edit(() => (t.title = v), 'toc'));
      const pi = inp(t.page, (v) => FB.edit(() => (t.page = Math.max(1, parseInt(v, 10) || 1)), 'toc'), { type: 'number', min: 1, class: 'num' });
      list.append(h('div', { class: 'toc-row', style: { paddingLeft: d * 14 + 'px' } }, ti, pi, h('button', { class: 'mini', title: '刪除', onclick: () => FB.edit(() => l.splice(l.indexOf(t), 1), 'toc') }, '✕')));
    }
    if (!flat.length) list.append(h('p', { class: 'hint' }, '還沒有目錄。PDF 有書籤的話會自動帶入。'));
    box.append(list, h('button', { class: 'btn sm', onclick: async () => { const n = await FB.prompt('加入目錄', '第 ' + (S.page + 1) + ' 頁', '目錄標題（會連到目前這一頁）'); if (n) FB.edit(() => toc.push({ title: n, page: S.page + 1, children: [] }), 'toc'); } }, '＋ 把這一頁加入目錄'));
  }

  function itemProps(box, it) {
    box.append(h('h4', {}, TYPE_NAMES[it.type], h('span', { class: 'spacer' }), h('button', { class: 'mini', onclick: () => { S.sel = null; render(); } }, '完成')));
    switch (it.type) {
      case 'link':
        box.append(h('p', { class: 'hint' }, '把框框移到頁面上要點的地方（例如網址、圖片、按鈕），讀者點這一塊就會執行下面設定的動作。'));
        box.append(fld('滑鼠移上去的提示文字', inp(it.tip, (v) => ed(() => (it.tip = v)))));
        box.append(chk(it.hl !== false, '滑鼠移上去時黃色標示', (v) => ed(() => (it.hl = v))));
        break;
      case 'text': {
        const ta = h('textarea', { class: 'inp', rows: 4 }, it.text || '');
        ta.addEventListener('change', () => ed(() => (it.text = ta.value)));
        box.append(fld('文字內容', ta));
        box.append(fld('字的大小', range(Math.round((it.size || 0.03) * 1000), 10, 150, 1, (v) => ed(() => (it.size = v / 1000)))));
        box.append(h('div', { class: 'row' }, fld('文字顏色', color(it.color, (v) => ed(() => (it.color = v)))), fld('底色', h('div', { class: 'row' }, color(it.bg || '#ffffff', (v) => ed(() => (it.bg = v))), h('button', { class: 'mini', onclick: () => ed(() => delete it.bg) }, '透明')))));
        box.append(h('div', { class: 'row' }, chk(it.bold, '粗體', (v) => ed(() => (it.bold = v))), chk(it.italic, '斜體', (v) => ed(() => (it.italic = v)))));
        box.append(fld('對齊', FB.selectEl(['left', '靠左'], ['center', '置中'], ['right', '靠右'], it.align || 'left', (v) => ed(() => (it.align = v)))));
        box.append(fld('字型', FB.selectEl(['', '預設（微軟正黑體）'], ['"DFKai-SB","BiauKai",serif', '標楷體'], ['"PMingLiU","MingLiU",serif', '新細明體'], ['"Arial",sans-serif', 'Arial'], ['"Times New Roman",serif', 'Times New Roman'], it.font || '', (v) => ed(() => (it.font = v)))));
        break;
      }
      case 'image':
        box.append(h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('image'); if (a) ed(() => (it.asset = a.id)); } }, '換一張圖片'));
        box.append(fld('顯示方式', FB.selectEl(['contain', '完整顯示'], ['cover', '填滿裁切'], ['fill', '拉伸填滿'], it.fit || 'contain', (v) => ed(() => (it.fit = v)))));
        break;
      case 'video':
        box.append(fld('YouTube／Vimeo 網址（空白＝用影片檔）', inp(it.src, (v) => ed(() => { it.src = v; if (v) delete it.asset; }))));
        box.append(h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('video'); if (a) ed(() => { it.asset = a.id; it.src = ''; }); } }, '選擇影片檔'));
        box.append(h('div', { class: 'row' }, chk(it.autoplay, '翻到這頁自動播放（靜音）', (v) => ed(() => (it.autoplay = v))), chk(it.loop, '重複播放', (v) => ed(() => (it.loop = v)))));
        break;
      case 'audio':
        box.append(h('button', { class: 'btn sm', onclick: async () => { const a = await FB.pickAsset('audio'); if (a) ed(() => (it.asset = a.id)); } }, '換一個聲音檔'));
        box.append(chk(it.autoplay, '翻到這頁自動播放', (v) => ed(() => (it.autoplay = v))));
        box.append(chk(it.hidden, '隱藏喇叭圖示（只自動播放）', (v) => ed(() => (it.hidden = v))));
        break;
      case 'shape':
        box.append(fld('形狀', FB.selectEl(['rect', '方形'], ['ellipse', '圓形'], ['triangle', '三角形'], ['star', '星星'], ['heart', '愛心'], ['arrow', '箭頭'], ['bubble', '對話框'], ['line', '線條'], it.shape || 'rect', (v) => ed(() => (it.shape = v)))));
        box.append(h('div', { class: 'row' }, fld('填色', color(it.fill, (v) => ed(() => (it.fill = v)))), fld('框線', color(it.stroke, (v) => ed(() => (it.stroke = v))))));
        box.append(fld('框線粗細', range(it.sw ?? 2, 0, 12, 1, (v) => ed(() => (it.sw = v)))));
        if (it.shape === 'rect') box.append(fld('圓角', range(it.radius || 0, 0, 40, 1, (v) => ed(() => (it.radius = v)))));
        break;
      case 'button':
        box.append(fld('按鈕文字', inp(it.text, (v) => ed(() => (it.text = v)))));
        box.append(h('div', { class: 'row' }, fld('按鈕顏色', color(it.bg, (v) => ed(() => (it.bg = v)))), fld('文字顏色', color(it.color, (v) => ed(() => (it.color = v))))));
        box.append(fld('字的大小', range(Math.round((it.size || 0.026) * 1000), 10, 80, 1, (v) => ed(() => (it.size = v / 1000)))));
        break;
      case 'qr':
        box.append(fld('QR 碼內容（網址或文字）', inp(it.text, (v) => ed(() => (it.text = v)))));
        break;
    }
    if (it.type !== 'video' && it.type !== 'audio') box.append(actionEditor(it));
    box.append(h('h4', {}, '外觀與動畫'));
    box.append(fld('透明度', range(Math.round((it.opacity ?? 1) * 100), 10, 100, 5, (v) => ed(() => (it.opacity = v / 100)), (v) => v + '%')));
    box.append(fld('旋轉角度', range(it.rot || 0, -180, 180, 1, (v) => ed(() => (it.rot = v)), (v) => v + '°')));
    box.append(fld('出現動畫', FB.selectEl(...Object.entries(FB.ANIM_NAMES), it.anim || 'none', (v) => ed(() => (it.anim = v)))));
    box.append(h('div', { class: 'row' }, fld('延遲（秒）', range(it.animDelay || 0, 0, 5, 0.1, (v) => ed(() => (it.animDelay = v)))), fld('長度（秒）', range(it.animDur || 0.8, 0.2, 3, 0.1, (v) => ed(() => (it.animDur = v))))));
    box.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => $('#el-dup').click() }, '⧉ 複製'), h('button', { class: 'btn sm danger', onclick: delSel }, '🗑 刪除')));
  }
  function actionEditor(it) {
    const a = it.action || {};
    const wrap = h('div', {}, h('h4', {}, '點了要做什麼'));
    const kind = FB.selectEl(...ACTS, a.kind || '', (v) => ed(() => { if (!v) delete it.action; else it.action = { kind: v, value: v === 'page' ? '1' : v === 'url' ? 'https://' : '' }; }));
    wrap.append(kind);
    if (a.kind && a.kind !== 'read') {
      const ph = { url: '網址，例如 https://www.example.com', page: '頁碼', tel: '電話號碼', mail: 'Email 地址', popup: '網址（在書上跳出視窗）', image: '', video: 'YouTube 網址（或選影片檔）', audio: '' }[a.kind];
      if (a.kind === 'image' || a.kind === 'audio' || a.kind === 'video') {
        wrap.append(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: async () => { const x = await FB.pickAsset(a.kind); if (x) ed(() => { it.action.asset = x.id; }); } }, a.asset ? '換一個檔案' : '選擇檔案'), a.asset ? h('span', { class: 'hint' }, '已選擇') : null));
        if (a.kind === 'video') wrap.append(fld('或 YouTube／Vimeo 網址', inp(a.value, (v) => ed(() => { it.action.value = v; if (v) delete it.action.asset; }))));
      } else wrap.append(fld(ph, inp(a.value, (v) => ed(() => (it.action.value = v)), a.kind === 'page' ? { type: 'number', min: 1, max: book().pages.length } : null)));
      if (a.kind === 'url') wrap.append(chk(a.target === 'self', '在同一個視窗開啟', (v) => ed(() => (it.action.target = v ? 'self' : ''))));
    }
    return wrap;
  }

  function render() {
    if (!S.book) return;
    renderList();
    renderSheet();
    renderProps();
    const ok = S.book.editable;
    $$('#el-tools button, .pg-tools button, #pg-add').forEach((b) => (b.disabled = !ok));
  }
  P.render = render;
  FB.on('tab', (t) => { if (t === 'pages') render(); });
  FB.on('change', (w) => { if (S.tab === 'pages') render(); });
})();
