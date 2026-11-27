"""本機網頁伺服器：程式畫面（web/）、JSON API、素材（支援 Range）、朗讀語音 /tts。

只聽 127.0.0.1；每次開程式產生一組金鑰（KEY），API 與素材都要帶（網址 ?k= 或標頭 X-Key），
避免電腦上其他網頁偷連。登入後另有工作階段代號（X-Session／?s=）。
"""
import json
import mimetypes
import os
import secrets
import shutil
import tempfile
import threading
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import APP_NAME, APP_VERSION, CREDIT, maintenance, publish, tts
from .library import BizError, Library, kind_of
from .seed import FUNCS, ROLES
from .settings import resource_dir

KEY = os.environ.get("FB_KEY") or secrets.token_urlsafe(18)
WEB = os.path.join(resource_dir(), "web")
STATE = {"db": None, "st": None, "ready": False, "error": "", "native": None}
SESSIONS = {}
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("video/mp4", ".m4v")


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def _sess(h, q):
    sid = h.headers.get("X-Session") or q.get("s", "")
    a = SESSIONS.get(sid)
    if not a or not a.user:
        raise ApiError("請先登入", 401)
    return a


# ==================================================================== API
def api_state(h, q, body):
    a = SESSIONS.get(h.headers.get("X-Session") or "")
    out = dict(ready=STATE["ready"], error=STATE["error"], app=APP_NAME, version=APP_VERSION, credit=CREDIT,
               native=bool(STATE["native"]), funcs=[dict(id=f[0], name=f[1], desc=f[2]) for f in FUNCS],
               roles=ROLES)
    if STATE["ready"]:
        b = Library(STATE["db"])
        out["has_users"] = b.has_users()
        out["company"] = b.company().get("name", "")
    if a and a.user:
        out["user"] = dict(uid=a.uid, name=a.user["name"], is_admin=bool(a.user["is_admin"]),
                           perms={f[0]: a.level(f[0]) for f in FUNCS})
    return out


def _need_ready():
    if not STATE["ready"]:
        raise ApiError(STATE["error"] or "資料庫啟動中，請稍候…", 503)


def api_setup(h, q, body):
    _need_ready()
    a = Library(STATE["db"])
    a.create_first_admin(body.get("uid"), body.get("name"), body.get("pw"))
    return api_login(h, q, body)


def api_login(h, q, body):
    _need_ready()
    a = Library(STATE["db"])
    a.login(body.get("uid"), body.get("pw"))
    sid = secrets.token_urlsafe(18)
    SESSIONS[sid] = a
    st = STATE["st"]
    if st:
        st.last_user = a.uid
        st.save()
    return dict(session=sid, uid=a.uid, name=a.user["name"])


def api_logout(h, q, body):
    sid = h.headers.get("X-Session") or ""
    a = SESSIONS.pop(sid, None)
    if a:
        a.logout()
    return {}


def api_last_user(h, q, body):
    return dict(uid=(STATE["st"].last_user if STATE["st"] else ""))


def api_password(h, q, body):
    _sess(h, q).change_password(body.get("old"), body.get("new"))
    return {}


def api_users(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.users()
    for r in rows:
        r["last_login"] = r["last_login"].strftime("%Y-%m-%d %H:%M") if r["last_login"] else ""
    return rows


def api_user_save(h, q, body):
    a = _sess(h, q)
    a.save_user(body.get("uid"), body.get("name"), body.get("role", ""), body.get("is_admin"), body.get("active", 1),
                body.get("perms") or {}, pw=body.get("pw") or None, is_new=body.get("is_new"),
                dept=body.get("dept", ""))
    return {}


def api_user_delete(h, q, body):
    _sess(h, q).delete_user(body.get("uid"))
    return {}


def api_audit(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.audit(300)
    for r in rows:
        r["at"] = r["at"].strftime("%Y-%m-%d %H:%M:%S")
    return rows


def api_company(h, q, body):
    a = _sess(h, q)
    if body:
        a.save_company(body.get("name"), body.get("out_dir"))
    c = a.company()
    return dict(name=c.get("name", ""), out_dir=c.get("out_dir", ""), default_out=a.default_out_dir())


# ---------------------------------------------------------------- 素材
def api_assets(h, q, body):
    kinds = tuple(k for k in (q.get("kinds") or "image,video,audio").split(",") if k)
    return _sess(h, q).assets(kinds)


def api_import_paths(h, q, body):
    """電腦版：從選檔視窗選到的檔案路徑匯入素材庫。"""
    a = _sess(h, q)
    out, errors = [], []
    for p in body.get("paths") or []:
        try:
            if not os.path.isfile(p):
                raise BizError("找不到檔案：" + p)
            r = a.import_file(p, kind=body.get("kind") or None)
            r["path_name"] = os.path.basename(p)
            out.append(r)
        except BizError as e:
            errors.append(str(e))
    return dict(items=out, errors=errors)


def api_folder_images(h, q, body):
    """電腦版：選一個資料夾（相簿）→ 列出裡面的圖片（依檔名排序）"""
    _sess(h, q)
    d = body.get("folder") or ""
    if not os.path.isdir(d):
        raise BizError("找不到資料夾")
    import re as _re
    key = lambda n: [int(t) if t.isdigit() else t.lower() for t in _re.split(r"(\d+)", n)]
    names = sorted((n for n in os.listdir(d) if kind_of(n) == "image"), key=key)
    return [os.path.join(d, n) for n in names]


def api_upload(h, q, body_bytes):
    """畫面送上來的檔案（拖曳的檔案、PDF 轉好的頁面圖）：原始位元組上傳。"""
    a = _sess(h, q)
    name = q.get("name") or "file.bin"
    return a.import_bytes(body_bytes, name, q.get("kind") or None)


def api_office_pdf(h, q, body):
    return _sess(h, q).office_to_pdf(int(body["id"]))


def api_web_pdf(h, q, body):
    return _sess(h, q).web_to_pdf(body.get("url"), int(body.get("width") or 1280))


# ---------------------------------------------------------------- 電子書
def api_books(h, q, body):
    return _sess(h, q).books()


def api_book(h, q, body):
    return _sess(h, q).book_get(int(q.get("id") or body.get("id")))


def api_book_save(h, q, body):
    a = _sess(h, q)
    return dict(id=a.book_save(body.get("id"), body.get("name"), body.get("data"), shared=body.get("shared"),
                               source=body.get("source")))


def api_book_meta(h, q, body):
    _sess(h, q).book_meta(int(body["id"]), body.get("name"), body.get("shared"))
    return {}


def api_book_copy(h, q, body):
    return dict(id=_sess(h, q).book_copy(int(body["id"])))


def api_book_delete(h, q, body):
    _sess(h, q).book_delete(int(body["id"]))
    return {}


def api_pref(h, q, body):
    a = _sess(h, q)
    return a.save_pref(body) if body else a.pref()


def api_voices(h, q, body):
    return tts.public()


# ---------------------------------------------------------------- 發佈
def api_publish(h, q, body):
    a = _sess(h, q)
    a.need("PUB", 1)
    folder = body.get("folder") or a.default_out_dir()
    os.makedirs(folder, exist_ok=True)
    fmt = body.get("fmt") if body.get("fmt") in ("folder", "zip", "html") else "folder"
    voices = [v for v in (body.get("voices") or []) if v in tts.BY_ID]
    jid = publish.start(lambda: a, int(body["id"]), fmt, folder, body.get("name"), voices)
    return dict(job=jid)


def api_publish_job(h, q, body):
    _sess(h, q)
    j = publish.JOBS.get(q.get("id") or body.get("id") or "")
    if not j:
        raise ApiError("找不到發佈工作")
    return {k: v for k, v in j.items() if k != "cancel"}


def api_publish_cancel(h, q, body):
    _sess(h, q)
    j = publish.JOBS.get(body.get("id") or "")
    if j:
        j["cancel"] = True
    return {}


def api_publishes(h, q, body):
    return _sess(h, q).publishes(int(q["bid"]) if q.get("bid") else None)


def api_reveal(h, q, body):
    """在檔案總管顯示發佈好的檔案（只限發佈紀錄裡的路徑）"""
    a = _sess(h, q)
    p = body.get("path") or ""
    if not STATE["db"].value("SELECT 1 FROM fb_publish WHERE uid=%s AND path=%s LIMIT 1", (a.uid, p)):
        raise BizError("找不到這筆發佈紀錄")
    n = STATE.get("native")
    if n and os.path.exists(p):
        n.reveal(p)
    return {}


def api_open_published(h, q, body):
    a = _sess(h, q)
    p = body.get("path") or ""
    if not STATE["db"].value("SELECT 1 FROM fb_publish WHERE uid=%s AND path=%s LIMIT 1", (a.uid, p)):
        raise BizError("找不到這筆發佈紀錄")
    f = os.path.join(p, "index.html") if os.path.isdir(p) else p
    if os.path.isfile(f) and f.lower().endswith(".html"):
        import webbrowser
        import pathlib
        webbrowser.open(pathlib.Path(f).resolve().as_uri())
    elif STATE.get("native"):
        STATE["native"].reveal(p)
    return {}


# ---------------------------------------------------------------- 系統
def api_update_check(h, q, body):
    import urllib.error
    try:
        info = maintenance.check_update()
    except urllib.error.HTTPError as e:
        if e.code == 404:                 # GitHub 上還沒有發佈頁或還沒有任何發佈版本
            return dict(latest=True, info=None, current=APP_VERSION,
                        note="目前還沒有發佈到網路上的新版本，您使用的就是最新版。")
        raise ApiError("無法連到更新伺服器：%s" % e)
    except Exception as e:
        raise ApiError("無法連到更新伺服器：%s" % e)
    return dict(latest=info is None, info=info, current=APP_VERSION)


def api_update_install(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    info = maintenance.check_update()
    if not info or not info.get("name"):
        raise ApiError("找不到可以自動安裝的新版本，請到發佈頁下載")
    path = maintenance.download(info["url"])
    maintenance.launch_installer(path)
    threading.Timer(1.5, lambda: STATE.get("quit") and STATE["quit"]()).start()
    return dict(ok=True)


def api_backup(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    folder = body.get("folder") or a.default_out_dir()
    import datetime
    path = os.path.join(folder, "電子書翻頁資料庫備份-%s.sql.gz" % datetime.datetime.now().strftime("%Y%m%d-%H%M"))
    size = maintenance.backup(STATE["st"], path)
    a.log("backup", "", path)
    return dict(path=path, size=size)


def api_restore(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    p = body.get("path") or ""
    if not os.path.isfile(p):
        raise BizError("找不到備份檔")
    maintenance.restore(STATE["st"], p)
    a.log("restore", "", p)
    return {}


def api_shortcut(h, q, body):
    maintenance.create_desktop_shortcut()
    return {}


# ---------------------------------------------------------------- 收件匣（資料助秘文件office彙整「匯出到電子書翻頁」）
def inbox_dirs():
    """文件office彙整把 PDF＋同名 .json 放到 <翻頁資料夾>/inbox。開發時資料夾在專案 data/，也一併看標準位置。"""
    from .settings import data_dir
    out = [os.path.join(data_dir(), "inbox")]
    if os.name == "nt":
        out.append(os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "ZMSFlipbook", "inbox"))
    else:
        out.append(os.path.expanduser("~/Library/Application Support/ZMSFlipbook/inbox"))
    seen, res = set(), []
    for d in out:
        k = os.path.normcase(os.path.abspath(d))
        if k not in seen:
            seen.add(k)
            res.append(d)
    return res


def api_inbox(h, q, body):
    """列出收件匣裡等待建立電子書的 PDF（舊的在前）。"""
    _sess(h, q)
    items = []
    for d in inbox_dirs():
        if not os.path.isdir(d):
            continue
        for n in os.listdir(d):
            p = os.path.join(d, n)
            if not n.lower().endswith(".pdf") or not os.path.isfile(p):
                continue
            meta = {}
            try:
                with open(p[:-4] + ".json", encoding="utf-8") as f:
                    meta = json.load(f)
            except (OSError, ValueError):
                pass
            items.append(dict(path=p, title=meta.get("title") or n[:-4], source=meta.get("source") or "",
                              created=meta.get("created") or "", mtime=os.path.getmtime(p)))
    items.sort(key=lambda x: x["mtime"])
    return items


def api_inbox_done(h, q, body):
    """建立好電子書（或使用者不要）之後，把檔案移到 inbox/done（保留 30 份，舊的刪掉）。"""
    _sess(h, q)
    p = os.path.abspath(body.get("path") or "")
    if not any(os.path.normcase(os.path.dirname(p)) == os.path.normcase(os.path.abspath(d)) for d in inbox_dirs()):
        raise BizError("不是收件匣裡的檔案")
    done = os.path.join(os.path.dirname(p), "done")
    os.makedirs(done, exist_ok=True)
    for src in (p, p[:-4] + ".json"):
        if os.path.isfile(src):
            dst = os.path.join(done, os.path.basename(src))
            if os.path.exists(dst):
                os.remove(dst)
            shutil.move(src, dst)
    old = sorted((os.path.join(done, n) for n in os.listdir(done)), key=os.path.getmtime)
    for x in old[:-60]:
        try:
            os.remove(x)
        except OSError:
            pass
    return {}


ROUTES = {n[4:]: f for n, f in globals().items() if n.startswith("api_") and callable(f)}
RAW = {"upload"}
GET_OK = {"state", "assets", "books", "book", "publishes", "users", "audit", "last_user", "pref", "company",
          "update_check", "voices", "publish_job", "inbox"}


# ==================================================================== HTTP
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ZMSFlipbook"

    def log_message(self, *a):
        pass

    def _q(self):
        u = urllib.parse.urlsplit(self.path)
        return u.path, {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}

    def _send(self, code, data, ctype="application/json; charset=utf-8", extra=None):
        if not isinstance(data, (bytes, bytearray)):
            data = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _key_ok(self, q):
        return (self.headers.get("X-Key") or q.get("k")) == KEY

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path, q = self._q()
        if path.startswith("/api/"):
            return self._api(path[5:], q, None)
        if path.startswith("/media/"):
            return self._media(path, q)
        if path == "/tts":
            return self._tts(q)
        return self._static(path)

    def _tts(self, q):
        """朗讀一句：/tts?k=&s=&v=聲音&r=速度&t=文字 → mp3（同一句會用快取）"""
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        try:
            _sess(self, q)
            path = tts.synth(q.get("t", ""), q.get("v", tts.DEFAULT), float(q.get("r") or 1))
        except ApiError as e:
            return self._send(e.code, {"ok": False, "error": str(e)})
        except Exception as e:
            return self._send(502, {"ok": False, "error": str(e)})
        self._file(path, cache=True)

    def do_POST(self):
        path, q = self._q()
        if not path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return self._api(path[5:], q, raw, post=True)

    def _api(self, name, q, raw, post=False):
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        f = ROUTES.get(name)
        if not f or (not post and name not in GET_OK):
            return self._send(404, {"error": "沒有這個功能：" + name})
        try:
            if name in RAW:
                body = raw or b""
            else:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            res = f(self, q, body)
            if STATE["db"]:
                STATE["db"].close()                # 每個請求結束就歸還連線（執行緒會被重複使用）
            return self._send(200, {"ok": True, "data": res})
        except ApiError as e:
            return self._send(e.code, {"ok": False, "error": str(e)})
        except BizError as e:
            return self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"ok": False, "error": "程式錯誤：%s" % e})

    def _media(self, path, q):
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        try:
            a = _sess(self, q)
            mid = int(path.rsplit("/", 1)[-1].split(".")[0])
            fp = a.asset_file(mid)
        except Exception:
            fp = None
        if not fp or not os.path.isfile(fp):
            return self._send(404, {"error": "找不到素材"})
        self._file(fp, cache=True)

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(WEB, urllib.parse.unquote(path).lstrip("/")))
        if not fp.startswith(os.path.normpath(WEB)) or not os.path.isfile(fp):
            return self._send(404, b"not found", "text/plain")
        self._file(fp, cache=False)

    def _file(self, fp, cache):
        size = os.path.getsize(fp)
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].split(",")[0].partition("-")
            try:
                if a:
                    start = int(a)
                    end = int(b) if b else size - 1
                else:
                    start = max(0, size - int(b))
                end = min(end, size - 1)
                code = 206
            except ValueError:
                pass
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        length = end - start + 1
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, max-age=86400" if cache else "no-cache")
        if code == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(fp, "rb") as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(port=0):
    srv = Server(("127.0.0.1", port), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def start_database(st=None):
    """啟動內建資料庫並建表（在背景執行緒呼叫）。"""
    from .database import DB
    from .dbserver import LocalDatabaseServer
    from .settings import Settings
    try:
        st = st or Settings.load()
        STATE["st"] = st
        srv = None
        if st.mode == "embedded":
            srv = LocalDatabaseServer(st)
            srv.start()
            st.save()
        db = DB(st)
        db.prepare()
        db.close()
        STATE["db"], STATE["dbserver"], STATE["ready"] = db, srv, True
        tts.probe()
    except Exception as e:
        traceback.print_exc()
        STATE["error"] = "資料庫啟動失敗：%s" % e


def stop_database():
    srv = STATE.get("dbserver")
    if srv:
        srv.stop()
