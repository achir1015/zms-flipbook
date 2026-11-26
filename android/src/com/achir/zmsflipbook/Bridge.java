package com.achir.zmsflipbook;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 網頁呼叫的 Android 功能（window.ZMSAndroid）：
 * 存發佈好的電子書（分段傳進來）→ 手機「下載/電子書翻頁」＋分享選單、朗讀（手機的文字轉語音）、開網址、版本資訊。
 * JavaScript 介面在背景執行緒執行；回傳值一律是 JSON 字串。
 */
final class Bridge {
    final MainActivity a;
    final Map<String, Save> saves = new HashMap<>();
    TextToSpeech tts;
    volatile boolean ttsReady = false;

    static final class Save { String name, mime; Uri uri; File file; OutputStream out; }

    Bridge(MainActivity a) { this.a = a; initTts(); }

    static String ok(Object... kv) {
        JSONObject o = new JSONObject();
        try { o.put("status", "ok"); for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return o.toString();
    }
    static String err(Exception e) {
        JSONObject o = new JSONObject();
        try { o.put("status", "error"); o.put("message", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        return o.toString();
    }

    static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
    }

    @JavascriptInterface
    public String getVersion() { return version(a); }

    @JavascriptInterface
    public String appInfo() { return ok("name", a.getString(R.string.app_name), "version", version(a), "platform", "android", "sdk", Build.VERSION.SDK_INT, "model", Build.MODEL); }

    // ---- 朗讀：Android 的 WebView 沒有網頁語音，改用手機的文字轉語音（Google／三星的自然語音） ----
    void initTts() {
        tts = new TextToSpeech(a.getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) return;
            Locale[] prefer = { Locale.TAIWAN, new Locale("zh", "TW"), Locale.TRADITIONAL_CHINESE, Locale.CHINESE, Locale.SIMPLIFIED_CHINESE };
            for (Locale l : prefer) {
                int r = tts.isLanguageAvailable(l);
                if (r >= TextToSpeech.LANG_AVAILABLE) { tts.setLanguage(l); ttsReady = true; break; }
            }
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { done(id); }
                @Override public void onError(String id) { done(id); }
                @Override public void onStop(String id, boolean interrupted) { done(id); }
            });
        });
    }

    void done(String id) { a.js("window.__zmsTtsDone&&window.__zmsTtsDone(" + JSONObject.quote(id) + ")"); }

    @JavascriptInterface
    public boolean ttsAvailable() { return ttsReady; }

    /** rate：語速（1＝正常）；pitch：音高（兒童 1.4、長輩 0.8） */
    @JavascriptInterface
    public void ttsSpeak(String text, double rate, double pitch, String id) {
        if (!ttsReady) { done(id); return; }
        tts.setSpeechRate((float) Math.max(0.5, Math.min(2.0, rate)));
        tts.setPitch((float) Math.max(0.5, Math.min(2.0, pitch)));
        Bundle p = new Bundle();
        p.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, p, id);
    }

    @JavascriptInterface
    public void ttsStop() { if (tts != null) tts.stop(); }

    void shutdown() { try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception ignored) { } }

    // ---- 存發佈好的電子書：saveBegin → saveChunk（base64，多次）→ saveEnd ----
    @JavascriptInterface
    public String saveBegin(String name, String mime) {
        try {
            Save s = new Save();
            s.name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            s.mime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, s.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, s.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/電子書翻頁");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                ContentResolver cr = a.getContentResolver();
                s.uri = cr.insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                s.out = cr.openOutputStream(s.uri);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "電子書翻頁");
                dir.mkdirs();
                s.file = new File(dir, s.name);
                s.out = new FileOutputStream(s.file);
            }
            String id = String.valueOf(System.nanoTime());
            synchronized (saves) { saves.put(id, s); }
            return ok("id", id);
        } catch (Exception e) { return err(e); }
    }

    @JavascriptInterface
    public String saveChunk(String id, String b64) {
        Save s;
        synchronized (saves) { s = saves.get(id); }
        if (s == null) return err(new Exception("no save"));
        try { s.out.write(Base64.decode(b64, Base64.DEFAULT)); return ok(); } catch (Exception e) { return err(e); }
    }

    @JavascriptInterface
    public String saveEnd(String id) {
        Save s;
        synchronized (saves) { s = saves.remove(id); }
        if (s == null) return err(new Exception("no save"));
        try {
            s.out.close();
            Uri share = s.uri;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                a.getContentResolver().update(s.uri, v, null, null);
            } else share = null;
            final Uri u = share;
            final String mime = s.mime;
            if (u != null) a.runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { a.startActivity(Intent.createChooser(send, "分享電子書").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); } catch (Exception ignored) { }
            });
            return ok("path", "下載/電子書翻頁/" + s.name);
        } catch (Exception e) { return err(e); }
    }

    /** 只允許開啟 https、電話、Email 網址（電子書裡的連結、GitHub 下載新版） */
    @JavascriptInterface
    public boolean openUrl(String url) {
        if (!(url.startsWith("https://") || url.startsWith("http://") || url.startsWith("tel:") || url.startsWith("mailto:"))) return false;
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true; } catch (Exception e) { return false; }
    }
}
