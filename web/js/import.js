/* 建立電子書：匯入 PDF、圖片（相簿）、整個資料夾、PowerPoint、Word、Excel、線上網頁 → 頁面圖＋縮圖＋文字（搜尋、朗讀用）。
 * PDF 用 pdf.js 在畫面上轉成圖片（電腦版、線上版、手機版共用同一套）；Office 與網頁由電腦版先轉成 PDF。 */
(function () {
  const FB = window.FB;
  const { h } = FB;
  const S = FB.S;
  const I = (FB.Import = {});
  const QUALITY = { std: 1600, high: 2400, small: 1100 };
  let pdfjs = null;
  async function loadPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(new URL('lib/pdfjs/pdf.min.mjs', location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs/pdf.worker.min.mjs', location.href).href;
    return pdfjs;
  }

  // ------------------------------------------------------------ 建立電子書對話框
  I.newBook = async function () {
    await FB.nativeReady;
    const src = [
      ['pdf', '📕', 'PDF 檔', '一個或多個 PDF'],
      ['image', '🖼', '圖片／相片', '多張 JPG、PNG…，一張一頁'],
      ['folder', '📂', '相簿資料夾', '整個資料夾的圖片（依檔名排序）'],
      ['ppt', '📊', 'PowerPoint 簡報', 'PPT、PPTX（需要 Office）'],
      ['word', '📝', 'Word 文件', 'DOC、DOCX、RTF、TXT'],
      ['web', '🌐', '線上網頁', '輸入網址，整頁擷取'],
    ];
    const IOS = window.ZMSIOS || window.ZMSAndroid || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    if (FB.LOCAL) { src.splice(3, 3); if (IOS) src.splice(2, 1); }   // 線上版：PowerPoint、Word、網頁要用電腦版；iPhone／iPad 不能選資料夾
    else if (!FB.native) src.splice(2, 1);
    const name = h('input', { class: 'inp', value: '', placeholder: '空白＝用第一個檔案的名稱' });
    const q = FB.selectEl(['std', '標準（建議）'], ['high', '高畫質（放大看更清楚，檔案較大）'], ['small', '省空間（手機閱讀）'], S.pref.importQ || 'std', (v) => FB.savePref({ importQ: v }));
    const mode = FB.selectEl(['merge', '合併成一本電子書'], ['each', '每個檔案各做成一本（批次轉換）'], 'merge', () => 0);
    const box = h('div', { class: 'src-grid' }, src.map(([k, ic, t, d]) => h('button', { class: 'src-card', 'data-src': k, onclick: () => { close(); I.start(k, { name: name.value.trim(), q: q.value, mode: mode.value }); } }, h('div', { class: 'ic' }, ic), h('b', {}, t), h('small', {}, d))));
    let close;
    FB.dialog({ title: '＋ 建立電子書：選擇來源', width: '640px', body: h('div', {}, box,
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('label', { class: 'fld' }, '書名', name), h('label', { class: 'fld' }, '頁面畫質', q)),
      h('label', { class: 'fld' }, '選了好幾個檔案時', mode),
      FB.LOCAL ? h('p', { class: 'hint', style: { color: '#f0a531' } }, '線上版：PowerPoint、Word 請先在 Office「另存成 PDF」再匯入；擷取網頁請用電腦版。所有資料只存在這台裝置的瀏覽器裡。') : null,
      h('p', { class: 'hint' }, '小技巧：也可以直接把檔案從檔案總管拖進書櫃。PDF 裡的文字會一起讀進來，可以搜尋、用自然人聲朗讀；PDF 的目錄與超連結也會自動帶入。')),
    buttons: [], onOpen: (b, c) => (close = c) });
  };

  // 選檔 → 依序轉成頁面 → 建立（或加到目前的）電子書
  I.start = async function (kind, o) {
    o = o || {};
    let files = [];   // [{name, asset?, file?(網頁版 File)}]
    try {
      if (kind === 'web') {
        const url = await FB.prompt('擷取線上網頁', 'https://', '網址（整個網頁會依列印版面切成頁面）');
        if (!url) return;
        const b = FB.busy('擷取網頁中（約 10～30 秒）…');
        try { const a = await FB.api('web_pdf', { url }); files = [{ name: a.name, asset: a }]; } finally { b.close(); }
      } else if (kind === 'folder' && !FB.native) {
        files = await pickFolderWeb();
        if (!files.length) return;
        if (!o.name) o.name = files.dir;
      } else if (kind === 'folder') {
        const d = await FB.native.pick_folder('');
        if (!d) return;
        const paths = await FB.api('folder_images', { folder: d });
        if (!paths.length) return FB.toast('這個資料夾裡沒有圖片', 'err');
        files = await importPaths(paths, 'image');
        if (!o.name) o.name = d.split(/[\\/]/).pop();
      } else files = await pick(kind);
    } catch (e) { return FB.err(e); }
    if (!files.length) return;
    if (o.mode === 'each' && files.length > 1 && !o.append) {
      for (const f of files) { const id = await I.build([f], Object.assign({}, o, { name: '' })); if (!id) return; }
      FB.toast('批次轉換完成：' + files.length + ' 本電子書', 'ok');
      return FB.gotoHome();
    }
    const id = await I.build(files, o);
    if (id && !o.append) FB.openReader(id);
  };
  async function pick(kind) {
    const accept = { pdf: '.pdf', image: 'image/*', ppt: '.ppt,.pptx,.pps,.ppsx,.odp', word: '.doc,.docx,.rtf,.odt,.txt,.xls,.xlsx', any: '' }[kind] ?? '';
    if (FB.native) {
      const paths = await FB.native.pick_files({ pdf: 'pdf', image: 'image', ppt: 'book', word: 'book', any: 'book' }[kind] || 'book');
      if (!paths || !paths.length) return [];
      return importPaths(paths);
    }
    return new Promise((res) => {
      const inp = FB.$('#file-input');
      inp.accept = accept; inp.value = '';
      inp.onchange = async () => { const fs = Array.from(inp.files || []); res(await uploadFiles(fs)); };
      inp.click();
    });
  }
  // 網頁版選資料夾：<input webkitdirectory>，只取圖片、依檔名自然排序
  function pickFolderWeb() {
    return new Promise((res) => {
      const inp = FB.h('input', { type: 'file', webkitdirectory: true, multiple: true });
      inp.onchange = async () => {
        const fs = Array.from(inp.files || []).filter((f) => /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name))
          .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'zh-Hant', { numeric: true }));
        if (!fs.length) { FB.toast('這個資料夾裡沒有圖片', 'err'); return res([]); }
        const out = await uploadFiles(fs);
        out.dir = ((fs[0].webkitRelativePath || '').split('/')[0]) || '';
        res(out);
      };
      inp.click();
    });
  }
  async function importPaths(paths, kind) {
    const b = FB.busy('讀取檔案…');
    try {
      const r = await FB.api('import_paths', { paths, kind });
      if (r.errors.length) FB.toast(r.errors.join('\n'), 'err');
      return r.items.map((a) => ({ name: a.name, asset: a }));
    } finally { b.close(); }
  }
  async function uploadFiles(fs) {
    const out = [];
    const b = FB.busy('上傳檔案…');
    try {
      for (const f of fs) { b.set('上傳 ' + f.name + '…'); const a = await FB.upload(f); out.push({ name: f.name, asset: a }); }
    } finally { b.close(); }
    return out;
  }
  I.dropFiles = async function (fs, o) {
    const files = await uploadFiles(Array.from(fs));
    if (!files.length) return;
    const id = await I.build(files, o || {});
    if (id && !(o && o.append)) FB.openReader(id);
  };

  // ------------------------------------------------------------ 收件匣：資料助秘文件office彙整「匯出到電子書翻頁」
  // 文件office彙整把 PDF 放進收件匣並開啟本程式；這裡每 3 秒看一次，問使用者要不要建立電子書。
  const asked = new Set();
  let inboxBusy = false;
  I.watchInbox = function () {
    if (I._inboxTimer || FB.LOCAL || !FB.native) return;
    const tick = async () => {
      if (inboxBusy || !FB.S.user || document.querySelector('.dlg-wrap, .busy')) return;
      let items;
      try { items = await FB.get('inbox'); } catch (e) { return; }
      const it = items.find((x) => !asked.has(x.path));
      if (!it) return;
      asked.add(it.path);
      inboxBusy = true;
      try { await I.fromInbox(it); } finally { inboxBusy = false; }
    };
    I._inboxTimer = setInterval(tick, 3000);
    setTimeout(tick, 800);
  };
  I.fromInbox = async function (it) {
    const from = it.source === 'ZMSOffice' ? '資料助秘文件office彙整' : '其他程式';
    const ok = await FB.dialog({ title: '📥 收到新文件', width: '480px', body: h('div', {},
      h('p', {}, '收到來自「' + from + '」的《' + it.title + '》。'), h('p', { class: 'hint' }, '要把它做成翻頁電子書嗎？（建立後可以再換範本、加朗讀、發佈）')),
    buttons: [{ label: '不要', value: 'no' }, { label: '稍後', value: null }, { label: '建立電子書', primary: true, value: 'yes' }] });
    if (ok === null) return;                 // 稍後：這次開程式不再問，下次開程式會再問
    if (ok === 'yes') {
      let files;
      try { files = await importPaths([it.path], 'pdf'); } catch (e) { return FB.err(e); }
      if (!files.length) return;
      const id = await I.build(files, { name: it.title, q: (S.pref && S.pref.importQ) || 'std' });
      if (!id) return;
      await FB.api('inbox_done', { path: it.path }).catch(() => {});
      FB.openReader(id);
    } else await FB.api('inbox_done', { path: it.path }).catch(FB.err);
  };

  // ------------------------------------------------------------ 轉換
  // 回傳電子書 id；o.append＝加到目前編輯中的書（o.at 插入位置）
  I.build = async function (files, o) {
    const b = FB.busy('準備中…');
    const pages = [], toc = [];
    let stop = false;
    b.cancel = () => (stop = true);
    try {
      for (let fi = 0; fi < files.length && !stop; fi++) {
        const f = files[fi];
        const tag = files.length > 1 ? '（' + (fi + 1) + '／' + files.length + '）' : '';
        let a = f.asset;
        if (a.kind === 'office' || a.kind === 'file') {
          b.set('轉換「' + a.name + '」成 PDF' + tag + '（Office 轉檔約需 10～60 秒）…');
          a = await FB.api('office_pdf', { id: a.id });
        }
        if (a.kind === 'pdf') {
          const startAt = pages.length;
          const r = await pdfPages(a, o.q, (i, n) => b.set('轉換「' + f.name + '」第 ' + i + '／' + n + ' 頁' + tag + '…'), () => stop);
          pages.push(...r.pages);
          const shift = (list) => list.map((t) => ({ title: t.title, page: t.page + startAt, children: shift(t.children || []) }));
          if (r.toc.length) toc.push(...shift(r.toc));
          else if (files.length > 1) toc.push({ title: f.name.replace(/\.[^.]+$/, ''), page: startAt + 1 });
        } else if (a.kind === 'image') {
          b.set('處理圖片 ' + (fi + 1) + '／' + files.length + '…');
          pages.push(await imagePage(a, o.q));
        } else FB.toast('不支援的檔案：' + a.name, 'err');
      }
      if (stop || !pages.length) { b.close(); return null; }
      b.set('儲存電子書…');
      if (o.append && S.book) {
        FB.edit(() => {
          const at = o.at ?? S.book.data.pages.length;
          S.book.data.pages.splice(at, 0, ...pages);
          for (const t of toc) S.book.data.toc.push({ title: t.title, page: t.page + at, children: t.children });
          S.page = at;
        }, 'pages');
        b.close();
        await FB.saveNow();
        FB.toast('已加入 ' + pages.length + ' 頁', 'ok');
        return S.book.id;
      }
      const name = o.name || (files[0].name || '電子書').replace(/\.[^.]+$/, '');
      const source = files.length > 1 ? 'mixed' : (files[0].asset.kind === 'image' ? 'image' : files[0].asset.kind === 'office' ? 'office' : 'pdf');
      const r = await FB.api('book_save', { name, data: { v: 1, pages, toc, settings: FB.defaultSettings() }, source });
      b.close();
      FB.toast('電子書「' + name + '」已建立，共 ' + pages.length + ' 頁', 'ok');
      return r.id;
    } catch (e) { b.close(); FB.err(e); return null; }
  };

  function canvasBlob(cv, q) { return new Promise((r) => cv.toBlob(r, 'image/jpeg', q || 0.86)); }
  async function savePageImage(cv, name) {
    const blob = await canvasBlob(cv, 0.86);
    const a = await FB.raw('upload', blob, { name: name + '.jpg', kind: 'page' });
    // 縮圖（縮圖列、書櫃封面用）
    const th = document.createElement('canvas');
    const k = 260 / cv.height;
    th.width = Math.max(1, Math.round(cv.width * k)); th.height = 260;
    th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
    const t = await FB.raw('upload', await canvasBlob(th, 0.8), { name: name + '-thumb.jpg', kind: 'thumb' });
    return { asset: a.id, thumb: t.id, w: cv.width, h: cv.height };
  }

  async function pdfPages(a, q, progress, stopped) {
    const lib = await loadPdfjs();
    const base = new URL('lib/pdfjs/', location.href).href;
    const doc = await lib.getDocument({ url: FB.mediaURL(a.id), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/' }).promise;
    const target = QUALITY[q] || QUALITY.std;
    const pages = [];
    const refIndex = async (dest) => {
      try {
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (!dest || !dest[0]) return null;
        return typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
      } catch (e) { return null; }
    };
    for (let i = 1; i <= doc.numPages; i++) {
      if (stopped && stopped()) break;
      progress && progress(i, doc.numPages);
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(6, target / Math.max(vp1.width, vp1.height)) });   // 長邊＝目標像素
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: lib.AnnotationMode.ENABLE }).promise;
      const pg = await savePageImage(cv, (a.name || 'pdf').replace(/\.[^.]+$/, '') + '-p' + i);
      // 文字與位置（搜尋、朗讀標示用）
      try {
        const tc = await page.getTextContent();
        const runs = [];
        let text = '';
        for (const it of tc.items) {
          if (!('str' in it)) continue;
          const tx = lib.Util.transform(vp1.transform, it.transform);
          const fh = Math.hypot(tx[2], tx[3]) || it.height || 10;
          const w = (it.width || 0) * (vp1.width ? 1 : 1);
          const x = tx[4] / vp1.width, y = (tx[5] - fh * 0.88) / vp1.height;
          const r = [it.str, +x.toFixed(4), +y.toFixed(4), +(w / vp1.width).toFixed(4), +((fh * 1.15) / vp1.height).toFixed(4)];
          if (it.hasEOL) r.push(1);
          runs.push(r);
          text += it.str + (it.hasEOL ? '\n' : '');
        }
        if (text.trim()) { pg.text = text; pg.runs = runs; }
      } catch (e) { /* 沒有文字層 */ }
      // 超連結 → 頁面上的連結區
      try {
        const ann = await page.getAnnotations();
        const items = [];
        for (const an of ann) {
          if (an.subtype !== 'Link' || !an.rect) continue;
          const r = vp1.convertToViewportRectangle(an.rect);
          const x0 = Math.min(r[0], r[2]) / vp1.width, y0 = Math.min(r[1], r[3]) / vp1.height;
          const w = Math.abs(r[2] - r[0]) / vp1.width, hh = Math.abs(r[3] - r[1]) / vp1.height;
          let action = null;
          if (an.url || an.unsafeUrl) action = { kind: /^mailto:/i.test(an.url || an.unsafeUrl) ? 'mail' : 'url', value: (an.url || an.unsafeUrl).replace(/^mailto:/i, '') };
          else if (an.dest) { const p = await refIndex(an.dest); if (p !== null) action = { kind: 'page', value: p + 1 }; }
          if (action) items.push({ id: FB.uid(), type: 'link', x: x0, y: y0, w, h: hh, action, tip: action.value + '' });
        }
        if (items.length) pg.items = items;
      } catch (e) { /* */ }
      pages.push(pg);
      page.cleanup();
    }
    // 目錄（書籤）
    const toc = [];
    try {
      const walk = async (list, out) => {
        for (const o of list || []) {
          const p = await refIndex(o.dest);
          const t = { title: o.title, page: (p ?? 0) + 1, children: [] };
          out.push(t);
          await walk(o.items, t.children);
        }
      };
      await walk(await doc.getOutline(), toc);
    } catch (e) { /* */ }
    doc.destroy();
    return { pages, toc };
  }

  async function imagePage(a, q) {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('讀不到圖片：' + a.name)); i.src = FB.mediaURL(a.id); });
    const target = QUALITY[q] || QUALITY.std;
    const k = Math.min(1, target / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(im, 0, 0, cv.width, cv.height);
    return savePageImage(cv, (a.name || 'image').replace(/\.[^.]+$/, ''));
  }

  // 空白頁（大小跟第一頁一樣）
  I.blankPage = async function (w, hgt, color) {
    const cv = document.createElement('canvas');
    cv.width = w || 1131; cv.height = hgt || 1600;
    const c = cv.getContext('2d');
    c.fillStyle = color || '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    return savePageImage(cv, 'blank');
  };

  // ------------------------------------------------------------ 示範電子書：自己畫的使用說明頁
  I.samplePages = async function (progress) {
    const W = 1131, H = 1600;
    const P = [
      { t: '資料助秘\n電子書翻頁', s: '使用說明（示範電子書）', c1: '#1d4f7a', c2: '#16a3a0', cover: true, body: ['把 PDF、圖片、簡報、Word、網頁', '變成可以翻頁的電子書'] },
      { t: '① 建立電子書', c1: '#f39c12', body: ['在書櫃按「＋ 建立電子書」。', '可以選 PDF、圖片、相簿資料夾、', 'PowerPoint 簡報、Word 文件，', '或輸入網址擷取線上網頁。', '好幾個檔案可以合併成一本，', '也可以每個檔案各做一本。'] },
      { t: '② 加上互動', c1: '#e74c3c', body: ['在「頁面與互動」可以在頁面上', '加入連結、文字、圖片、影片、', 'YouTube、聲音、圖形、按鈕、QR 碼。', '連結可以開網頁、跳到某一頁、', '打電話或跳出視窗。'] },
      { t: '③ 翻頁', c1: '#8e44ad', body: ['滑鼠移到書頁一角，頁角會微微掀起。', '按住頁角拖曳，就像真的翻書。', '也可以點頁面兩側、按左右箭頭、', '鍵盤 ← →，或轉動滑鼠滾輪。'] },
      { t: '④ 放大與放大鏡', c1: '#2980b9', body: ['工具列的＋可以放大整本書，', '放大後可以拖曳移動。', '「放大鏡」會跟著滑鼠或眼睛移動，', '把看不清楚的小字放大。'] },
      { t: '⑤ 自然人聲朗讀', c1: '#27ae60', body: ['按工具列的喇叭圖示，', '可以選小女孩、年輕女生、成年女性、', '阿嬤，或小男孩、年輕男生、', '成年男性、阿公的聲音，', '唸完自動翻到下一頁。'] },
      { t: '⑥ 眼控模式', c1: '#d35400', body: ['給漸凍人與臥床的朋友：', '用眼動鼠注視按鈕，', '黃色圓圈轉滿就等於按下去。', '兩側有大大的翻頁區，', '注視就能翻頁，不用動手。'] },
      { t: '⑦ 外觀設計', c1: '#16a085', body: ['在「外觀設計」選背景主題：', '經典木紋、深夜藍、牛皮紙……', '還有雪花、星空、花瓣等動態背景。', '可以設定硬封面、右翻書、', '翻頁聲音、背景音樂與密碼。'] },
      { t: '⑧ 發佈分享', c1: '#c0392b', body: ['在「發佈」可以輸出成', '網頁資料夾、ZIP，', '或單一 HTML 檔直接寄給別人。', '還可以預先錄好朗讀語音，', '讀者離線也聽得到自然人聲。'] },
      { t: '開始製作吧！', c1: '#1d4f7a', c2: '#16a3a0', cover: true, body: ['資料助秘電子書翻頁', '開發：吳玉柱 先生 與 Claude AI Opus 5.5'] },
    ];
    const out = [];
    for (let i = 0; i < P.length; i++) {
      progress && progress(i, P.length);
      const p = P[i];
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      const font = (s, b) => (b ? 'bold ' : '') + s + 'px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
      const lines = [];
      if (p.cover) {
        const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.12; c.fillStyle = '#fff';
        for (let k = 0; k < 9; k++) { c.beginPath(); c.arc(W * Math.random(), H * Math.random(), 60 + Math.random() * 240, 0, 6.28); c.fill(); }
        c.globalAlpha = 1;
        // 書本圖示
        c.save(); c.translate(W / 2, H * 0.3);
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-230, -120); c.quadraticCurveTo(-110, -170, 0, -110); c.lineTo(0, 140); c.quadraticCurveTo(-110, 80, -230, 130); c.closePath(); c.fill();
        c.fillStyle = '#ffe9b3'; c.beginPath(); c.moveTo(230, -120); c.quadraticCurveTo(110, -170, 0, -110); c.lineTo(0, 140); c.quadraticCurveTo(110, 80, 230, 130); c.closePath(); c.fill();
        c.fillStyle = '#f2c14e'; c.beginPath(); c.moveTo(230, -120); c.lineTo(130, -60); c.lineTo(230, -20); c.closePath(); c.fill();
        c.restore();
        c.fillStyle = '#fff'; c.textAlign = 'center';
        p.t.split('\n').forEach((s, k) => { c.font = font(130, true); c.fillText(s, W / 2, H * 0.58 + k * 160); lines.push(s); });
        c.font = font(54); (p.body || []).forEach((s, k) => { c.fillText(s, W / 2, H * 0.84 + k * 80); lines.push(s); });
      } else {
        c.fillStyle = '#fffdf8'; c.fillRect(0, 0, W, H);
        c.fillStyle = p.c1; c.fillRect(0, 0, W, 300);
        c.fillStyle = '#fff'; c.font = font(100, true); c.textAlign = 'left'; c.fillText(p.t, 90, 200); lines.push(p.t);
        c.fillStyle = '#333'; c.font = font(56);
        const runs = [[p.t, 90 / W, 105 / H, c.measureText(p.t).width / W, 120 / H, 1]];
        (p.body || []).forEach((s, k) => { const y = 470 + k * 110; c.fillText(s, 90, y); runs.push([s, 90 / W, (y - 52) / H, c.measureText(s).width / W, 68 / H, 1]); lines.push(s); });
        c.fillStyle = '#999'; c.font = font(36); c.textAlign = 'center'; c.fillText('— ' + (i + 1) + ' —', W / 2, H - 70);
        p.runs = runs;
      }
      const pg = await savePageImage(cv, 'sample-' + (i + 1));
      pg.text = lines.join('\n') + '\n';
      if (p.runs) { pg.runs = p.runs; pg.text = p.runs.map((r) => r[0]).join('\n') + '\n'; }
      if (i === 2) pg.items = [{ id: FB.uid(), type: 'button', text: '跳到第 4 頁看翻頁', x: 0.08, y: 0.7, w: 0.5, h: 0.06, bg: '#e74c3c', size: 0.026, action: { kind: 'page', value: 4 }, anim: 'bounce' },
        { id: FB.uid(), type: 'shape', shape: 'star', x: 0.68, y: 0.66, w: 0.22, h: 0.15, fill: 'rgba(243,156,18,.85)', stroke: '#e67e22', anim: 'spin' }];
      if (i === 8) pg.items = [{ id: FB.uid(), type: 'qr', text: 'https://github.com/achir1015/zms-flipbook', x: 0.62, y: 0.7, w: 0.28, h: 0.2, action: { kind: 'url', value: 'https://github.com/achir1015/zms-flipbook' } }];
      out.push(pg);
    }
    return out;
  };

  // 從檔案總管拖檔案到書櫃
  document.addEventListener('dragover', (e) => { if (FB.$('#home').classList.contains('show') && e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!FB.$('#home').classList.contains('show') || !e.dataTransfer.files.length) return;
    e.preventDefault();
    if (!FB.can('BOOK', 2)) return;
    I.dropFiles(e.dataTransfer.files, { q: S.pref.importQ || 'std' });
  });
})();
