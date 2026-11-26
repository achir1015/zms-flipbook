"""電子書服務層：電子書、素材庫、Office／網頁轉 PDF、發佈紀錄、個人偏好。

規則都在這裡檢查（畫面只負責顯示），日後手機版透過 API 也共用同一套。
"""
import hashlib
import json
import os
import shutil
import struct
import subprocess
import tempfile

from .core import Base, BizError
from .settings import data_dir

NO_WINDOW = 0x08000000 if os.name == "nt" else 0

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".jfif", ".svg"}
VIDEO_EXT = {".mp4", ".m4v", ".webm", ".mov", ".ogv"}
AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"}
OFFICE_EXT = {".ppt", ".pptx", ".pps", ".ppsx", ".odp", ".doc", ".docx", ".rtf", ".odt", ".txt",
              ".xls", ".xlsx", ".ods"}
KINDS = {"page", "thumb", "pdf", "office", "image", "video", "audio", "file"}
# 書裡面參照素材的欄位名稱（刪除、發佈、複製時用來找出用到的素材）
ASSET_KEYS = {"asset", "thumb", "media", "audio", "poster", "logo", "bgImage", "music", "flipSound"}


def kind_of(name):
    ext = os.path.splitext(name)[1].lower()
    if ext == ".pdf":
        return "pdf"
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in OFFICE_EXT:
        return "office"
    return "file"


def lib_root():
    d = os.path.join(data_dir(), "library")
    os.makedirs(d, exist_ok=True)
    return d


def _sha1_file(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def image_size(path):
    """不靠外部套件讀 JPEG／PNG／GIF／WebP／BMP 的寬高。"""
    try:
        with open(path, "rb") as f:
            head = f.read(32)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])
            if head[:6] in (b"GIF87a", b"GIF89a"):
                return struct.unpack("<HH", head[6:10])
            if head[:2] == b"BM":
                w, h = struct.unpack("<ii", head[18:26])
                return w, abs(h)
            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                f.seek(12)
                chunk = f.read(30)
                if chunk[:4] == b"VP8X":
                    return 1 + int.from_bytes(chunk[12:15], "little"), 1 + int.from_bytes(chunk[15:18], "little")
                if chunk[:4] == b"VP8 ":
                    w, h = struct.unpack("<HH", chunk[14:18])
                    return w & 0x3FFF, h & 0x3FFF
                if chunk[:4] == b"VP8L":
                    b = chunk[9:13]
                    return 1 + (((b[1] & 0x3F) << 8) | b[0]), 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    m = f.read(2)
                    if len(m) < 2 or m[0] != 0xFF:
                        break
                    if m[1] in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                        f.read(3)
                        h, w = struct.unpack(">HH", f.read(4))
                        return w, h
                    ln = struct.unpack(">H", f.read(2))[0]
                    f.seek(ln - 2, 1)
    except Exception:
        pass
    return 0, 0


def walk_assets(o, ids):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ASSET_KEYS and isinstance(v, int):
                ids.add(v)
            else:
                walk_assets(v, ids)
    elif isinstance(o, list):
        for v in o:
            walk_assets(v, ids)
    return ids


class Library(Base):
    # ================================================================ 素材庫
    def import_file(self, src_path, name=None, kind=None):
        """把檔案放進素材庫（同一個檔案只存一份）。回傳素材資料。"""
        self.need("BOOK")
        name = (name or os.path.basename(src_path))[:200]
        kind = kind if kind in KINDS else kind_of(name)
        sha = _sha1_file(src_path)
        old = self.db.row("SELECT * FROM fb_asset WHERE sha1=%s AND kind=%s ORDER BY id LIMIT 1", (sha, kind))
        if old and os.path.isfile(self.asset_path(old)):
            mine = self.db.row("SELECT * FROM fb_asset WHERE sha1=%s AND kind=%s AND owner=%s LIMIT 1", (sha, kind, self.uid))
            if mine:
                return self._row(mine)
            aid = self.db.exec("INSERT INTO fb_asset (owner, kind, name, path, sha1, size, width, height) "
                               "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                               (self.uid, kind, name, old["path"], sha, old["size"], old["width"], old["height"]))
            return self.asset_get(aid)
        ext = os.path.splitext(name)[1].lower() or ".bin"
        rel = sha[:2] + "/" + sha + ext
        os.makedirs(os.path.join(lib_root(), sha[:2]), exist_ok=True)
        shutil.copyfile(src_path, os.path.join(lib_root(), rel))
        w, h = image_size(src_path) if kind in ("page", "thumb", "image") else (0, 0)
        aid = self.db.exec("INSERT INTO fb_asset (owner, kind, name, path, sha1, size, width, height) "
                           "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                           (self.uid, kind, name, rel, sha, os.path.getsize(src_path), w, h))
        return self.asset_get(aid)

    def import_bytes(self, data, name, kind=None):
        d = tempfile.mkdtemp(prefix="zmsflip-up-")
        try:
            p = os.path.join(d, os.path.basename(name) or "file.bin")
            with open(p, "wb") as f:
                f.write(data)
            return self.import_file(p, name=name, kind=kind)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    @staticmethod
    def _row(r):
        return dict(id=r["id"], kind=r["kind"], name=r["name"], size=r["size"], w=r["width"], h=r["height"],
                    ext=os.path.splitext(r["path"])[1].lower())

    def asset_get(self, aid):
        r = self.db.row("SELECT * FROM fb_asset WHERE id=%s", (aid,))
        if not r:
            raise BizError("找不到素材")
        return self._row(r)

    @staticmethod
    def asset_path(r):
        return os.path.join(lib_root(), r["path"])

    def asset_file(self, aid):
        r = self.db.row("SELECT path FROM fb_asset WHERE id=%s", (aid,))
        return self.asset_path(r) if r else None

    def assets(self, kinds=("image", "video", "audio")):
        rows = self.db.rows("SELECT * FROM fb_asset WHERE owner=%s AND kind IN (%s) ORDER BY id DESC LIMIT 500"
                            % ("%s", ",".join("%s" for _ in kinds)), (self.uid,) + tuple(kinds))
        return [self._row(r) for r in rows]

    # ================================================================ 轉換：Office、網頁 → PDF
    def office_to_pdf(self, aid):
        """PowerPoint、Word、Excel 檔轉 PDF：Windows 用電腦上的 Microsoft Office；沒有的話用 LibreOffice。"""
        self.need("BOOK")
        src = self.asset_file(aid)
        if not src or not os.path.isfile(src):
            raise BizError("找不到原始檔")
        name = self.db.value("SELECT name FROM fb_asset WHERE id=%s", (aid,)) or "doc"
        out_dir = tempfile.mkdtemp(prefix="zmsflip-pdf-")
        out = os.path.join(out_dir, "out.pdf")
        ext = os.path.splitext(src)[1].lower()
        err = ""
        try:
            if os.name == "nt":
                try:
                    _office_com(src, out, ext)
                except Exception as e:      # 沒裝 Office 或 Office 出錯 → 改用 LibreOffice
                    err = str(e)
            if not os.path.isfile(out):
                lo = _find_soffice()
                if lo:
                    tmp_src = os.path.join(out_dir, "in" + ext)
                    shutil.copyfile(src, tmp_src)
                    subprocess.run([lo, "--headless", "--convert-to", "pdf", "--outdir", out_dir, tmp_src],
                                   capture_output=True, timeout=300, creationflags=NO_WINDOW)
                    if os.path.isfile(os.path.join(out_dir, "in.pdf")):
                        os.replace(os.path.join(out_dir, "in.pdf"), out)
            if not os.path.isfile(out):
                raise BizError("無法轉換「%s」：這台電腦需要安裝 Microsoft Office（PowerPoint／Word）或免費的 LibreOffice。%s"
                               % (name, ("（" + err[:200] + "）") if err else ""))
            return self.import_file(out, name=os.path.splitext(name)[0] + ".pdf", kind="pdf")
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)

    def web_to_pdf(self, url, width=1280):
        """線上網頁轉 PDF：用 Windows 內建的 Microsoft Edge（或 Chrome）無頭模式列印成 PDF。"""
        self.need("BOOK")
        url = (url or "").strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        exe = _find_browser()
        if not exe:
            raise BizError("找不到 Microsoft Edge 或 Google Chrome，無法擷取網頁")
        d = tempfile.mkdtemp(prefix="zmsflip-web-")
        out = os.path.join(d, "page.pdf")
        try:
            subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-first-run", "--no-pdf-header-footer",
                            "--user-data-dir=" + os.path.join(d, "prof"), "--virtual-time-budget=8000",
                            "--window-size=%d,1600" % width, "--print-to-pdf=" + out, url],
                           capture_output=True, timeout=120, creationflags=NO_WINDOW)
            if not os.path.isfile(out) or os.path.getsize(out) < 500:
                raise BizError("網頁擷取失敗，請確認網址正確、電腦有連上網路")
            host = url.split("//", 1)[1].split("/", 1)[0]
            return self.import_file(out, name=host + ".pdf", kind="pdf")
        finally:
            shutil.rmtree(d, ignore_errors=True)

    # ================================================================ 電子書
    def books(self):
        if not self.can("BOOK", 1) and not self.can("SHARE", 1):
            raise BizError("您沒有使用電子書的權限")
        rows = self.db.rows("SELECT b.id, b.name, b.owner, u.name AS owner_name, b.shared, b.pages, b.cover, b.source, "
                            "b.updated_at FROM fb_book b LEFT JOIN sys_user u ON u.uid=b.owner "
                            "WHERE b.owner=%s OR (b.shared=1 AND %s=1) ORDER BY b.updated_at DESC",
                            (self.uid, 1 if self.can("SHARE", 1) else 0))
        for r in rows:
            r["updated_at"] = r["updated_at"].strftime("%Y-%m-%d %H:%M")
            r["mine"] = r["owner"] == self.uid
        return rows

    def _book_row(self, bid):
        r = self.db.row("SELECT * FROM fb_book WHERE id=%s", (bid,))
        if not r:
            raise BizError("找不到這本電子書")
        if r["owner"] != self.uid and not (r["shared"] and self.can("SHARE", 1)) and not self.user["is_admin"]:
            raise BizError("這本電子書不是您的，也沒有分享")
        return r

    def book_get(self, bid):
        r = self._book_row(bid)
        data = json.loads(r["data"] or "{}")
        ids = walk_assets(data, set())
        assets = {}
        if ids:
            for m in self.db.rows("SELECT * FROM fb_asset WHERE id IN (%s)" % ",".join("%s" for _ in ids), tuple(ids)):
                assets[m["id"]] = self._row(m)
        mine = r["owner"] == self.uid
        return dict(id=r["id"], name=r["name"], owner=r["owner"], shared=r["shared"], data=data, assets=assets,
                    mine=mine, editable=bool((mine and self.can("BOOK", 2)) or (r["shared"] and self.can("SHARE", 2))))

    def book_save(self, bid, name, data, shared=None, source=None):
        self.need("BOOK")
        name = (name or "").strip()[:120] or "未命名電子書"
        data = data or {}
        pages = data.get("pages") or []
        cover = None
        if pages:
            cover = pages[0].get("thumb") or pages[0].get("asset")
        js = json.dumps(data, ensure_ascii=False)
        if bid:
            r = self.db.row("SELECT owner, shared FROM fb_book WHERE id=%s", (bid,))
            if not r:
                raise BizError("找不到這本電子書")
            if r["owner"] != self.uid and not (r["shared"] and self.can("SHARE", 2)):
                raise BizError("只能修改自己的電子書")
            self.db.exec("UPDATE fb_book SET name=%s, data=%s, pages=%s, cover=%s, shared=COALESCE(%s, shared), "
                         "source=COALESCE(%s, source) WHERE id=%s",
                         (name, js, len(pages), cover, None if shared is None else int(bool(shared)), source, bid))
        else:
            bid = self.db.exec("INSERT INTO fb_book (name, owner, shared, pages, cover, source, data) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                               (name, self.uid, int(bool(shared)), len(pages), cover, source or "", js))
            self.log("book_new", bid, name)
        return bid

    def book_meta(self, bid, name=None, shared=None):
        self.need("BOOK")
        r = self.db.row("SELECT owner FROM fb_book WHERE id=%s", (bid,))
        if not r or (r["owner"] != self.uid and not self.user["is_admin"]):
            raise BizError("只能修改自己的電子書")
        if name is not None:
            self.db.exec("UPDATE fb_book SET name=%s WHERE id=%s", ((name or "").strip()[:120] or "未命名電子書", bid))
        if shared is not None:
            self.db.exec("UPDATE fb_book SET shared=%s WHERE id=%s", (int(bool(shared)), bid))

    def book_copy(self, bid):
        b = self.book_get(bid)
        return self.book_save(None, b["name"] + "（複製）", b["data"])

    def book_delete(self, bid):
        self.need("BOOK")
        r = self.db.row("SELECT owner, name, shared FROM fb_book WHERE id=%s", (bid,))
        if not r:
            return
        if r["owner"] != self.uid and not (self.user["is_admin"] or (r["shared"] and self.can("SHARE", 2))):
            raise BizError("只能刪除自己的電子書")
        self.db.exec("DELETE FROM fb_book WHERE id=%s", (bid,))
        self.log("book_del", bid, r["name"])

    # ================================================================ 個人偏好
    def pref(self):
        v = self.db.value("SELECT data FROM fb_pref WHERE uid=%s", (self.uid,))
        return json.loads(v) if v else {}

    def save_pref(self, data):
        cur = self.pref()
        cur.update(data or {})
        self.db.exec("REPLACE INTO fb_pref (uid, data) VALUES (%s, %s)", (self.uid, json.dumps(cur, ensure_ascii=False)))
        return cur

    # ================================================================ 發佈紀錄
    def publish_log(self, bid, fmt, path):
        size = 0
        if os.path.isfile(path):
            size = os.path.getsize(path)
        elif os.path.isdir(path):
            for root, _, files in os.walk(path):
                size += sum(os.path.getsize(os.path.join(root, f)) for f in files)
        self.db.exec("INSERT INTO fb_publish (book_id, uid, fmt, path, size) VALUES (%s,%s,%s,%s,%s)",
                     (bid, self.uid, fmt, path, size))
        self.log("publish", bid, path)
        return size

    def publishes(self, bid=None):
        sql = ("SELECT p.*, b.name AS book FROM fb_publish p LEFT JOIN fb_book b ON b.id=p.book_id WHERE p.uid=%s"
               + (" AND p.book_id=%s" if bid else "") + " ORDER BY p.id DESC LIMIT 100")
        rows = self.db.rows(sql, (self.uid, bid) if bid else (self.uid,))
        for r in rows:
            r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M")
            r["exists"] = bool(r["path"] and os.path.exists(r["path"]))
        return rows

    def default_out_dir(self):
        d = (self.company().get("out_dir") or "").strip()
        if d and os.path.isdir(d):
            return d
        base = os.path.expanduser("~")
        if os.name == "nt":
            try:
                import ctypes
                buf = ctypes.create_unicode_buffer(520)
                ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf)   # CSIDL_PERSONAL「文件」
                if buf.value:
                    base = buf.value
            except Exception:
                pass
        else:
            base = os.path.join(base, "Documents")
        d = os.path.join(base, "電子書翻頁")
        os.makedirs(d, exist_ok=True)
        return d


# ==================================================================== Office、瀏覽器
def _office_com(src, out, ext):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    try:
        if ext in (".ppt", ".pptx", ".pps", ".ppsx", ".odp"):
            app = win32com.client.DispatchEx("PowerPoint.Application")
            try:
                pres = app.Presentations.Open(os.path.abspath(src), True, False, False)   # 唯讀、不開視窗
                try:
                    pres.SaveAs(os.path.abspath(out), 32)          # ppSaveAsPDF
                finally:
                    pres.Close()
            finally:
                if app.Presentations.Count == 0:
                    app.Quit()
        elif ext in (".xls", ".xlsx", ".ods"):
            app = win32com.client.DispatchEx("Excel.Application")
            app.Visible = False
            app.DisplayAlerts = False
            try:
                wb = app.Workbooks.Open(os.path.abspath(src), ReadOnly=True)
                try:
                    wb.ExportAsFixedFormat(0, os.path.abspath(out))   # xlTypePDF
                finally:
                    wb.Close(False)
            finally:
                app.Quit()
        else:
            app = win32com.client.DispatchEx("Word.Application")
            app.Visible = False
            app.DisplayAlerts = 0
            try:
                doc = app.Documents.Open(os.path.abspath(src), ReadOnly=True, AddToRecentFiles=False, Visible=False)
                try:
                    doc.ExportAsFixedFormat(os.path.abspath(out), 17)   # wdExportFormatPDF
                finally:
                    doc.Close(False)
            finally:
                app.Quit()
    finally:
        pythoncom.CoUninitialize()


def _find_soffice():
    for c in (r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if os.path.isfile(c):
            return c
    return shutil.which("soffice") or shutil.which("libreoffice")


def _find_browser():
    pf = [os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), os.environ.get("ProgramFiles", r"C:\Program Files"),
          os.environ.get("LOCALAPPDATA", "")]
    for base in pf:
        for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
            p = os.path.join(base, rel)
            if base and os.path.isfile(p):
                return p
    for c in ("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        if os.path.isfile(c):
            return c
    return shutil.which("msedge") or shutil.which("google-chrome") or shutil.which("chromium")
