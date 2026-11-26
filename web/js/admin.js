/* 系統管理：使用者與權限、公司設定、操作紀錄、備份還原、版本更新、桌面捷徑、關於。 */
(function () {
  const FB = window.FB;
  const { h } = FB;
  const LV = ['無', '查詢', '維護'];

  async function users() {
    let rows;
    try { rows = await FB.get('users'); } catch (e) { return FB.err(e); }
    const st = FB.S.state;
    const tbody = h('tbody');
    for (const u of rows) {
      tbody.append(h('tr', {}, h('td', {}, u.uid), h('td', {}, u.name), h('td', {}, u.role), h('td', {}, u.is_admin ? '✔' : ''), h('td', {}, u.active ? '啟用' : '停用'), h('td', {}, u.last_login || ''),
        h('td', {}, h('button', { class: 'mini', onclick: () => edit(u).then((ok) => ok && reopen()) }, '修改'), ' ',
          h('button', { class: 'mini', onclick: async () => { if (await FB.confirm('刪除帳號 ' + u.uid + '？', '刪除', true)) { await FB.api('user_delete', { uid: u.uid }).catch(FB.err); reopen(); } } }, '刪除'))));
    }
    let closeFn;
    const reopen = () => { closeFn && closeFn(null); users(); };
    FB.dialog({ title: '使用者與權限', width: '820px', body: h('div', {},
      h('p', { class: 'hint' }, '權限：電子書製作（1 看、2 編輯）、發佈輸出、共用電子書（1 看別人分享的、2 可修改）、系統管理。角色只是快速範本，可以再個別調整。'),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['帳號', '姓名', '角色', '管理員', '狀態', '最近登入', ''].map((t) => h('th', {}, t)))), tbody)),
    buttons: [{ label: '＋ 新增使用者', onClick: async () => { if (await edit(null)) reopen(); return false; } }, { label: '關閉', primary: true, value: true }],
    onOpen: (box, close) => (closeFn = close) });
    void st;
  }
  async function edit(u) {
    const st = FB.S.state;
    const isNew = !u;
    u = u || { uid: '', name: '', role: '編輯者', is_admin: 0, active: 1, perms: Object.assign({}, st.roles['編輯者']), dept: '' };
    const uid = h('input', { class: 'inp', value: u.uid, disabled: !isNew }), name = h('input', { class: 'inp', value: u.name }), dept = h('input', { class: 'inp', value: u.dept || '', placeholder: '例如：爸爸、媽媽、行政部' });
    const pw = h('input', { class: 'inp', type: 'password', placeholder: isNew ? '至少 6 個字' : '不改請留空白' });
    const admin = h('input', { type: 'checkbox', checked: !!u.is_admin }), active = h('input', { type: 'checkbox', checked: !!u.active });
    const perms = Object.assign({}, u.perms);
    const ptab = h('table', { class: 'grid' });
    const drawPerms = () => {
      ptab.innerHTML = '';
      for (const f of st.funcs) {
        ptab.append(h('tr', {}, h('td', {}, h('b', {}, f.name), h('div', { class: 'hint', style: { padding: 0 } }, f.desc)),
          h('td', {}, FB.selectEl(...LV.map((t, i) => [String(i), t]), String(perms[f.id] || 0), (v) => (perms[f.id] = +v)))));
      }
    };
    const role = FB.selectEl(...Object.keys(st.roles).map((r) => [r, r]), u.role || '編輯者', (v) => { Object.assign(perms, st.roles[v]); admin.checked = v === '系統管理員'; drawPerms(); });
    drawPerms();
    return FB.dialog({ title: isNew ? '新增使用者' : '修改使用者 ' + u.uid, width: '560px', body: h('div', {},
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '帳號', uid), h('label', { class: 'fld' }, '姓名', name)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '關係／部門', dept), h('label', { class: 'fld' }, '密碼', pw)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '角色範本', role), h('label', { class: 'inline' }, admin, '系統管理員'), h('label', { class: 'inline' }, active, '啟用')),
      ptab),
    buttons: [{ label: '取消', value: false }, { label: '儲存', primary: true, onClick: async () => {
      await FB.api('user_save', { uid: uid.value.trim(), name: name.value.trim(), role: role.value, dept: dept.value.trim(), is_admin: admin.checked, active: active.checked, perms, pw: pw.value, is_new: isNew });
      FB.toast('已儲存', 'ok');
      return true;
    } }] });
  }

  async function company() {
    let c;
    try { c = await FB.get('company'); } catch (e) { return FB.err(e); }
    const name = h('input', { class: 'inp', value: c.name || '' });
    const out = h('input', { class: 'inp', value: c.out_dir || '', placeholder: c.default_out });
    await FB.nativeReady;
    FB.dialog({ title: '公司設定', width: '520px', body: h('div', {},
      h('label', { class: 'fld' }, '公司名稱（電子書預設署名）', name),
      h('label', { class: 'fld' }, '預設發佈資料夾（空白＝「文件」資料夾裡的「電子書翻頁」）', h('div', { class: 'row' }, out, FB.native ? h('span', { style: { flex: 'none' } }, h('button', { class: 'btn', onclick: async () => { const f = await FB.native.pick_folder(out.value); if (f) out.value = f; } }, '選擇…')) : null))),
    buttons: [{ label: '取消', value: false }, { label: '儲存', primary: true, onClick: async () => { await FB.api('company', { name: name.value, out_dir: out.value }); FB.S.state.company = name.value; FB.toast('已儲存', 'ok'); return true; } }] });
  }

  async function audit() {
    let rows;
    try { rows = await FB.get('audit'); } catch (e) { return FB.err(e); }
    const NAMES = { login: '登入', logout: '登出', login_fail: '登入失敗', user_save: '修改使用者', user_delete: '刪除使用者', password: '變更密碼', book_new: '新增電子書', book_del: '刪除電子書', publish: '發佈電子書', backup: '備份', restore: '還原', company: '修改設定' };
    FB.dialog({ title: '操作紀錄（最近 300 筆）', width: '820px', body: h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['時間', '帳號', '動作', '對象', '內容'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.at), h('td', {}, r.uid), h('td', {}, NAMES[r.action] || r.action), h('td', {}, r.target), h('td', { style: { wordBreak: 'break-all', maxWidth: '300px' } }, (r.detail || '').slice(0, 160)))))) });
  }

  async function backup() {
    await FB.nativeReady;
    FB.dialog({ title: '備份與還原', width: '520px', body: h('div', {},
      h('p', {}, '備份會把資料庫（使用者、電子書內容、設定）存成一個 .sql.gz 檔。頁面圖片與素材在資料夾「%LOCALAPPDATA%\\ZMSFlipbook\\library」，請一併用隨身碟或雲端硬碟備份。'),
      h('p', { class: 'hint' }, '還原會把目前的資料庫換成備份檔的內容，請小心使用。')),
    buttons: [
      { label: '還原…', danger: true, onClick: async () => {
        if (!FB.native) return FB.toast('網頁版不能還原');
        const [p] = await FB.native.pick_files('backup');
        if (!p) return false;
        if (!(await FB.confirm('確定要用「' + p + '」還原？目前的資料會被覆蓋。', '還原', true))) return false;
        const b = FB.busy('還原中…');
        try { await FB.api('restore', { path: p }); FB.toast('還原完成，請重新登入', 'ok'); setTimeout(() => location.reload(), 1500); } finally { b.close(); }
        return true;
      } },
      { label: '立即備份', primary: true, onClick: async () => {
        let folder = '';
        if (FB.native) folder = await FB.native.pick_folder('');
        if (FB.native && !folder) return false;
        const b = FB.busy('備份中…');
        try { const r = await FB.api('backup', { folder }); FB.toast('已備份到 ' + r.path + '（' + FB.fmtSize(r.size) + '）', 'ok'); if (FB.native) FB.native.reveal(r.path); } finally { b.close(); }
        return true;
      } }] });
  }

  async function update() {
    const b = FB.busy('檢查新版本…');
    let r;
    try { r = await FB.get('update_check'); } catch (e) { b.close(); return FB.err(e); }
    b.close();
    if (r.latest) return FB.dialog({ title: '版本更新', body: h('p', {}, r.note ? r.note + '（版本 ' + r.current + '）' : '目前已經是最新版（' + r.current + '）。') });
    const info = r.info;
    FB.dialog({ title: '有新版本 ' + info.version, width: '560px', body: h('div', {}, h('p', {}, '目前版本 ' + r.current + '，最新版本 ' + info.version + (info.size ? '（' + FB.fmtSize(info.size) + '）' : '') + '。'),
      h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto', background: '#151b23', padding: '8px', borderRadius: '6px' } }, info.notes || '')),
    buttons: [{ label: '前往發佈頁', onClick: () => { FB.native ? FB.native.open_url(info.page) : window.open(info.page); return false; } },
      { label: '稍後', value: false },
      FB.can('SYS', 2) && info.name ? { label: '下載並安裝', primary: true, onClick: async () => {
        await FB.saveNow();
        const bb = FB.busy('下載新版中，完成後程式會自動關閉並安裝新版…');
        try { await FB.api('update_install'); } catch (e) { bb.close(); throw e; }
        return true;
      } } : null].filter(Boolean) });
  }

  async function shortcut() {
    try { await FB.api('shortcut'); FB.toast('已在桌面建立捷徑', 'ok'); } catch (e) { FB.err(e); }
  }
  function about() {
    const st = FB.S.state;
    FB.dialog({ title: '關於', body: h('div', { style: { textAlign: 'center' } }, h('img', { src: 'assets/icon.png', style: { width: '96px', borderRadius: '20px' } }),
      h('h2', {}, st.app), h('p', {}, '版本 ' + st.version), h('p', {}, st.credit),
      h('p', { class: 'hint' }, '翻頁引擎：自行開發（頁角掀起效果）・PDF 解析：pdf.js（Apache 2.0）・QR 碼：qrcode-generator（MIT）・資料庫：MariaDB（GPL）'),
      h('p', { class: 'hint' }, '朗讀語音：Microsoft Edge 神經語音（自然人聲）')) });
  }
  FB.Admin = { users, company, audit, backup, update, shortcut, about };
})();
