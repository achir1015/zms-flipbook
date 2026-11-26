"""資料表定義（唯一來源）：建表 SQL 與欄位中文說明。

表名前綴：sys_＝系統（使用者、權限、設定、紀錄）、fb_＝電子書（書、素材、發佈紀錄、個人偏好）。
"""

# (表名, 中文名稱, [(欄位, SQL 型別與屬性, 中文說明)], 其他限制)
TABLES = [
    ("sys_meta", "系統參數", [
        ("k", "VARCHAR(40) NOT NULL PRIMARY KEY", "參數代號"),
        ("v", "TEXT", "參數值")], []),
    ("sys_company", "單位設定（單一公司）", [
        ("id", "INT NOT NULL PRIMARY KEY", "固定 1"),
        ("name", "VARCHAR(120) NOT NULL DEFAULT ''", "公司名稱（電子書預設署名）"),
        ("out_dir", "VARCHAR(400) NOT NULL DEFAULT ''", "預設發佈資料夾（空白＝使用者的「文件」資料夾）")], []),
    ("sys_user", "使用者", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("name", "VARCHAR(60) NOT NULL", "姓名"),
        ("pw_hash", "VARCHAR(200) NOT NULL", "密碼雜湊（PBKDF2）"),
        ("role", "VARCHAR(30) NOT NULL DEFAULT ''", "角色範本"),
        ("dept", "VARCHAR(30) NOT NULL DEFAULT ''", "部門"),
        ("is_admin", "TINYINT NOT NULL DEFAULT 0", "系統管理員"),
        ("active", "TINYINT NOT NULL DEFAULT 1", "啟用"),
        ("last_login", "DATETIME NULL", "最近登入"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間")], []),
    ("sys_user_perm", "使用者權限", [
        ("uid", "VARCHAR(30) NOT NULL", "帳號"),
        ("func", "VARCHAR(10) NOT NULL", "功能代號"),
        ("lvl", "TINYINT NOT NULL DEFAULT 0", "等級 0 無、1 查詢、2 維護")], ["PRIMARY KEY (uid, func)"]),
    ("sys_audit_log", "操作紀錄", [
        ("id", "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "時間"),
        ("uid", "VARCHAR(30) NOT NULL DEFAULT ''", "使用者"),
        ("action", "VARCHAR(30) NOT NULL", "動作"),
        ("target", "VARCHAR(80) NOT NULL DEFAULT ''", "對象"),
        ("detail", "TEXT", "內容")], ["KEY ix_at (at)"]),
    ("fb_book", "電子書", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("name", "VARCHAR(120) NOT NULL", "書名"),
        ("owner", "VARCHAR(30) NOT NULL", "建立人"),
        ("shared", "TINYINT NOT NULL DEFAULT 0", "分享給其他使用者閱讀"),
        ("pages", "INT NOT NULL DEFAULT 0", "頁數"),
        ("cover", "INT NULL", "封面縮圖素材"),
        ("source", "VARCHAR(20) NOT NULL DEFAULT ''", "來源：pdf、image、office、web、mixed"),
        ("data", "LONGTEXT", "電子書內容（JSON：頁面、頁面上的連結影音、目錄、書籤、外觀設定）"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間"),
        ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", "最後修改")],
     ["KEY ix_owner (owner)"]),
    ("fb_asset", "素材（頁面圖、縮圖、原始檔、圖片、影片、聲音）", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("owner", "VARCHAR(30) NOT NULL", "匯入人"),
        ("kind", "VARCHAR(8) NOT NULL", "page 頁面、thumb 縮圖、pdf、office、image 圖片、video 影片、audio 聲音、file 其他"),
        ("name", "VARCHAR(200) NOT NULL", "原始檔名"),
        ("path", "VARCHAR(300) NOT NULL", "存放路徑（素材庫內的相對路徑）"),
        ("sha1", "CHAR(40) NOT NULL", "檔案指紋（同一個檔案只存一份）"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "檔案大小"),
        ("width", "INT NOT NULL DEFAULT 0", "寬"),
        ("height", "INT NOT NULL DEFAULT 0", "高"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "匯入時間")],
     ["KEY ix_owner (owner)", "KEY ix_sha (sha1)"]),
    ("fb_publish", "發佈紀錄", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("book_id", "INT NOT NULL", "電子書"),
        ("uid", "VARCHAR(30) NOT NULL", "發佈人"),
        ("fmt", "VARCHAR(10) NOT NULL", "格式：folder 網頁資料夾、zip、html 單一檔"),
        ("path", "VARCHAR(400) NOT NULL DEFAULT ''", "輸出位置"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "大小"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "發佈時間")], ["KEY ix_book (book_id)"]),
    ("fb_pref", "個人偏好（朗讀聲音、眼控停留時間、放大鏡、教學是否看過）", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("data", "TEXT", "設定（JSON）")], []),
]


def ddl():
    out = []
    for name, title, cols, extra in TABLES:
        body = ["  `%s` %s COMMENT '%s'" % (c, t, d.replace("'", "''")) for c, t, d in cols]
        body += ["  " + x for x in extra]
        out.append("CREATE TABLE IF NOT EXISTS `%s` (\n%s\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
                   "COLLATE=utf8mb4_unicode_ci COMMENT='%s'" % (name, ",\n".join(body), title))
    return out
