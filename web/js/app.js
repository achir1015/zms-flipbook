/* 主程式：啟動、登入、書櫃、閱讀、編輯畫面的共用狀態（目前的書、選取、復原、自動儲存）。 */
(function () {
  const FB = window.FB;
  const { $, $$, h } = FB;
  const S = (FB.S = { state: null, user: null, book: null, page: 0, sel: null, tab: 'pages', undo: [], redo: [], dirty: false, pref: {} });

  // ================================================================ 啟動
  FB.boot = async function () {
    if (!FB.key && !FB.LOCAL) { $('#splash-msg').textContent = '請從程式開啟（缺少連線金鑰）'; return; }
    for (let i = 0; i < 240; i++) {
      try {
        const st = await FB.get('state');
        S.state = st;
        $('#credit').textContent = st.credit + '　版本 ' + st.version;
        if (st.error) { $('#splash-msg').textContent = st.error; return; }
        if (st.ready) break;
      } catch (e) { $('#splash-msg').textContent = e.message; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (S.state.user) { S.user = S.state.user; await loadPref(); return FB.gotoHome(!!FB.LOCAL); }
    FB.showLogin();
  };
  async function loadPref() { try { S.pref = await FB.get('pref'); } catch (e) { S.pref = {}; } }
  FB.savePref = (p) => { Object.assign(S.pref, p); FB.api('pref', p).catch(() => 0); };
  // 螢幕縮放比例很大（筆電 150%、175%）時，畫面裝不下 → 整體自動縮小到剛好放得下
  function fitZoom() {
    const z = Math.min(1, window.innerWidth / 1280, window.innerHeight / 760);
    document.documentElement.style.zoom = z < 0.98 ? Math.max(0.6, z).toFixed(3) : '';
  }
  window.addEventListener('resize', fitZoom);
  fitZoom();
  FB.screen = (id) => { $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id)); };
  FB.onLoggedOut = () => { FB.setSession(''); S.user = null; FB.showLogin(); };
  FB.can = (f, lvl) => !!S.user && (S.user.is_admin || (S.user.perms[f] || 0) >= (lvl || 1));
  FB.uid = () => Math.random().toString(36).slice(2, 10);
  FB.ttsUrl = (text, voice, speed) => '/tts?k=' + encodeURIComponent(FB.key) + '&s=' + encodeURIComponent(FB.sid) + '&v=' + encodeURIComponent(voice || 'f-adult') + '&r=' + (speed || 1) + '&t=' + encodeURIComponent(text);
  // 給閱讀器用的朗讀：先確認伺服器產生得出來（失敗就回 null → 閱讀器改用裝置內建語音）
  FB.tts = async (text, voice, speed, prefetchOnly) => {
    if (FB.LOCAL) return FB.LOCAL.tts ? FB.LOCAL.tts(text, voice, speed) : null;
    const u = FB.ttsUrl(text, voice, speed);
    const r = await fetch(u);
    if (!r.ok) { let m = '語音產生失敗'; try { m = (await r.json()).error || m; } catch (e) { /* */ } if (!prefetchOnly) FB.toast(m + '，改用電腦內建語音', 'err'); return null; }
    if (prefetchOnly) return null;
    return URL.createObjectURL(await r.blob());
  };
  // 試聽一句（屬性面板、發佈頁的 ▶）：電腦版用自然人聲；線上版用裝置語音
  FB.sayTest = async (text, voice) => {
    if (!FB.LOCAL) { const u = await FB.tts(text, voice, 1); if (u) new Audio(u).play(); return; }
    const A = window.ZMSAndroid;
    if (A && A.ttsSpeak) { if (!A.ttsAvailable()) return FB.toast('手機沒有中文語音，請到「設定 → 文字轉語音」下載中文語音', 'err'); A.ttsSpeak(text, 1, /child/.test(voice) ? 1.4 : /elder/.test(voice) ? 0.8 : 1, 'test'); return; }
    if (!window.speechSynthesis) return FB.toast('這個瀏覽器沒有語音功能', 'err');
    const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-TW';
    const vs = speechSynthesis.getVoices().filter((x) => /^zh/i.test(x.lang));
    const v = vs.find((x) => /Natural|Online/i.test(x.name) && /TW/i.test(x.lang)) || vs.find((x) => /TW/i.test(x.lang)) || vs[0];
    if (v) u.voice = v;
    if (/child/.test(voice)) u.pitch = 1.5; else if (/elder/.test(voice)) u.pitch = 0.75;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
  FB.readerOpts = (extra) => Object.assign({ url: (id) => FB.mediaURL(id), tts: FB.LOCAL ? null : FB.tts, pref: S.pref, savePref: FB.savePref,
    fullscreen: FB.native ? () => FB.native.toggle_fullscreen() : null }, extra || {});

  // ================================================================ 登入
  FB.showLogin = async function () {
    FB.screen('login');
    const f = $('#login-form');
    f.innerHTML = '';
    const first = !S.state.has_users;
    $('#login-sub').textContent = first ? '第一次使用：請建立系統管理員帳號' : '請登入';
    const uid = h('input', { class: 'inp', id: 'lg-uid', autocomplete: 'username' });
    const name = h('input', { class: 'inp', id: 'lg-name' });
    const pw = h('input', { class: 'inp', type: 'password', id: 'lg-pw', autocomplete: first ? 'new-password' : 'current-password' });
    const pw2 = h('input', { class: 'inp', type: 'password', id: 'lg-pw2' });
    const go = async () => {
      try {
        let r;
        if (first) {
          if (pw.value !== pw2.value) throw new Error('兩次輸入的密碼不一樣');
          r = await FB.api('setup', { uid: uid.value.trim(), name: name.value.trim() || uid.value.trim(), pw: pw.value });
        } else r = await FB.api('login', { uid: uid.value.trim(), pw: pw.value });
        FB.setSession(r.session);
        S.state = await FB.get('state');
        S.user = S.state.user;
        await loadPref();
        FB.gotoHome(true);
      } catch (e) { FB.err(e); }
    };
    [uid, name, pw, pw2].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    f.append(h('label', { class: 'fld' }, '帳號', uid));
    if (first) f.append(h('label', { class: 'fld' }, '姓名', name));
    f.append(h('label', { class: 'fld' }, '密碼' + (first ? '（至少 6 個字）' : ''), pw));
    if (first) f.append(h('label', { class: 'fld' }, '再輸入一次密碼', pw2));
    f.append(h('button', { class: 'btn primary', id: 'lg-go', onclick: go }, first ? '建立並開始使用' : '登入'));
    try { const lu = await FB.get('last_user'); if (lu.uid && !first) { uid.value = lu.uid; pw.focus(); } else uid.focus(); } catch (e) { uid.focus(); }
  };

  // ================================================================ 使用者選單
  function userMenu(btn) {
    const items = [['🔊 語音動態教學', () => FB.Guide.menu()]];
    if (!FB.LOCAL) items.push(['🔑 變更密碼', changePw]);
    if (FB.can('SYS', 1) && !FB.LOCAL) items.push(null, ['👥 使用者與權限', () => FB.Admin.users()], ['🏢 公司設定', () => FB.Admin.company()], ['📜 操作紀錄', () => FB.Admin.audit()]);
    if (FB.can('SYS', 2) && !FB.LOCAL) items.push(['💾 備份與還原', () => FB.Admin.backup()]);
    items.push(null, ['⬆ 檢查更新', () => FB.Admin.update()]);
    if (!FB.LOCAL) items.push(['🖥 建立桌面捷徑', () => FB.Admin.shortcut()]);
    items.push(['ℹ 關於', () => FB.Admin.about()]);
    if (!FB.LOCAL) items.push(null, ['🚪 登出', logout]);
    FB.menu(btn, items);
  }
  FB.menu = function (anchor, items) {
    $$('.menu').forEach((m) => m.remove());
    const m = h('div', { class: 'menu' }, items.map((it) => it ? h('button', { onclick: () => { m.remove(); it[1](); } }, it[0]) : h('hr')));
    document.body.append(m);
    const r = FB.rect(anchor);
    m.style.top = r.bottom + 4 + 'px';
    m.style.left = Math.min(window.innerWidth / FB.Z() - m.offsetWidth - 8, r.left) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  };
  async function changePw() {
    const o = h('input', { class: 'inp', type: 'password' }), n = h('input', { class: 'inp', type: 'password' }), n2 = h('input', { class: 'inp', type: 'password' });
    await FB.dialog({ title: '變更密碼', body: h('div', {}, h('label', { class: 'fld' }, '舊密碼', o), h('label', { class: 'fld' }, '新密碼（至少 6 個字）', n), h('label', { class: 'fld' }, '再輸入一次', n2)),
      buttons: [{ label: '取消', value: null }, { label: '變更', primary: true, onClick: async () => { if (n.value !== n2.value) throw new Error('兩次新密碼不一樣'); await FB.api('password', { old: o.value, new: n.value }); FB.toast('密碼已變更', 'ok'); } }] });
  }
  async function logout() {
    if (S.book) await FB.saveNow();
    await FB.api('logout').catch(() => 0);
    FB.setSession(''); S.user = null; S.book = null;
    S.state = await FB.get('state');
    FB.showLogin();
  }
  $('#home-user').addEventListener('click', (e) => userMenu(e.currentTarget));
  $('#ed-user').addEventListener('click', (e) => userMenu(e.currentTarget));
  $('#home-guide').addEventListener('click', () => FB.Guide.menu());
  $('#btn-guide').addEventListener('click', () => FB.Guide.menu());

  // ================================================================ 書櫃
  FB.gotoHome = async function (fromLogin) {
    if (S.book) { await FB.saveNow(); S.book = null; }
    closeReader();
    FB.screen('home');
    $$('.uname').forEach((e) => (e.textContent = S.user.name));
    $('#btn-new').disabled = !FB.can('BOOK', 2);
    $('#btn-sample').disabled = !FB.can('BOOK', 2);
    const grid = $('#book-grid');
    grid.innerHTML = '';
    let rows = [];
    try { rows = await FB.get('books'); } catch (e) { FB.err(e); }
    if (!rows.length) grid.append(h('div', { class: 'empty' }, FB.can('BOOK', 2) ? ['書櫃還是空的。按右上角「＋ 建立電子書」，匯入 PDF、圖片、簡報、Word 或網頁，馬上變成可以翻頁的電子書！', h('br'), h('br'),
      h('button', { class: 'btn big', onclick: () => FB.makeSample() }, '📘 先建立一本示範電子書看看')] : '目前沒有可以閱讀的電子書。'));
    for (const b of rows) {
      const cov = h('div', { class: 'cover' }, h('span', {}, '📖'));
      if (b.cover) { cov.style.backgroundImage = 'url("' + FB.mediaURL(b.cover) + '")'; cov.innerHTML = ''; }
      const acts = h('div', { class: 'acts' });
      acts.append(h('button', { class: 'mini', onclick: (e) => { e.stopPropagation(); FB.openReader(b.id); } }, '📖 閱讀'));
      if ((b.mine && FB.can('BOOK', 2)) || (!b.mine && FB.can('SHARE', 2))) acts.append(h('button', { class: 'mini', onclick: (e) => { e.stopPropagation(); FB.openBook(b.id); } }, '✎ 編輯'));
      if (b.mine && FB.can('BOOK', 2)) {
        acts.append(h('button', { class: 'mini', title: '更多', onclick: (e) => { e.stopPropagation(); FB.menu(e.currentTarget, [
          ['✏ 改名', () => rename(b)],
          ['⧉ 複製一本', async () => { await FB.api('book_copy', { id: b.id }).catch(FB.err); FB.gotoHome(); }],
          [b.shared ? '🔒 取消分享' : '👥 分享給同事閱讀', async () => { await FB.api('book_meta', { id: b.id, shared: !b.shared }).catch(FB.err); FB.gotoHome(); }],
          null,
          ['🗑 刪除', async () => { if (await FB.confirm('確定要刪除電子書「' + b.name + '」嗎？', '刪除', true)) { await FB.api('book_delete', { id: b.id }).catch(FB.err); FB.gotoHome(); } }]]); } }, '⋯'));
      }
      grid.append(h('div', { class: 'bcard', title: '點一下開始閱讀', onclick: () => FB.openReader(b.id) }, h('div', { class: 'shelf' }, cov),
        h('div', { class: 'info' }, h('div', { class: 'name' }, b.name),
          h('div', { class: 'meta' }, h('span', {}, b.pages + ' 頁'), h('span', {}, b.updated_at),
            b.shared ? h('span', { class: 'badge' }, '已分享') : null, !b.mine ? h('span', { class: 'badge' }, b.owner_name || b.owner) : null)),
        acts));
    }
    if (fromLogin) FB.Guide.autoStart();
    FB.Import.watchInbox();
  };
  async function rename(b) {
    const n = await FB.prompt('電子書改名', b.name, '新書名');
    if (n) { await FB.api('book_meta', { id: b.id, name: n }).catch(FB.err); FB.gotoHome(); }
  }
  $('#btn-new').addEventListener('click', () => FB.Import.newBook());
  $('#btn-sample').addEventListener('click', () => FB.makeSample());

  // ================================================================ 閱讀
  let reader = null;
  function closeReader() { if (reader) { reader.destroy(); reader = null; } }
  FB.bookForReader = (b) => ({ id: 'b' + b.id, title: b.name, pages: b.data.pages || [], toc: b.data.toc || [], settings: b.data.settings || {} });
  FB.openReader = async function (id, page) {
    let b;
    try { b = await FB.get('book', { id }); } catch (e) { return FB.err(e); }
    if (!(b.data.pages || []).length) { FB.toast('這本書還沒有頁面'); if (b.editable) FB.openBook(id); return; }
    FB.screen('read');
    $('#read-title').textContent = b.name;
    $('#read-edit').style.display = b.editable ? '' : 'none';
    $('#read-edit').onclick = () => { closeReader(); FB.openBook(id); };
    closeReader();
    reader = FB.Reader.mount($('#read-box'), FB.bookForReader(b), FB.readerOpts({ embedded: true, startPage: page }));
    FB.reader = reader;
  };
  $('#read-back').addEventListener('click', () => { closeReader(); FB.gotoHome(); });

  // ================================================================ 編輯
  FB.openBook = async function (id) {
    let b;
    try { b = await FB.get('book', { id }); } catch (e) { return FB.err(e); }
    b.data = b.data || {};
    b.data.pages = b.data.pages || [];
    b.data.toc = b.data.toc || [];
    b.data.settings = Object.assign(FB.defaultSettings(), b.data.settings || {});
    S.book = b; S.page = 0; S.sel = null; S.undo = []; S.redo = []; S.dirty = false;
    closeReader();
    FB.screen('editor');
    $$('.uname').forEach((e) => (e.textContent = S.user.name));
    $('#book-name').value = b.name;
    $('#book-name').readOnly = !b.editable;
    FB.setTab('pages');
    setSaveState(b.editable ? '' : '（唯讀：別人分享的電子書）');
  };
  FB.setTab = function (t) {
    S.tab = t;
    $$('.steps .step').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('#editor .tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + t));
    FB.emit('tab', t);
  };
  $$('.steps .step').forEach((b) => b.addEventListener('click', () => FB.setTab(b.dataset.tab)));
  $('#btn-back').addEventListener('click', () => FB.gotoHome());
  $('#btn-preview').addEventListener('click', async () => { if (!S.book) return; await FB.saveNow(); FB.preview(S.page); });
  FB.preview = function (page) {
    const box = h('div', { class: 'pv-wrap' });
    const close = () => { r.destroy(); wrap.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('.fbr-panel.show')) close(); };
    const wrap = h('div', { class: 'pv-full' }, h('button', { class: 'pv-close', onclick: close, title: '關閉預覽（Esc）' }, '✕ 關閉預覽'), box);
    document.body.append(wrap);
    document.addEventListener('keydown', esc);
    const r = FB.Reader.mount(box, FB.bookForReader(S.book), FB.readerOpts({ embedded: true, startPage: page }));
  };
  $('#book-name').addEventListener('change', (e) => { if (!S.book) return; S.book.name = e.target.value.trim() || '未命名電子書'; FB.changed('name'); });

  // ---------------------------------------------------------------- 修改、復原、自動儲存
  // FB.edit(fn)：修改前先存一份復原點
  FB.edit = function (fn, what) {
    if (!S.book || !S.book.editable) return;
    S.undo.push(JSON.stringify(S.book.data));
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
    fn();
    FB.changed(what || 'edit');
  };
  FB.changed = function (what) {
    if (!S.book) return;
    S.dirty = true;
    setSaveState('尚未儲存…');
    clearTimeout(FB._saveT);
    FB._saveT = setTimeout(() => FB.saveNow(), 1200);
    FB.emit('change', what);
  };
  function undoRedo(from, to) {
    if (!S.book || !from.length) return;
    to.push(JSON.stringify(S.book.data));
    S.book.data = JSON.parse(from.pop());
    S.page = Math.min(S.page, Math.max(0, S.book.data.pages.length - 1));
    S.sel = null;
    FB.changed('undo');
  }
  $('#btn-undo').addEventListener('click', () => undoRedo(S.undo, S.redo));
  $('#btn-redo').addEventListener('click', () => undoRedo(S.redo, S.undo));
  document.addEventListener('keydown', (e) => {
    if (!$('#editor').classList.contains('show') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(S.undo, S.redo); }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(S.redo, S.undo); }
  });
  function setSaveState(t) { $('#save-state').textContent = t; }
  FB.saveNow = async function () {
    clearTimeout(FB._saveT);
    if (!S.book || !S.dirty || !S.book.editable) return;
    S.dirty = false;
    try {
      await FB.api('book_save', { id: S.book.id, name: S.book.name, data: S.book.data });
      setSaveState('已自動儲存 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { S.dirty = true; setSaveState('儲存失敗'); FB.err(e); }
  };
  window.addEventListener('beforeunload', () => { if (S.dirty) FB.saveNow(); });

  // ================================================================ 示範電子書（使用說明，自己畫的頁面）
  FB.makeSample = async function () {
    const b = FB.busy('建立示範電子書…');
    try {
      const pages = await FB.Import.samplePages((i, n) => b.set('畫第 ' + (i + 1) + '／' + n + ' 頁…'));
      const settings = Object.assign(FB.defaultSettings(), { theme: 'wood', hard: true });
      const toc = [{ title: '封面', page: 1 }, { title: '建立電子書', page: 2 }, { title: '翻頁與閱讀', page: 4 }, { title: '朗讀與眼控', page: 6 }, { title: '發佈分享', page: 8 }];
      const r = await FB.api('book_save', { name: '資料助秘電子書翻頁 使用說明（示範）', data: { v: 1, pages, toc, settings }, source: 'sample' });
      b.close();
      FB.toast('示範電子書已建立，試試看拖曳書頁的一角！', 'ok');
      FB.openReader(r.id);
    } catch (e) { b.close(); FB.err(e); }
  };
})();
