"""發佈電子書：網頁資料夾（可放到任何網站）、ZIP、單一 HTML 檔（可以直接寄給別人、離線打開）。

發佈出去的電子書用的是同一套閱讀器（web/reader），不需要本程式就能看。
可以預先產生朗讀語音（自然人聲 MP3）一起放進去，讀者離線也能聽到真人般的聲音。
"""
import base64
import json
import mimetypes
import os
import re
import shutil
import threading
import uuid
import zipfile

from . import APP_NAME, CREDIT, tts
from .library import walk_assets
from .settings import resource_dir

READER = os.path.join(resource_dir(), "web", "reader")
READER_FILES = ["reader.css", "flip.js", "qrcode.js", "reader.js"]
JOBS = {}


def safe_name(s):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", s or "").strip().strip(".")
    return s[:80] or "電子書"


def sentences(text):
    """和 reader.js 的 sentences() 一模一樣的切法（預先錄好的語音才對得上）。"""
    t = str(text or "").replace("\r", "")
    t = re.sub(r"([。！？!?；;\n])", "\\1\x01", t)
    t = re.sub(r"(\.\s)", "\\1\x01", t)
    out = []
    for p in t.split("\x01"):
        p = re.sub(r"\s+", " ", p).strip()
        if not p or not any(ch.isalnum() for ch in p):
            continue
        while len(p) > 110:
            k = max(p.rfind("，", 0, 101), p.rfind(",", 0, 101), p.rfind("、", 0, 101), p.rfind(" ", 0, 101))
            if k < 30:
                k = 100
            out.append(p[:k + 1])
            p = p[k + 1:].strip()
        if p:
            out.append(p)
    return out


def _page_html(title, inline_css="", inline_js="", head_links=True):
    t = title.replace("&", "&amp;").replace("<", "&lt;")
    css = ('<link rel="stylesheet" href="files/reader.css">' if head_links else "<style>%s</style>" % inline_css)
    js = ("".join('<script src="files/%s"></script>' % f for f in READER_FILES[1:]) + '<script src="files/book.js"></script>'
          if head_links else inline_js)
    return """<!DOCTYPE html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="generator" content="%s">
<title>%s</title>%s
<style>html,body{margin:0;height:100%%;background:#222;overflow:hidden}#book{position:fixed;inset:0}</style>
</head><body><div id="book"></div>%s
<script>
(function(){var p={};try{p=JSON.parse(localStorage.getItem('fbr_pref')||'{}')}catch(e){}
window.FB.Reader.mount(document.getElementById('book'),window.FB_BOOK,{pref:p});})();
</script>
<!-- %s -->
</body></html>""" % (APP_NAME, t, css, js, CREDIT)


class Publisher:
    def __init__(self, lib, book_id, fmt, folder, name, voices, job):
        self.lib, self.bid, self.fmt, self.folder, self.name, self.voices, self.job = lib, book_id, fmt, folder, name, voices or [], job

    def step(self, p, msg):
        self.job.update(progress=round(p, 3), msg=msg)
        if self.job.get("cancel"):
            raise RuntimeError("已取消")

    def run(self):
        b = self.lib.book_get(self.bid)
        data = b["data"]
        book = dict(id="b%s" % self.bid, title=b["name"], pages=data.get("pages") or [], toc=data.get("toc") or [],
                    settings=data.get("settings") or {})
        ids = walk_assets(book, set())
        name = safe_name(self.name or b["name"])
        single = self.fmt == "html"
        work = os.path.join(self.folder, name) if self.fmt == "folder" else os.path.join(self.folder, "." + name + "-" + uuid.uuid4().hex[:6])
        if self.fmt == "folder" and os.path.exists(work):
            k = 2
            while os.path.exists("%s (%d)" % (work, k)):
                k += 1
            work = "%s (%d)" % (work, k)
        files = os.path.join(work, "files")
        os.makedirs(os.path.join(files, "assets"), exist_ok=True)
        try:
            # 1. 素材（頁面圖、縮圖、圖片、影片、聲音）
            amap = {}
            idl = sorted(ids)
            for n, aid in enumerate(idl):
                self.step(0.05 + 0.45 * n / max(1, len(idl)), "複製頁面與素材 %d／%d" % (n + 1, len(idl)))
                src = self.lib.asset_file(aid)
                if not src or not os.path.isfile(src):
                    continue
                ext = os.path.splitext(src)[1].lower()
                if single:
                    mt = mimetypes.guess_type("x" + ext)[0] or "application/octet-stream"
                    amap[aid] = "data:%s;base64,%s" % (mt, base64.b64encode(open(src, "rb").read()).decode("ascii"))
                else:
                    rel = "files/assets/a%d%s" % (aid, ext)
                    shutil.copyfile(src, os.path.join(work, rel))
                    amap[aid] = rel
            book["assets"] = {str(k): v for k, v in amap.items()}
            # 2. 預先產生朗讀語音
            if self.voices:
                book["narration"] = self.narration(book, work, single)
            # 3. 閱讀器與書的資料
            self.step(0.96, "寫入閱讀器")
            js = "window.FB_BOOK=" + json.dumps(book, ensure_ascii=False) + ";"
            if single:
                css = open(os.path.join(READER, "reader.css"), encoding="utf-8").read()
                inline = "".join("<script>%s</script>" % open(os.path.join(READER, f), encoding="utf-8").read().replace("</script", "<\\/script")
                                 for f in READER_FILES[1:])
                inline += "<script>%s</script>" % js.replace("</script", "<\\/script")
                out = os.path.join(self.folder, name + ".html")
                k = 2
                while os.path.exists(out):
                    out = os.path.join(self.folder, "%s (%d).html" % (name, k))
                    k += 1
                with open(out, "w", encoding="utf-8") as f:
                    f.write(_page_html(b["name"], css, inline, head_links=False))
                shutil.rmtree(work, ignore_errors=True)
                return out
            for f in READER_FILES:
                shutil.copyfile(os.path.join(READER, f), os.path.join(files, f))
            with open(os.path.join(files, "book.js"), "w", encoding="utf-8") as f:
                f.write(js)
            with open(os.path.join(work, "index.html"), "w", encoding="utf-8") as f:
                f.write(_page_html(b["name"]))
            if self.fmt == "zip":
                self.step(0.98, "壓縮成 ZIP")
                out = os.path.join(self.folder, name + ".zip")
                k = 2
                while os.path.exists(out):
                    out = os.path.join(self.folder, "%s (%d).zip" % (name, k))
                    k += 1
                with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                    for root, _, fs in os.walk(work):
                        for fn in fs:
                            p = os.path.join(root, fn)
                            z.write(p, os.path.join(name, os.path.relpath(p, work)))
                shutil.rmtree(work, ignore_errors=True)
                return out
            return work
        except Exception:
            if self.fmt != "folder" or self.job.get("cancel"):
                shutil.rmtree(work, ignore_errors=True)
            raise

    def narration(self, book, work, single):
        jobs = []
        for i, pg in enumerate(book["pages"]):
            if pg.get("audio"):
                continue
            text = (pg.get("speak") or "").strip() or pg.get("text") or ""
            for k, s in enumerate(sentences(text)):
                for v in self.voices:
                    jobs.append((v, i, k, s))
        out = {v: {} for v in self.voices}
        for n, (v, i, k, s) in enumerate(jobs):
            self.step(0.5 + 0.45 * n / max(1, len(jobs)), "產生朗讀語音 %d／%d（%s）" % (n + 1, len(jobs), tts.BY_ID.get(v, ("", v))[1]))
            path = tts.synth(s, v, 1.0)
            if single:
                src = "data:audio/mpeg;base64," + base64.b64encode(open(path, "rb").read()).decode("ascii")
            else:
                rel = "files/audio/%s/p%d-%d.mp3" % (v, i + 1, k + 1)
                os.makedirs(os.path.dirname(os.path.join(work, rel)), exist_ok=True)
                shutil.copyfile(path, os.path.join(work, rel))
                src = rel
            out[v].setdefault(str(i), []).append(dict(t=s, src=src))
        return out


def start(lib_factory, book_id, fmt, folder, name, voices):
    jid = uuid.uuid4().hex[:12]
    job = dict(id=jid, progress=0.0, msg="準備中…", done=False, error="", path="", cancel=False)
    JOBS[jid] = job

    def run():
        lib = lib_factory()
        try:
            path = Publisher(lib, book_id, fmt, folder, name, voices, job).run()
            size = lib.publish_log(book_id, fmt, path)
            job.update(path=path, size=size, progress=1.0, msg="完成")
        except Exception as e:
            job["error"] = str(e)
        finally:
            job["done"] = True
            try:
                lib.db.close()
            except Exception:
                pass
    threading.Thread(target=run, daemon=True).start()
    return jid
