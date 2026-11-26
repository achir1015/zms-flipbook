/* 語音動態教學的課程內容（tools/make_voice.py 也會讀這個檔，產生每一句的語音 MP3）。
 * do：開始講這一句之前先做的動作（home 書櫃、tab:分頁、read:閱讀器面板 thumbs／toc／search／read／eye／none） */
window.FB_LESSONS = [
  { id: 'start', title: '認識書櫃', desc: '書櫃、建立電子書、示範書', editor: false, steps: [
    { sel: '#book-grid', do: 'home', say: '歡迎使用資料助秘電子書翻頁！這裡是書櫃，每一本書都會顯示封面。點一下封面就能開始閱讀。' },
    { sel: '#btn-new', do: 'home', say: '要做新的電子書，請按右上角的「建立電子書」。可以匯入 PDF、圖片、整個相簿資料夾、PowerPoint 簡報、Word 文件，或輸入網址擷取線上網頁。' },
    { sel: '#btn-sample', do: 'home', say: '第一次使用，可以先按「示範電子書」，程式會自動做好一本使用說明，讓您馬上體驗翻頁的感覺。' },
    { sel: '#home-user', do: 'home', say: '右上角的帳號選單裡，有使用者與權限、公司設定、備份、檢查更新、建立桌面捷徑等功能。' },
  ] },
  { id: 'read', title: '翻頁與閱讀', desc: '拖曳頁角翻頁、縮圖、目錄、搜尋', editor: false, steps: [
    { sel: '.fbr-stage', do: 'read:none', say: '這是閱讀畫面。把滑鼠移到書頁的一角，頁角會微微掀起來；按住頁角拖曳，就像真的在翻書。點頁面兩側、按左右方向鍵，或轉動滑鼠滾輪也可以翻頁。' },
    { sel: '.fbr-top', do: 'read:none', say: '上方工具列可以放大縮小、跳到第一頁或最後一頁、輸入頁碼直接跳頁，還有列印、Email 分享和全螢幕。' },
    { sel: '.fbr-bot', do: 'read:thumbs', say: '下方左邊是縮圖、目錄、搜尋和書籤。縮圖一次看到所有頁面，點一下就跳過去。' },
    { sel: '.fbr-search', do: 'read:search', say: '搜尋可以找出書裡的文字，找到的地方會用黃色標示出來。' },
    { sel: '.fbr-bot', do: 'read:none', say: '右邊是自動翻頁、聲音開關和分享。' },
  ] },
  { id: 'access', title: '朗讀、放大鏡與眼控', desc: '自然人聲、漸凍人眼動鼠', editor: false, steps: [
    { sel: '.fbr-b[data-k=read]', do: 'read:read', say: '按工具列的喇叭，就能用自然人聲朗讀這本書。聲音可以選小女孩、年輕女生、成年女性、阿嬤，或小男孩、年輕男生、成年男性、阿公。' },
    { sel: '.fbr-side', do: 'read:read', say: '勾選「唸完自動翻到下一頁」，就能從頭聽到尾，完全不用動手。正在唸的句子會用藍色標示，下方也有大字幕。' },
    { sel: '.fbr-b[data-k=lens]', do: 'read:none', say: '放大鏡會跟著滑鼠或眼睛移動，把看不清楚的小字放大。' },
    { sel: '.fbr-side', do: 'read:eye', say: '眼控模式是給漸凍人和臥床朋友用的。開啟之後，用眼動鼠注視任何按鈕，黃色圓圈轉滿就等於按下去；兩側還有大大的上一頁、下一頁區塊，注視就能翻頁。' },
    { sel: '.fbr-side', do: 'read:eye', say: '這裡也可以調整注視多久算按下、放大鏡倍數，還有高對比和黑底白字，讓視力不好的朋友看得更清楚。' },
  ] },
  { id: 'pages', title: '頁面與互動', desc: '排序頁面、加入連結影片', editor: true, steps: [
    { sel: '.steps', do: 'tab:pages', say: '進入編輯畫面後，有三個步驟：頁面與互動、外觀設計、發佈。現在是第一步。' },
    { sel: '.pg-list', do: 'tab:pages', say: '左邊是所有頁面。拖曳縮圖可以調整順序，下面可以插入空白頁或刪除頁面；按「加頁」可以再匯入 PDF、圖片或簡報。' },
    { sel: '#el-tools', do: 'tab:pages', say: '上方可以在頁面上加入連結、文字、圖片、影片、YouTube、聲音、圖形、按鈕和 QR 碼。' },
    { sel: '#pg-stage', do: 'tab:pages', say: '加進來的物件可以直接拖曳移動，拉右下角的小方塊改變大小。' },
    { sel: '#pg-props', do: 'tab:pages', say: '右邊設定選取物件的內容，還有「點了要做什麼」：開網頁、跳到某一頁、打電話、跳出視窗或播放聲音，也可以加上彈跳、淡入等出現動畫。沒有選物件時，這裡可以修改這一頁要朗讀的文字、加旁白錄音和編輯目錄。' },
  ] },
  { id: 'design', title: '外觀設計', desc: '範本主題、翻頁方式、密碼', editor: true, steps: [
    { sel: '.theme-grid', do: 'tab:design', say: '第二步「外觀設計」。先選一個範本主題，例如經典木紋、深夜藍、牛皮紙，也可以用自己的背景圖，或加上雪花、星空、花瓣等動態背景。' },
    { sel: '#ds-side', do: 'tab:design', say: '往下可以設定單頁或雙頁、右翻書、硬封面、翻頁速度和聲音、公司標誌、背景音樂、自動翻頁、要顯示哪些按鈕，還能設定開啟密碼。' },
    { sel: '#ds-preview', do: 'tab:design', say: '右邊是即時預覽，改了設定馬上就能看到效果。' },
  ] },
  { id: 'publish', title: '發佈分享', desc: '網頁資料夾、ZIP、單一 HTML', editor: true, steps: [
    { sel: '.fmt-grid', do: 'tab:publish', say: '最後一步「發佈」。可以輸出成網頁資料夾、ZIP 壓縮檔，或整本書放進一個 HTML 檔，直接用 Email 或 LINE 傳給別人。' },
    { sel: '.pub-voice', do: 'tab:publish', say: '這裡可以預先錄好自然人聲的朗讀語音放進電子書，讀者沒有網路、或用手機看，也聽得到真人般的聲音。' },
    { sel: '#btn-publish', do: 'tab:publish', say: '按「開始發佈」，完成後可以直接用瀏覽器打開，或在檔案總管找到它。' },
  ] },
];
