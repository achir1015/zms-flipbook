/* 線上版／手機版的「本機核心」：取代電腦版的 Python 伺服器（docs/ 與手機 App 的 index.html 才會載入，放在 api.js 後面）。
 * - 電子書、頁面圖、素材、偏好設定都存在瀏覽器的 IndexedDB（不會上傳到任何伺服器）
 * - 沒有資料庫與帳號：一個本機使用者，擁有全部權限
 * - 發佈：在瀏覽器裡直接產生 ZIP 或單一 HTML 檔並下載
 * - 朗讀：用裝置自己的語音（Edge 瀏覽器、iPhone、Android 都有自然人聲）
 */
(function () {
  const FB = window.FB;
  FB.WEB = true;
  FB.key = 'web';
  FB.sid = 'web';
  const VERSION = window.FB_WEB_VERSION || '1.0.0';
  const USER = { uid: 'local', name: '我', is_admin: true, perms: { BOOK: 2, PUB: 2, SHARE: 2, SYS: 2 } };
  const URLS = new Map();          // 素材 id → blob: 網址

  // ------------------------------------------------------------ IndexedDB
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('zms-flipbook', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('assets', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('blobs');
        d.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('kv');
        d.createObjectStore('publishes', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => (out = v));
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('儲存失敗（瀏覽器空間可能不足）'));
    });
  }
  const P = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const all = (store) => tx(store, 'readonly', (s) => P(s.getAll()));
  const getOne = (store, k) => tx(store, 'readonly', (s) => P(s.get(k)));
  const put = (store, v, k) => tx(store, 'readwrite', (s) => P(k === undefined ? s.put(v) : s.put(v, k)));
  const del = (store, k) => tx(store, 'readwrite', (s) => P(s.delete(k)));
  const now = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const bizErr = (m) => new Error(m);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => 0);   // 請瀏覽器不要自動清掉資料

  // ------------------------------------------------------------ 素材
  function kindOf(name) {
    if (/\.pdf$/i.test(name)) return 'pdf';
    if (/\.(jpe?g|png|gif|bmp|webp|svg|jfif)$/i.test(name)) return 'image';
    if (/\.(mp4|m4v|mov|webm|ogv)$/i.test(name)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)) return 'audio';
    if (/\.(pptx?|ppsx?|odp|docx?|rtf|odt|txt|xlsx?|ods)$/i.test(name)) return 'office';
    return 'file';
  }
  const pub = (r) => ({ id: r.id, kind: r.kind, name: r.name, size: r.size, w: r.w, h: r.h, ext: (r.name.match(/\.[^.]+$/) || [''])[0].toLowerCase() });
  async function addAsset(blob, name, kind) {
    kind = kind && kind !== 'undefined' ? kind : kindOf(name);
    let w = 0, h = 0;
    if (['page', 'thumb', 'image'].includes(kind) && window.createImageBitmap && !/svg/.test(blob.type)) {
      try { const b = await createImageBitmap(blob); w = b.width; h = b.height; b.close && b.close(); } catch (e) { /* */ }
    }
    const rec = { kind, name: name || 'file', size: blob.size, w, h, type: blob.type || '', created: now() };
    const id = await put('assets', rec);
    await put('blobs', blob, id);
    rec.id = id;
    URLS.set(id, URL.createObjectURL(blob));
    return pub(rec);
  }
  async function ensureUrls(ids) {
    const miss = [...ids].filter((id) => !URLS.has(id));
    if (!miss.length) return;
    await tx('blobs', 'readonly', (s) => Promise.all(miss.map(async (id) => { const b = await P(s.get(id)); if (b) URLS.set(id, URL.createObjectURL(b)); })));
  }
  function walk(o, ids) {
    const KEYS = ['asset', 'thumb', 'media', 'audio', 'poster', 'logo', 'bgImage', 'music', 'flipSound'];
    if (Array.isArray(o)) o.forEach((v) => walk(v, ids));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (KEYS.includes(k) && typeof v === 'number') ids.add(v); else walk(v, ids); }
    return ids;
  }
  const blobOf = (id) => getOne('blobs', id);

  // ------------------------------------------------------------ 「API」
  const pref = async () => (await getOne('kv', 'pref')) || {};
  const R = {
    state: async () => ({ ready: true, error: '', app: window.ZMSIOS ? '資料助秘電子書翻頁' : '資料助秘電子書翻頁（線上版）', version: window.ZMSIOS ? window.ZMSIOS.version : VERSION, credit: '開發：吳玉柱 先生 與 Claude AI Opus 5.5', native: false,
      has_users: true, user: USER, funcs: [], roles: {} }),
    last_user: async () => ({ uid: 'local' }),
    logout: async () => ({}),
    pref: async (b) => { if (b && Object.keys(b).length) { const p = Object.assign(await pref(), b); await put('kv', p, 'pref'); return p; } return pref(); },
    company: async () => ({ name: '', out_dir: '', default_out: '（瀏覽器的下載資料夾）' }),
    voices: async () => FB.VOICES,
    books: async () => {
      const rows = (await all('books')).sort((a, b) => (a.updated < b.updated ? 1 : -1));
      await ensureUrls(new Set(rows.map((r) => r.cover).filter((x) => typeof x === 'number')));
      return rows.map((r) => ({ id: r.id, name: r.name, owner: 'local', owner_name: '我', shared: 0, pages: r.pages, cover: r.cover, source: r.source || '', updated_at: r.updated, mine: true }));
    },
    book: async (b, q) => {
      const r = await getOne('books', +(q.id || b.id));
      if (!r) throw bizErr('找不到這本電子書');
      const ids = walk(r.data, new Set());
      await ensureUrls(ids);
      const assets = {};
      for (const a of await tx('assets', 'readonly', (s) => Promise.all([...ids].map((id) => P(s.get(id)))))) if (a) assets[a.id] = pub(a);
      return { id: r.id, name: r.name, owner: 'local', shared: 0, data: r.data, assets, mine: true, editable: true };
    },
    book_save: async (b) => {
      const pages = (b.data && b.data.pages) || [];
      const rec = b.id ? (await getOne('books', +b.id)) || {} : { created: now(), source: b.source || '' };
      Object.assign(rec, { name: (b.name || '').trim().slice(0, 120) || '未命名電子書', data: b.data || {}, pages: pages.length, cover: pages.length ? (pages[0].thumb ?? pages[0].asset) : null, updated: now() });
      if (b.id) rec.id = +b.id;
      return { id: await put('books', rec) };
    },
    book_meta: async (b) => { const r = await getOne('books', +b.id); if (!r) return {}; if (b.name !== undefined) r.name = (b.name || '').trim() || '未命名電子書'; r.updated = now(); await put('books', r); return {}; },
    book_copy: async (b) => { const r = await getOne('books', +b.id); delete r.id; r.name += '（複製）'; r.updated = now(); return { id: await put('books', r) }; },
    book_delete: async (b) => {
      await del('books', +b.id);
      // 沒有其他書用到的素材一起刪掉，釋放瀏覽器空間
      const used = new Set();
      for (const bk of await all('books')) walk(bk.data, used);
      const lone = (await all('assets')).filter((a) => ['page', 'thumb', 'image', 'video', 'audio', 'pdf'].includes(a.kind) && !used.has(a.id) && a.kind !== 'pdf');
      for (const a of lone) { await del('assets', a.id); await del('blobs', a.id); const u = URLS.get(a.id); if (u) { URL.revokeObjectURL(u); URLS.delete(a.id); } }
      return {};
    },
    assets: async () => (await all('assets')).filter((a) => ['image', 'video', 'audio'].includes(a.kind)).reverse().map(pub),
    office_pdf: async () => { throw bizErr('線上版不能轉換 PowerPoint／Word：請先在 Office 裡「另存成 PDF」，再匯入 PDF；或使用電腦版。'); },
    web_pdf: async () => { throw bizErr('線上版不能擷取網頁（瀏覽器安全限制），請使用電腦版。'); },
    import_paths: async () => { throw bizErr('線上版請直接選擇檔案'); },
    update_check: async () => {
      const app = window.ZMSIOS || window.ZMSAndroid;
      if (!app) return { latest: true, info: null, current: VERSION, note: '線上版每次打開都是最新版。' };
      const cur = window.ZMSIOS ? window.ZMSIOS.version : (window.ZMSAndroid.getVersion ? window.ZMSAndroid.getVersion() : VERSION);
      const r = await fetch('https://api.github.com/repos/achir1015/zms-flipbook/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw bizErr('無法連到更新伺服器（' + r.status + '）');
      const rel = await r.json();
      const want = window.ZMSIOS ? /-ios\.ipa$/ : /-android\.apk$/;
      const asset = (rel.assets || []).find((x) => want.test(x.name));
      const ver = (rel.tag_name || '').replace(/^v/i, '');
      const num = (v) => v.split('.').map((x) => +x || 0).reduce((t, x) => t * 1000 + x, 0);
      if (!asset || num(ver) <= num(cur)) return { latest: true, info: null, current: cur };
      const page = window.ZMSIOS ? 'https://achir1015.github.io/zms-flipbook/ios/' : asset.browser_download_url;
      return { latest: false, current: cur, info: { version: ver, notes: rel.body || '', page, size: asset.size, name: '' } };
    },
    publish: async (b) => {
      const id = 'p' + Date.now();
      JOBS[id] = { id, progress: 0, msg: '準備中…', done: false, error: '', path: '' };
      publish(JOBS[id], +b.id, b.fmt === 'html' ? 'html' : 'zip', b.name).catch((e) => { JOBS[id].error = e.message || String(e); JOBS[id].done = true; });
      return { job: id };
    },
    publish_job: async (b, q) => JOBS[q.id || b.id] || { done: true, error: '找不到發佈工作' },
    publish_cancel: async (b) => { if (JOBS[b.id]) JOBS[b.id].cancel = true; return {}; },
    publishes: async (b, q) => (await all('publishes')).filter((r) => !q.bid || r.book_id === +q.bid).reverse(),
    reveal: async () => ({}),
    open_published: async () => ({}),
  };
  const JOBS = {};

  async function call(name, body, q) {
    const f = R[name];
    if (!f) throw new Error('線上版沒有這個功能：' + name);
    return f(body || {}, q || {});
  }
  // Android 返回鍵：先關對話框、閱讀器面板，再從閱讀／編輯畫面回書櫃（回傳 true＝已處理）
  window.__zmsBack = function () {
    const dlg = document.querySelector('.dlg-wrap');
    if (dlg) { const x = dlg.querySelector('.dlg .x'); if (x) x.click(); else dlg.remove(); return true; }
    const pop = document.querySelector('.fbr-pop, .fbr-lock');
    if (pop) { pop.remove(); return true; }
    const pnl = document.querySelector('.fbr-panel.show');
    if (pnl) { pnl.classList.remove('show'); return true; }
    const pv = document.querySelector('.pv-full .pv-close');
    if (pv) { pv.click(); return true; }
    if (!document.getElementById('home').classList.contains('show')) { if (FB.Guide) FB.Guide.stop(); FB.gotoHome(); return true; }
    return false;
  };
  if (window.ZMSAndroid && window.ZMSAndroid.openUrl) window.open = (u) => { if (u) window.ZMSAndroid.openUrl(String(u)); else FB.toast('Android 版不支援這個功能（列印請用電腦版）'); return null; };
  FB.api = (name, body) => call(name, body);
  FB.get = (name, params) => call(name, {}, params || {});
  FB.raw = async (name, bytes, params) => {
    if (name !== 'upload') throw new Error('線上版沒有這個功能：' + name);
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
    return addAsset(blob, (params && params.name) || blob.name || 'file', params && params.kind);
  };
  FB.upload = (file, kind) => FB.raw('upload', file, { name: file.name || 'file', kind: kind || '' });
  FB.mediaURL = (id) => URLS.get(+id) || '';
  FB.LOCAL = { tts: async () => null };

  // ------------------------------------------------------------ 發佈（瀏覽器內）
  const READER = ['reader.css', 'flip.js', 'qrcode.js', 'reader.js'];
  async function publish(job, bid, fmt, name) {
    const step = (p, m) => { job.progress = p; job.msg = m; if (job.cancel) throw new Error('已取消'); };
    const r = await getOne('books', bid);
    const data = r.data || {};
    const book = { id: 'b' + bid, title: r.name, pages: data.pages || [], toc: data.toc || [], settings: data.settings || {} };
    const ids = [...walk(book, new Set())].sort((a, b) => a - b);
    const files = [];          // [路徑, Uint8Array]
    const amap = {};
    for (let i = 0; i < ids.length; i++) {
      step(0.05 + 0.7 * i / Math.max(1, ids.length), '整理頁面與素材 ' + (i + 1) + '／' + ids.length);
      const a = await getOne('assets', ids[i]);
      const blob = await blobOf(ids[i]);
      if (!a || !blob) continue;
      const ext = (a.name.match(/\.[^.]+$/) || ['.bin'])[0].toLowerCase();
      if (fmt === 'html') amap[ids[i]] = await dataUrl(blob);
      else { const p = 'files/assets/a' + ids[i] + ext; amap[ids[i]] = p; files.push([p, new Uint8Array(await blob.arrayBuffer())]); }
    }
    book.assets = amap;
    step(0.8, '加入閱讀器');
    const src = {};
    for (const f of READER) src[f] = await (await fetch('reader/' + f)).text();
    const js = 'window.FB_BOOK=' + JSON.stringify(book) + ';';
    const safe = (name || r.name || '電子書').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').trim().slice(0, 80) || '電子書';
    let out, fname;
    if (fmt === 'html') {
      const inline = READER.slice(1).map((f) => '<script>' + src[f].replace(/<\/script/g, '<\\/script') + '</script>').join('') + '<script>' + js.replace(/<\/script/g, '<\\/script') + '</script>';
      out = new Blob([pageHtml(r.name, '<style>' + src['reader.css'] + '</style>', inline)], { type: 'text/html' });
      fname = safe + '.html';
    } else {
      const enc = new TextEncoder();
      for (const f of READER) files.push(['files/' + f, enc.encode(src[f])]);
      files.push(['files/book.js', enc.encode(js)]);
      files.push(['index.html', enc.encode(pageHtml(r.name, '<link rel="stylesheet" href="files/reader.css">', READER.slice(1).map((f) => '<script src="files/' + f + '"></script>').join('') + '<script src="files/book.js"></script>'))]);
      step(0.92, '壓縮成 ZIP');
      out = zip(files.map(([p, d]) => [safe + '/' + p, d]));
      fname = safe + '.zip';
    }
    step(0.98, '下載中');
    FB.download(out, fname);
    await put('publishes', { book_id: bid, fmt, path: fname, size: out.size, created_at: now(), exists: false });
    Object.assign(job, { done: true, progress: 1, msg: '完成', path: fname, size: out.size });
  }
  FB.download = function (blob, name) {
    if (window.ZMSAndroid && window.ZMSAndroid.saveBegin) {     // Android App：分段傳給 App 存到「下載/電子書翻頁」，再開分享選單
      (async () => {
        const b = JSON.parse(window.ZMSAndroid.saveBegin(name, blob.type || 'application/octet-stream'));
        if (b.status !== 'ok') throw new Error(b.message);
        const CH = 3 * 256 * 1024;
        for (let off = 0; off < blob.size; off += CH) {
          const u8 = new Uint8Array(await blob.slice(off, off + CH).arrayBuffer());
          let bin = '';
          for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          const r = JSON.parse(window.ZMSAndroid.saveChunk(b.id, btoa(bin)));
          if (r.status !== 'ok') throw new Error(r.message);
        }
        const e = JSON.parse(window.ZMSAndroid.saveEnd(b.id));
        if (e.status !== 'ok') throw new Error(e.message);
        FB.toast('已存到手機的「' + e.path + '」', 'ok');
      })().catch((e) => FB.toast('存檔失敗：' + e.message, 'err'));
      return;
    }
    if (window.ZMSIOS) {         // iPhone／iPad App：傳給 App 內的伺服器 → 分享選單（存到檔案、LINE、Email…）
      fetch('/__save?name=' + encodeURIComponent(name), { method: 'POST', body: blob }).catch((e) => FB.toast('存檔失敗：' + e.message, 'err'));
      return;
    }
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  };
  const dataUrl = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  function pageHtml(title, css, js) {
    const t = String(title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return '<!DOCTYPE html>\n<html lang="zh-Hant-TW"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">\n' +
      '<meta name="generator" content="資料助秘電子書翻頁">\n<title>' + t + '</title>' + css +
      '\n<style>html,body{margin:0;height:100%;background:#222;overflow:hidden}#book{position:fixed;inset:0}</style>\n</head><body><div id="book"></div>' + js +
      "\n<script>\n(function(){var p={};try{p=JSON.parse(localStorage.getItem('fbr_pref')||'{}')}catch(e){}\nwindow.FB.Reader.mount(document.getElementById('book'),window.FB_BOOK,{pref:p});})();\n</script>\n<!-- 開發：吳玉柱 先生 與 Claude AI Opus 5.5 -->\n</body></html>";
  }
  // 最簡單的 ZIP（不壓縮：頁面已經是 JPEG）；檔名用 UTF-8
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(entries) {
    const enc = new TextEncoder(), parts = [], cen = [];
    let off = 0;
    const d0 = new Date(), dt = ((d0.getFullYear() - 1980) << 9 | (d0.getMonth() + 1) << 5 | d0.getDate()), tm = (d0.getHours() << 11 | d0.getMinutes() << 5 | (d0.getSeconds() >> 1));
    for (const [name, data] of entries) {
      const nb = enc.encode(name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      cen.push(c.buffer, nb);
      off += 30 + nb.length + data.length;
    }
    const csize = cen.reduce((n, b) => n + (b.byteLength ?? b.length), 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, e.buffer], { type: 'application/zip' });
  }
})();
