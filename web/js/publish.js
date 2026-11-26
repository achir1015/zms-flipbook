/* 第 3 步：發佈 — 網頁資料夾、ZIP、單一 HTML 檔；可以預先產生朗讀語音（自然人聲）放進電子書。 */
(function () {
  const FB = window.FB;
  const { $, h } = FB;
  const S = FB.S;
  const FMTS = [
    ['folder', '🌐', '網頁資料夾', '放到公司網站、NAS 或 GitHub Pages，用網址分享。手機、平板、電腦都能看。'],
    ['zip', '🗜', 'ZIP 壓縮檔', '同上，但壓縮成一個檔案，方便上傳到網站主機或寄送。'],
    ['html', '📄', '單一 HTML 檔', '整本書（含圖片、語音）放進一個 .html 檔，可以直接用 Email、LINE 傳給別人，點兩下就能看，不用網路。'],
  ];

  async function render() {
    const box = $('#pub-main');
    box.innerHTML = '';
    if (!FB.can('PUB', 1)) { box.append(h('p', { class: 'empty' }, '您沒有「發佈輸出」的權限。')); return; }
    const o = (S.pubOpt = S.pubOpt || { fmt: FB.LOCAL ? 'zip' : 'folder', voices: [] });
    if (FB.LOCAL && o.fmt === 'folder') o.fmt = 'zip';
    box.append(h('h2', {}, '發佈電子書'));
    const cards = h('div', { class: 'fmt-grid' }, FMTS.filter((f) => !(FB.LOCAL && f[0] === 'folder')).map(([k, ic, t, d]) => h('div', { class: 'fmt' + (o.fmt === k ? ' on' : ''), 'data-fmt': k, onclick: () => { o.fmt = k; render(); } }, h('div', { class: 'ic' }, ic), h('b', {}, t), h('small', {}, d))));
    box.append(cards);
    const name = h('input', { class: 'inp', value: o.name || S.book.name });
    name.addEventListener('change', () => (o.name = name.value));
    let c = {};
    try { c = await FB.get('company'); } catch (e) { /* */ }
    const folder = h('input', { class: 'inp', value: o.folder || c.out_dir || c.default_out || '' });
    folder.addEventListener('change', () => (o.folder = folder.value));
    if (FB.LOCAL) box.append(h('label', { class: 'fld' }, '檔名', name), h('p', { class: 'hint' }, '線上版發佈後會直接下載到這台裝置的「下載」資料夾。ZIP 解開後上傳到網站，打開 index.html 就是電子書。'));
    else box.append(h('div', { class: 'row' }, h('label', { class: 'fld' }, '名稱', name),
      h('label', { class: 'fld' }, '存放位置', h('div', { class: 'row' }, folder, FB.native ? h('button', { class: 'btn', style: { flex: 'none' }, onclick: async () => { const f = await FB.native.pick_folder(folder.value); if (f) { folder.value = f; o.folder = f; } } }, '選擇…') : null))));
    // 預先錄好朗讀語音
    const voices = await FB.get('voices').catch(() => FB.VOICES);
    const vbox = h('div', { class: 'voice-grid' });
    for (const v of voices) {
      const i = h('input', { type: 'checkbox', checked: o.voices.includes(v.id) ? true : null });
      i.addEventListener('change', () => { o.voices = o.voices.filter((x) => x !== v.id); if (i.checked) o.voices.push(v.id); });
      vbox.append(h('label', { class: 'inline' }, i, (v.gender === '女' ? '👩 ' : '👨 ') + v.name, h('button', { class: 'mini', title: '試聽', onclick: (e) => { e.preventDefault(); FB.sayTest('您好，我來為您朗讀這本電子書。', v.id); } }, '▶')));
    }
    const pages = S.book.data.pages;
    const chars = pages.reduce((n, p) => n + ((p.speak || p.text || '').length), 0);
    if (!FB.LOCAL) box.append(h('div', { class: 'pub-voice' }, h('b', {}, '🔊 預先錄好朗讀語音（給沒有網路、或手機上的讀者也能聽到自然人聲）'),
      h('p', { class: 'hint' }, '勾選要放進去的聲音。這本書約 ' + chars + ' 字，每種聲音約需 ' + Math.max(1, Math.round(chars / 900)) + ' 分鐘產生、增加約 ' + Math.max(1, Math.round(chars * 0.35 / 100)) / 10 + ' MB。不勾選的話，讀者會用他自己裝置上的語音。'),
      vbox));
    box.append(h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { class: 'btn primary big', id: 'btn-publish', onclick: () => go(o) }, '🚀 開始發佈'), h('span')));
    box.append(h('div', { class: 'pub-tips' },
      h('b', {}, '發佈之後'), h('ul', {},
        h('li', {}, '網頁資料夾：把整個資料夾上傳到網站，打開裡面的 index.html 就是電子書。'),
        h('li', {}, '公司內部可以放在 NAS 的網頁伺服器，或用 GitHub Pages 免費架站。'),
        h('li', {}, '單一 HTML 檔最方便分享，但頁數很多時檔案會比較大。'))));
    history();
  }

  async function go(o) {
    await FB.saveNow();
    const btn = $('#btn-publish');
    btn.disabled = true;
    let job;
    try { job = (await FB.api('publish', { id: S.book.id, fmt: o.fmt, folder: o.folder, name: o.name || S.book.name, voices: o.voices })).job; } catch (e) { btn.disabled = false; return FB.err(e); }
    const bar = h('div', { class: 'pbar' }, h('i'));
    const msg = h('div', { class: 'hint' }, '準備中…');
    let closeDlg;
    FB.dialog({ title: '發佈中…', width: '480px', esc: false, body: h('div', {}, msg, bar), buttons: [{ label: '取消', onClick: async () => { await FB.api('publish_cancel', { id: job }); return false; } }], onOpen: (b, c) => (closeDlg = c) });
    for (;;) {
      await new Promise((r) => setTimeout(r, 600));
      let j;
      try { j = await FB.get('publish_job', { id: job }); } catch (e) { break; }
      msg.textContent = j.msg;
      bar.firstChild.style.width = Math.round(j.progress * 100) + '%';
      if (!j.done) continue;
      closeDlg && closeDlg(null);
      btn.disabled = false;
      if (j.error) return FB.err(new Error('發佈失敗：' + j.error));
      if (FB.LOCAL) { FB.toast('✅ 發佈完成，已下載「' + j.path + '」（' + FB.fmtSize(j.size || 0) + '）', 'ok'); history(); return; }
      FB.dialog({ title: '✅ 發佈完成', width: '560px', body: h('div', {}, h('p', {}, '已發佈到：'), h('code', { class: 'path' }, j.path), h('p', { class: 'hint' }, FB.fmtSize(j.size || 0))),
        buttons: [{ label: '在檔案總管顯示', onClick: () => { FB.api('reveal', { path: j.path }); return false; } }, j.path.endsWith('.zip') ? null : { label: '用瀏覽器打開', primary: true, onClick: () => { FB.api('open_published', { path: j.path }); return false; } }, { label: '關閉', value: true }].filter(Boolean) });
      history();
      return;
    }
    btn.disabled = false;
  }

  async function history() {
    const box = $('#pub-history');
    box.innerHTML = '';
    let rows = [];
    try { rows = await FB.get('publishes', { bid: S.book.id }); } catch (e) { return; }
    if (!rows.length) box.append(h('p', { class: 'hint' }, '還沒有發佈過。'));
    const N = { folder: '網頁資料夾', zip: 'ZIP', html: '單一 HTML' };
    for (const r of rows) {
      box.append(h('div', { class: 'pub-it' + (r.exists ? '' : ' gone') }, h('b', {}, N[r.fmt] || r.fmt), h('small', {}, r.created_at + '・' + FB.fmtSize(r.size)),
        h('div', { class: 'p', title: r.path }, r.path),
        FB.LOCAL ? h('small', { class: 'hint' }, '已下載') : r.exists ? h('div', { class: 'row' }, h('button', { class: 'mini', onclick: () => FB.api('reveal', { path: r.path }) }, '📂 顯示'), r.fmt !== 'zip' ? h('button', { class: 'mini', onclick: () => FB.api('open_published', { path: r.path }) }, '🌐 打開') : h('span')) : h('small', { class: 'hint' }, '（檔案已移動或刪除）')));
    }
  }
  FB.on('tab', (t) => { if (t === 'publish') render(); });
})();
