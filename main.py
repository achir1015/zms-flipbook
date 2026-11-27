"""資料助秘電子書翻頁 — 程式進入點。

桌面版：python main.py（開一個視窗；關閉視窗時資料庫一起停止）
網頁測試：python main.py --web 8720（只開本機伺服器，用瀏覽器開 http://127.0.0.1:8720/?k=dev）
"""
import os
import sys
import threading

if not os.environ.get("SSL_CERT_FILE"):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
    except Exception:
        pass


def _log_to_file():
    """打包版沒有主控台：錯誤寫到資料夾裡的 app.log。"""
    if getattr(sys, "frozen", False):
        from fb.settings import data_dir
        f = open(os.path.join(data_dir(), "app.log"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = f


class NativeApi:
    """給畫面呼叫的電腦功能（選檔、選資料夾、在檔案總管顯示、開網頁、全螢幕）。"""

    def __init__(self):
        self._window = None

    def pick_files(self, kind="media"):
        import webview
        types = {
            "book": ("可以做成電子書的檔案 (*.pdf;*.ppt;*.pptx;*.pps;*.ppsx;*.doc;*.docx;*.rtf;*.odt;*.odp;*.xls;*.xlsx;*.txt;"
                     "*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp)", "PDF (*.pdf)", "PowerPoint 簡報 (*.ppt;*.pptx;*.pps;*.ppsx)",
                     "Word 文件 (*.doc;*.docx;*.rtf;*.odt)", "圖片 (*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp)", "所有檔案 (*.*)"),
            "image": ("圖片 (*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.svg)", "所有檔案 (*.*)"),
            "video": ("影片 (*.mp4;*.m4v;*.webm;*.mov)", "所有檔案 (*.*)"),
            "audio": ("聲音 (*.mp3;*.wav;*.ogg;*.m4a;*.aac)", "所有檔案 (*.*)"),
            "pdf": ("PDF (*.pdf)", "所有檔案 (*.*)"),
            "backup": ("資料庫備份 (*.sql.gz;*.sql)", "所有檔案 (*.*)"),
        }.get(kind, ("所有檔案 (*.*)",))
        r = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=kind != "backup",
                                           file_types=types)
        return list(r or [])

    def pick_folder(self, start=""):
        import webview
        r = self._window.create_file_dialog(webview.FileDialog.FOLDER, directory=start or "")
        return r[0] if r else ""

    def reveal(self, path):
        import subprocess
        if os.name == "nt":
            if os.path.isfile(path):
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            else:
                os.startfile(path)
        elif os.path.isfile(path):
            subprocess.Popen(["open", "-R", path])        # 在 Finder 中顯示並選取
        else:
            subprocess.Popen(["open", path])
        return True

    def open_file(self, path):
        if os.name == "nt":
            os.startfile(path)
        else:
            import subprocess
            subprocess.Popen(["open", path])
        return True

    def open_url(self, url):
        import webbrowser
        if url.startswith(("https://", "http://")):
            webbrowser.open(url)
        return True

    def toggle_fullscreen(self):
        self._window.toggle_fullscreen()
        return True


def run_web(port):
    os.environ.setdefault("FB_KEY", "dev")
    from fb import server
    server.KEY = os.environ["FB_KEY"]
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(port)
    print("http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY), flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop_database()


def _queue_import():
    """ZMSFlipbook.exe --import <檔案>：不在收件匣的檔案先複製進去（程式開著時由畫面每 3 秒接手）。"""
    if "--import" not in sys.argv:
        return
    i = sys.argv.index("--import")
    p = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
    if not p.lower().endswith(".pdf") or not os.path.isfile(p):
        return
    from fb.server import inbox_dirs
    dirs = inbox_dirs()
    if any(os.path.normcase(os.path.dirname(os.path.abspath(p))) == os.path.normcase(os.path.abspath(d)) for d in dirs):
        return
    import shutil
    os.makedirs(dirs[0], exist_ok=True)
    shutil.copy(p, os.path.join(dirs[0], os.path.basename(p)))


def run_desktop():
    from fb import APP_NAME, single
    try:
        _queue_import()
    except Exception:
        pass
    if not single.acquire():
        single.activate_existing()
        sys.exit(0)
    _log_to_file()
    if getattr(sys, "frozen", False) and os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ZMS.Flipbook")
        except Exception:
            pass
    import webview
    from fb import server
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(0)
    url = "http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY)
    api = NativeApi()
    win = webview.create_window(APP_NAME, url, js_api=api, width=1360, height=860, min_size=(1000, 640),
                                background_color="#1d2530", text_select=False, maximized=True)
    api._window = win
    server.STATE["native"] = api
    server.STATE["quit"] = lambda: win.destroy()

    def on_closed():
        srv.shutdown()
        server.stop_database()

    win.events.closed += on_closed
    from fb.settings import data_dir
    webview.start(gui="edgechromium" if os.name == "nt" else None, private_mode=False, storage_path=os.path.join(data_dir(), "webview"),
                  debug=bool(os.environ.get("FB_DEBUG")))
    server.stop_database()
    os._exit(0)


if __name__ == "__main__":
    if "--web" in sys.argv:
        i = sys.argv.index("--web")
        run_web(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 8720)
    else:
        run_desktop()
