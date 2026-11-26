"""產生線上版（GitHub Pages）與手機 App 用的網頁：web/ → docs/

- 加入 js/local.js（瀏覽器內的核心：IndexedDB 存電子書與頁面圖、在瀏覽器裡發佈 ZIP／單一 HTML）
- PWA：manifest.webmanifest、sw.js（離線可用；改版時快取名稱跟著版本與內容雜湊改變）
- 不放測試頁（test-*.html、_pubtest）

用法：python tools/make_pages.py
"""
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from fb import APP_NAME, APP_VERSION  # noqa: E402

WEB = os.path.join(HERE, "web")
OUT = os.path.join(HERE, "docs")
SKIP = shutil.ignore_patterns("manifest.json", "__pycache__", "test-*.html", "_pubtest")


def main():
    keep = {"ios"}                                   # docs/ios 安裝頁另外維護，不要刪
    if os.path.isdir(OUT):
        for n in os.listdir(OUT):
            if n in keep:
                continue
            p = os.path.join(OUT, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(OUT, exist_ok=True)
    for n in os.listdir(WEB):
        if n.startswith("test-") or n == "_pubtest":
            continue
        s, d = os.path.join(WEB, n), os.path.join(OUT, n)
        if os.path.isdir(s):
            shutil.copytree(s, d, ignore=SKIP)
        else:
            shutil.copy2(s, d)

    p = os.path.join(OUT, "index.html")
    html = open(p, encoding="utf-8").read()
    html = html.replace('<script src="js/api.js"></script>',
                        '<script>window.FB_WEB_VERSION = %s;</script>\n<script src="js/api.js"></script>\n'
                        '<script src="js/local.js"></script>' % json.dumps(APP_VERSION), 1)
    head = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="apple-touch-icon" href="assets/icon-180.png">\n'
            '<meta name="theme-color" content="#12355c">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="description" content="把 PDF、圖片、相簿變成頁角掀起翻頁的電子書；眼控、放大鏡、朗讀，漸凍人友善。">\n')
    html = html.replace("<title>資料助秘電子書翻頁</title>", "<title>資料助秘電子書翻頁（線上版）</title>", 1)
    html = html.replace("</head>", head + "</head>", 1)
    html = html.replace("<script>FB.boot();</script>",
                        "<script>FB.boot();\nif ('serviceWorker' in navigator && location.protocol === 'https:' && !window.ZMSIOS && !window.ZMSAndroid)"
                        " navigator.serviceWorker.register('sw.js');</script>", 1)
    open(p, "w", encoding="utf-8").write(html)

    json.dump({"name": APP_NAME, "short_name": "電子書翻頁", "start_url": "./", "display": "standalone",
               "background_color": "#12355c", "theme_color": "#12355c", "lang": "zh-TW",
               "icons": [{"src": "assets/icon-256.png", "sizes": "256x256", "type": "image/png"},
                         {"src": "assets/icon.png", "sizes": "1024x1024", "type": "image/png", "purpose": "any"}]},
              open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # Service worker：程式檔 network-first（有網路就拿最新）、其他 cache-first
    h = hashlib.sha1()
    for root, _, files in os.walk(OUT):
        if os.sep + "ios" in root:
            continue
        for f in sorted(files):
            if f.endswith((".js", ".mjs", ".css", ".html")):
                h.update(open(os.path.join(root, f), "rb").read())
    cache = "zms-flipbook-%s-%s" % (APP_VERSION, h.hexdigest()[:8])
    sw = """const CACHE = %s;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/ios/')) return;
  const code = /\\.(html|js|mjs|css|webmanifest)$|\\/$/.test(u.pathname);
  e.respondWith(code
    ? fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })));
});
""" % json.dumps(cache)
    open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    print("docs/ 完成", cache)


if __name__ == "__main__":
    main()
