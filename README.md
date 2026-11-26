# 資料助秘電子書翻頁
<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/3342c5ff-50da-474f-8529-d26cd9eb5c57" />
示範

把 **PDF、圖片（相簿）、整個相簿資料夾、PowerPoint 簡報、Word／Excel 文件、線上網頁** 變成可以「一角掀起來」翻頁的電子書。

- 翻頁效果：自行開發的頁角掀起（page curl）引擎——滑鼠移到頁角會微微掀起，按住拖曳就像真的翻書；也支援硬封面、右翻書（直排）、單頁／雙頁自動切換。
- 經典版面：深色木紋背景、上方置中工具列、左右大箭頭、下方縮圖／目錄／搜尋／書籤、自動翻頁、聲音、分享。
- 頁面互動：連結（開網頁、跳頁、打電話、Email、跳出視窗）、文字、圖片、影片（檔案／YouTube／Vimeo）、聲音、圖形、按鈕、QR 碼、出現動畫。PDF 的超連結、書籤目錄與文字會自動帶入。
- **無障礙（漸凍人、臥床者）**
  - 眼控模式：用眼動鼠（Tobii 等）注視按鈕，黃色圓圈轉滿就等於按下；兩側有大大的上一頁／下一頁區塊。
  - 放大鏡：跟著滑鼠或眼睛平滑移動，倍數與大小可調；高對比、黑底白字、護眼暖色。
  - 自然人聲朗讀：可選性別與年齡（小女孩、年輕女生、成年女性、阿嬤、小男孩、年輕男生、成年男性、阿公），唸完自動翻頁，正在唸的句子會標示、並有大字幕。
- 發佈：網頁資料夾、ZIP、單一 HTML 檔（可直接寄送、離線開啟），可預先錄好朗讀語音放進電子書。
- 使用者與權限（電子書製作、發佈輸出、共用電子書、系統管理）、操作紀錄、備份還原、程式內更新、桌面捷徑、小柯語音動態教學。

## 平台

| 平台 | 狀態 |
|---|---|
| Windows 11 | ✅ 第一版 |
| macOS（MacBook Pro） | 規劃中 |
| 線上版（HTML） | 規劃中 |
| iPhone／iPad（線上安裝） | 規劃中 |
| Android | 規劃中 |

## 開發

```powershell
python -m venv .venv
.venv\Scripts\pip install pywebview==6.2.1 pythonnet PyMySQL edge-tts certifi pyinstaller pillow qrcode pywin32
.venv\Scripts\python main.py            # 桌面版
.venv\Scripts\python main.py --web 8720 # 網頁測試：http://127.0.0.1:8720/?k=dev
.venv\Scripts\python tools\build_windows.py   # 安裝檔 → dist-installer\
```

- 資料庫：內建 MariaDB（埠 3558），資料在 `%LOCALAPPDATA%\ZMSFlipbook`。
- 畫面：純 JavaScript（`web/`），閱讀器 `web/reader/` 同時用在程式內與發佈出去的電子書。
- 第三方：pdf.js（Apache 2.0）、qrcode-generator（MIT）、MariaDB（GPL）、朗讀使用 Microsoft Edge 神經語音。

開發：吳玉柱 先生 與 Claude AI Opus 5.5
