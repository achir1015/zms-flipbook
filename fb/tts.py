"""朗讀語音：微軟 Edge 神經語音（自然人聲、免費、要連網），可選性別與年齡。

年齡用音高（pitch）與語速（rate）微調同一位臺灣口音的配音員，聽起來仍然是真人的聲音。
產生過的句子存在資料夾 tts/（同一句不用再產生），離線時就用已經有的。
"""
import asyncio
import hashlib
import os
import threading

from .settings import data_dir

# id: (名稱, 性別, 年齡, 語音, 音高, 語速, 備用語音)
# 臺灣男聲 YunJhe 在微軟服務偶爾連續失敗 → 自動改用同性別、同年齡的備用自然人聲
VOICES = [
    ("f-child", "小女孩", "女", "兒童", "zh-TW-HsiaoYuNeural", "+45Hz", "+6%", "zh-CN-XiaoyiNeural"),
    ("f-young", "年輕女生", "女", "青年", "zh-TW-HsiaoYuNeural", "+0Hz", "+0%", "zh-CN-XiaoyiNeural"),
    ("f-adult", "成年女性", "女", "成年", "zh-TW-HsiaoChenNeural", "+0Hz", "+0%", "zh-CN-XiaoxiaoNeural"),
    ("f-elder", "阿嬤（長輩女性）", "女", "長輩", "zh-TW-HsiaoChenNeural", "-28Hz", "-14%", "zh-CN-XiaoxiaoNeural"),
    ("m-child", "小男孩", "男", "兒童", "zh-CN-YunxiaNeural", "+0Hz", "+0%", "zh-CN-YunxiaNeural"),
    ("m-young", "年輕男生", "男", "青年", "zh-TW-YunJheNeural", "+12Hz", "+6%", "zh-CN-YunxiNeural"),
    ("m-adult", "成年男性", "男", "成年", "zh-TW-YunJheNeural", "-2Hz", "-2%", "zh-CN-YunyangNeural"),
    ("m-elder", "阿公（長輩男性）", "男", "長輩", "zh-TW-YunJheNeural", "-20Hz", "-14%", "zh-CN-YunyangNeural"),
]
BY_ID = {v[0]: v for v in VOICES}
DEFAULT = "f-adult"
_lock = threading.Lock()
_BAD = {}          # 最近失敗的語音 → 到期時間（這段時間直接用備用語音，不用每句都等）


def public():
    return [dict(id=v[0], name=v[1], gender=v[2], age=v[3]) for v in VOICES]


def cache_dir():
    d = os.path.join(data_dir(), "tts")
    os.makedirs(d, exist_ok=True)
    return d


def _rate(base, speed):
    """base 例如 "-14%"，speed 0.5～2.0（1＝正常）→ 合併成 edge-tts 的 rate。"""
    b = int(base.rstrip("%"))
    s = int(round((float(speed or 1) - 1) * 100))
    v = max(-60, min(150, b + s))
    return ("+%d%%" % v) if v >= 0 else ("%d%%" % v)


def key(text, voice, speed=1.0):
    v = BY_ID.get(voice) or BY_ID[DEFAULT]
    return hashlib.sha1(("%s|%s|%s|%s|%s" % (v[4], v[5], _rate(v[6], speed), "v1", text)).encode("utf-8")).hexdigest()


def synth(text, voice=DEFAULT, speed=1.0):
    """回傳 mp3 檔路徑。text 會先整理空白；太長的句子由畫面先切好。"""
    text = " ".join((text or "").split())[:1500]
    if not text:
        raise ValueError("沒有文字")
    v = BY_ID.get(voice) or BY_ID[DEFAULT]
    path = os.path.join(cache_dir(), key(text, voice, speed) + ".mp3")
    if os.path.isfile(path) and os.path.getsize(path) > 200:
        return path
    import edge_tts
    import time
    tmp = path + ".part%d" % threading.get_ident()
    err = None
    rate = _rate(v[6], speed)
    if _BAD.get(v[4], 0) < time.time() and v[7] != v[4]:
        # 主要語音與備用語音同時開始：主要的 2.5 秒內成功就用主要的（臺灣口音），不然用備用的，不讓讀者等太久
        async def one(name, out):
            await edge_tts.Communicate(text, name, rate=rate, pitch=v[5]).save(out)
            return out if os.path.getsize(out) > 200 else None

        async def race():
            t1 = asyncio.ensure_future(one(v[4], tmp + "a"))
            t2 = asyncio.ensure_future(one(v[7], tmp + "b"))
            try:
                r = await asyncio.wait_for(asyncio.shield(t1), 2.5)
                if r:
                    t2.cancel()
                    return r
            except Exception:
                _BAD[v[4]] = time.time() + 600
            try:
                return await t2
            except Exception:
                return None
        try:
            got = asyncio.run(race())
        except Exception as e:
            got, err = None, e
        for suf in ("a", "b"):
            if got != tmp + suf:
                try:
                    os.remove(tmp + suf)
                except OSError:
                    pass
        if got:
            os.replace(got, path)
            return path
    first = 1 if _BAD.get(v[4], 0) < time.time() else 2
    for k in range(first, 5):
        name = v[4] if k < 2 else v[7]
        try:
            asyncio.run(edge_tts.Communicate(text, name, rate=_rate(v[6], speed), pitch=v[5]).save(tmp))
            if os.path.getsize(tmp) > 200:
                os.replace(tmp, path)
                return path
        except Exception as e:          # 偶爾回 503，稍等再試
            err = e
            if k == 1:
                _BAD[v[4]] = time.time() + 600
            else:
                time.sleep(0.3 + k * 0.4)
    try:
        os.remove(tmp)
    except OSError:
        pass
    raise RuntimeError("語音產生失敗（請確認電腦有連上網路）：%s" % err)


def probe():
    """程式啟動時在背景試一下各個臺灣語音（先知道哪個今天不穩，第一句就不用等）。"""
    def run():
        import time
        import edge_tts
        for name in sorted({v[4] for v in VOICES}):
            try:
                async def go():
                    got = False
                    async for ch in edge_tts.Communicate("測試", name).stream():   # 整段讀完，不留下未關閉的連線
                        got = got or ch["type"] == "audio"
                    return got
                if not asyncio.run(go()):
                    raise RuntimeError("no audio")
            except Exception:
                _BAD[name] = time.time() + 600
    threading.Thread(target=run, daemon=True).start()
