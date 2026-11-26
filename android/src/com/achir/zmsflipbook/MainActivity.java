package com.achir.zmsflipbook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 資料助秘電子書翻頁 — Android 版
 * 用 WebView 開啟和線上版同一份網頁（放在 APK 的 assets/web）→ 不用網路也能用。
 * 網頁從 https://appassets.androidplatform.net/ 載入（安全來源：IndexedDB、pdf.js 模組都能用），
 * 由 shouldInterceptRequest 直接回傳 assets 裡的檔案；聲音、影片支援 Range。
 * 電子書與頁面圖存在網頁的 IndexedDB；發佈好的電子書經 Bridge 存到「下載/電子書翻頁」再開分享選單。
 * Android 的 WebView 沒有網頁語音 → 朗讀改用手機的文字轉語音（Bridge.ttsSpeak）。
 */
public class MainActivity extends Activity {
    static final String TAG = "ZMSFlipbook";
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    static final int REQ_FILES = 11;

    WebView web;
    Bridge bridge;
    long lastBack = 0;
    ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(0xFF12355C);
        setContentView(web);
        WebView.setWebContentsDebuggingEnabled(BuildFlags.DEBUG);   // python android/build.py debug 才開（chrome://inspect）

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // 朗讀、教學語音一步接一步自動播放
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);   // 不跟著系統字型大小放大，工具列才不會擠在一起
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setUserAgentString(s.getUserAgentString() + " ZMSFlipbookAndroid/" + Bridge.version(this));

        bridge = new Bridge(this);
        web.addJavascriptInterface(bridge, "ZMSAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!ORIGIN.equals(u.getScheme() + "://" + u.getHost())) return null;
                return serve(u.getPath(), req.getRequestHeaders());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (ORIGIN.equals(u.getScheme() + "://" + u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, final JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                        .setPositiveButton("確定", (d, w) -> r.confirm())
                        .setNegativeButton("取消", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel()).show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView v, String url, String msg, final JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                        .setPositiveButton("確定", (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.confirm()).show();
                return true;
            }

            // 選 PDF、圖片、聲音、影片：開手機的檔案選擇器（可多選）
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                String[] types = p.getAcceptTypes();
                String accept = types != null && types.length > 0 ? String.join(",", types) : "";
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                java.util.List<String> m = new java.util.ArrayList<>();
                if (accept.contains("pdf")) m.add("application/pdf");
                if (accept.contains("image")) m.add("image/*");
                if (accept.contains("audio")) m.add("audio/*");
                if (accept.contains("video")) m.add("video/*");
                i.setType("*/*");
                if (!m.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, m.toArray(new String[0]));
                try { startActivityForResult(i, REQ_FILES); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }

            // 網頁要相機／麥克風：本程式不需要，一律拒絕
            @Override
            public void onPermissionRequest(final PermissionRequest r) { runOnUiThread(r::deny); }
        });

        web.loadUrl(ORIGIN + "/index.html");
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILES) { super.onActivityResult(req, res, data); return; }
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                out = new Uri[clip.getItemCount()];
                for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) out = new Uri[] { data.getData() };
        }
        if (fileCb != null) fileCb.onReceiveValue(out);
        fileCb = null;
    }

    /** 回傳 assets/web 裡的檔案（聲音、影片支援 Range） */
    WebResourceResponse serve(String path, Map<String, String> reqHeaders) {
        try {
            if (path == null || path.isEmpty()) path = "/";
            if (path.endsWith("/")) path += "index.html";
            String asset = "web" + Uri.decode(path);
            String m = mime(path);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-store");
            h.put("Access-Control-Allow-Origin", ORIGIN);
            String range = null;
            if (reqHeaders != null) for (Map.Entry<String, String> e : reqHeaders.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            if (m.startsWith("audio/") || m.startsWith("video/")) {
                AssetFileDescriptor fd = getAssets().openFd(asset);   // 以不壓縮方式打包，才能取得長度
                long len = fd.getLength();
                fd.close();
                h.put("Accept-Ranges", "bytes");
                if (range != null) {
                    Matcher rm = RANGE.matcher(range);
                    if (rm.find()) {
                        long start = rm.group(1).isEmpty() ? 0 : Long.parseLong(rm.group(1));
                        long end = rm.group(2).isEmpty() ? len - 1 : Math.min(len - 1, Long.parseLong(rm.group(2)));
                        InputStream in = getAssets().open(asset);
                        long skipped = 0;
                        while (skipped < start) { long k = in.skip(start - skipped); if (k <= 0) break; skipped += k; }
                        h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
                        h.put("Content-Length", String.valueOf(end - start + 1));
                        return new WebResourceResponse(m, null, 206, "Partial Content", h, new Limited(in, end - start + 1));
                    }
                }
                h.put("Content-Length", String.valueOf(len));
                return new WebResourceResponse(m, null, 200, "OK", h, getAssets().open(asset));
            }
            InputStream in = getAssets().open(asset);
            return new WebResourceResponse(m, m.startsWith("text") || m.endsWith("json") ? "utf-8" : null, 200, "OK", h, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    /** 只讀固定長度的串流（Range 用） */
    static final class Limited extends java.io.FilterInputStream {
        long left;
        Limited(InputStream in, long n) { super(in); left = n; }
        @Override public int read() throws java.io.IOException { if (left <= 0) return -1; int c = super.read(); if (c >= 0) left--; return c; }
        @Override public int read(byte[] b, int off, int len) throws java.io.IOException {
            if (left <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
    }

    static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".m4a")) return "audio/mp4";
        if (p.endsWith(".mp4")) return "video/mp4";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    /** 返回鍵：先關對話框與面板、再回書櫃；在書櫃按兩次才離開 */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return !!(window.__zmsBack&&window.__zmsBack())}catch(e){return false}})()", v -> {
            if ("true".equals(v)) return;
            long now = System.currentTimeMillis();
            if (now - lastBack < 2000) { finish(); return; }
            lastBack = now;
            Toast.makeText(this, "再按一次返回鍵離開", Toast.LENGTH_SHORT).show();
        });
    }

    void js(final String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onStop() { super.onStop(); bridge.ttsStop(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        web.removeJavascriptInterface("ZMSAndroid");
        web.loadUrl("about:blank");
        web.destroy();
        web = null;
        super.onDestroy();
    }
}
