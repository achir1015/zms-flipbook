"""一鍵建置 Windows 安裝檔：
1. 檢查內附的 MariaDB（packaging/mariadb）
2. 產生圖示、教學語音（已存在且沒變則略過）
3. PyInstaller 打包到 dist/ZMSFlipbook
4. Inno Setup 產生 dist-installer/ZMSFlipbook-Setup-<版本>.exe

用法：.venv\\Scripts\\python tools\\build_windows.py
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from fb import APP_ID, APP_NAME, APP_VERSION, AUTHOR  # noqa: E402

ISCC = [os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe", r"C:\Program Files\Inno Setup 6\ISCC.exe"]
PY = os.path.join(HERE, ".venv", "Scripts", "python.exe")
ENV = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")


def prepare():
    if not os.path.isfile(os.path.join(HERE, "packaging", "mariadb", "bin", "mariadbd.exe")):
        raise SystemExit("缺少 packaging/mariadb（MariaDB 10.11 的 bin 與 share 最小檔案）")
    if not os.path.isfile(os.path.join(HERE, "web", "assets", "icon.png")):
        subprocess.run([PY, "tools/make_icon.py"], cwd=HERE, check=True, env=ENV)
    subprocess.run([PY, "tools/make_voice.py"], cwd=HERE, check=False, env=ENV)
    # 版本資訊檔
    v = APP_VERSION.split(".") + ["0"] * 4
    nums = ", ".join(v[:4])
    vi = f"""VSVersionInfo(ffi=FixedFileInfo(filevers=({nums}), prodvers=({nums})),
  kids=[StringFileInfo([StringTable('040404B0', [StringStruct('CompanyName', '{AUTHOR}'),
  StringStruct('FileDescription', '{APP_NAME}'), StringStruct('FileVersion', '{APP_VERSION}'),
  StringStruct('ProductName', '{APP_NAME}'), StringStruct('ProductVersion', '{APP_VERSION}'),
  StringStruct('LegalCopyright', '© 2026 {AUTHOR}')])]), VarFileInfo([VarStruct('Translation', [1028, 1200])])])"""
    os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
    with open(os.path.join(HERE, "build", "version.txt"), "w", encoding="utf-8") as f:
        f.write(vi)


def pack():
    shutil.rmtree(os.path.join(HERE, "dist"), ignore_errors=True)
    cmd = [PY, "-m", "PyInstaller", "main.py", "--noconfirm", "--clean", "--onedir", "--windowed",
           "--name", APP_ID, "--icon", "packaging/icon.ico", "--distpath", "dist", "--workpath", "build/pyi",
           "--version-file", "build/version.txt",
           "--add-data", "web;web",
           "--exclude-module", "tkinter", "--exclude-module", "test", "--exclude-module", "PIL", "--exclude-module", "qrcode",
           "--hidden-import", "pymysql", "--hidden-import", "edge_tts", "--hidden-import", "certifi",
           "--hidden-import", "win32com.client", "--hidden-import", "pythoncom",
           "--collect-all", "webview", "--collect-all", "clr_loader", "--collect-all", "pythonnet"]
    subprocess.run(cmd, cwd=HERE, check=True, env=ENV)
    # 不需要打包的開發檔
    for junk in ("web/assets/voice/manifest.json", "web/test-flip.html", "web/test-reader.html"):
        p = os.path.join(HERE, "dist", APP_ID, "_internal", junk)
        if os.path.isfile(p):
            os.remove(p)


def installer():
    iscc = next((p for p in ISCC if os.path.isfile(p)), None)
    if not iscc:
        raise SystemExit("找不到 Inno Setup 6（ISCC.exe）")
    tmp = tempfile.mkdtemp(prefix="zmsflip-iss-")     # 先編譯到暫存資料夾：直接寫常被防毒鎖檔
    subprocess.run([iscc, "/DAppVer=" + APP_VERSION, "/O" + tmp, os.path.join(HERE, "packaging", "installer.iss")],
                   check=True)
    name = "%s-Setup-%s.exe" % (APP_ID, APP_VERSION)
    out = os.path.join(HERE, "dist-installer", name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.move(os.path.join(tmp, name), out)
    shutil.rmtree(tmp, ignore_errors=True)
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
    print("完成：%s（%.1f MB）\nSHA256 %s" % (out, os.path.getsize(out) / 1e6, sha))


if __name__ == "__main__":
    prepare()
    pack()
    installer()
