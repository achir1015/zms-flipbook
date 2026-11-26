"""第一次使用的預設資料：權限功能與角色。"""

# 權限功能：(代號, 名稱, 說明)；等級 0 無、1 查詢、2 維護
FUNCS = [
    ("BOOK", "電子書製作", "等級 1 可開啟、閱讀自己的電子書；等級 2 可新增、匯入、編輯、刪除自己的電子書"),
    ("PUB", "發佈輸出", "輸出成網頁資料夾、ZIP、單一 HTML 檔，產生朗讀語音"),
    ("SHARE", "共用電子書", "等級 1 可閱讀別人分享的電子書；等級 2 可修改、刪除別人分享的電子書"),
    ("SYS", "系統管理", "使用者與權限、公司設定、備份還原、版本更新、操作紀錄"),
]
FUNC_NAMES = {f[0]: f[1] for f in FUNCS}
LEVEL_NAMES = {0: "無", 1: "查詢", 2: "維護"}


def _r(**kw):
    return {f[0]: kw.get(f[0], 0) for f in FUNCS}


ROLES = {
    "系統管理員": {f[0]: 2 for f in FUNCS},
    "編輯者": _r(BOOK=2, PUB=2, SHARE=1),
    "讀者": _r(BOOK=1, SHARE=1),
    "訪客": _r(SHARE=1),
}


def seed_all(db, first=False):
    """每次開啟都會補上缺的參考資料（INSERT IGNORE，不覆蓋使用者修改過的內容）。"""
    db.exec("INSERT IGNORE INTO sys_company (id, name) VALUES (1, '')")
