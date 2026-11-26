/* 翻頁引擎：書頁「一角掀起來」的真實翻頁效果（Canvas 2D，自己寫的，不用外部套件）。
 *
 * 原理：抓住頁角 C 拖到滑鼠位置 M，摺線＝C 與 M 的垂直平分線。
 *   摺線靠頁角那一側的紙被掀起、沿摺線翻過去（鏡射），露出背面（下一頁的左頁）；
 *   被掀開的地方露出底下那一頁。頁角被「釘」在書背上：M 與書背同側端點的距離不能超過頁寬。
 * 為了左右通用，所有計算都在「頁面座標」：原點＝書背上緣，x 朝頁面外側、y 朝下；
 *   右頁直接對應螢幕，左頁再左右鏡射回螢幕（畫圖片時另外補一次鏡射，所以字不會反）。
 *
 * new FB.Flip(canvas, {
 *   count: 頁數, image(i)→Image|null, aspect: 寬/高, single, rtl, hard, duration(秒),
 *   onChange(spread), onFlipStart(), onFlipEnd(), onDraw(), padding
 * })
 */
(function () {
  const FB = (window.FB = window.FB || {});

  // ---------------------------------------------------------------- 幾何小工具
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function clipHalf(poly, P, n, keepPositive) {
    // Sutherland–Hodgman：留下 (X-P)·n ≥ 0（或 ≤ 0）的部分
    const s = keepPositive ? 1 : -1;
    const side = (p) => s * ((p[0] - P[0]) * n[0] + (p[1] - P[1]) * n[1]);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = side(a), db = side(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }
  const mul = (A, B) => [ // 仿射矩陣 [a,b,c,d,e,f]：x' = a x + c y + e、y' = b x + d y + f
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const apply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];

  class Flip {
    constructor(canvas, o) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ count: 0, aspect: 0.707, single: false, rtl: false, hard: false, duration: 0.7, padding: 0.04,
        image: () => null, onChange() {}, onFlipStart() {}, onFlipEnd() {}, onDraw() {}, paper: '#ffffff', sound: null }, o);
      this.spread = 0;
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.anim = null;     // 進行中的翻頁 {dir, side, pages, M, corner, ...}
      this.peek = null;     // 滑鼠停在頁角時微微掀起
      this.drag = null;
      this.enabled = true;
      this._bind();
      this.resize();
    }

    // ================================================================ 頁面配置
    get count() { return this.o.count; }
    get single() { return this.o.single; }
    get fwdSide() { return this.o.rtl ? 'L' : 'R'; }
    spreads() { return this.single ? this.count : Math.floor(this.count / 2) + 1; }
    // 第 k 個跨頁：A＝書背「後方」那頁、B＝往前翻的那一側的頁（LTR：A 左 B 右）
    pagesOf(k) {
      if (this.single) return { A: -1, B: k < this.count ? k : -1 };
      const A = 2 * k - 1, B = 2 * k;
      return { A: A >= 0 && A < this.count ? A : -1, B: B < this.count ? B : -1 };
    }
    spreadOf(page) { return this.single ? page : Math.floor((page + 1) / 2); }
    visiblePages() { const p = this.pagesOf(this.spread); return [p.A, p.B].filter((x) => x >= 0).sort((a, b) => a - b); }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const r = this.cv.getBoundingClientRect();
      const z = (FB.Z && FB.Z()) || 1;
      this.cw = Math.max(50, r.width / z); this.ch = Math.max(50, r.height / z);
      this.scale = dpr * z;
      this.cv.width = Math.round(this.cw * this.scale);
      this.cv.height = Math.round(this.ch * this.scale);
      this.layout();
      this.draw();
    }
    layout() {
      const pad = this.o.padding, a = this.o.aspect || 0.707;
      const availW = this.cw * (1 - pad * 2), availH = this.ch * (1 - pad * 2);
      const cols = this.single ? 1 : 2;
      let ph = availH, pw = ph * a;
      if (pw * cols > availW) { pw = availW / cols; ph = pw / a; }
      pw *= this.zoom; ph *= this.zoom;
      this.W = pw; this.H = ph;
      this.top = (this.ch - ph) / 2 + this.panY;
      if (this.single) {
        const left = (this.cw - pw) / 2 + this.panX;
        this.spineX = this.fwdSide === 'R' ? left : left + pw;
      } else this.spineX = this.cw / 2 + this.panX;
    }
    // 只有一頁（封面、封底）時讓那一頁置中
    centerOffset(k) {
      if (this.single || !this.o.center) return 0;
      const p = this.pagesOf(k);
      const s = this.o.rtl ? -1 : 1;
      if (p.A < 0 && p.B >= 0) return -s * this.W / 2;
      if (p.B < 0 && p.A >= 0) return s * this.W / 2;
      return 0;
    }
    // 各側頁面在螢幕上的位置（給畫面上的連結、影片圖層對位）
    sideRect(side, off) {
      const x = side === 'R' ? this.spineX + (off || 0) : this.spineX + (off || 0) - this.W;
      return { x, y: this.top, w: this.W, h: this.H };
    }
    pageRects() {
      const out = {};
      if (this.anim) return out;
      const p = this.pagesOf(this.spread), off = this.centerOffset(this.spread);
      const fs = this.fwdSide, bs = fs === 'R' ? 'L' : 'R';
      if (p.B >= 0) out[p.B] = this.sideRect(fs, off);
      if (p.A >= 0) out[p.A] = this.sideRect(bs, off);
      return out;
    }
    pageAt(x, y) {
      const r = this.pageRects();
      for (const k in r) { const q = r[k]; if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return { page: +k, rect: q, u: (x - q.x) / q.w, v: (y - q.y) / q.h }; }
      return null;
    }
    // 頁面座標 → 螢幕
    S(side, off) {
      const sx = this.spineX + (off || 0);
      return side === 'R' ? [1, 0, 0, 1, sx, this.top] : [-1, 0, 0, 1, sx, this.top];
    }

    // ================================================================ 畫圖
    setTx(M) { const s = this.scale; this.ctx.setTransform(M[0] * s, M[1] * s, M[2] * s, M[3] * s, M[4] * s, M[5] * s); }
    pathPoly(poly) { const c = this.ctx; c.beginPath(); poly.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); }
    // 在「頁面座標」畫第 i 頁；front＝正面（false＝這張紙的背面，也就是下一頁）
    paintPage(i, M, side, front) {
      const c = this.ctx, W = this.W, H = this.H;
      // 這一側正面：右頁 u＝x；左頁 u＝W−x。背面相反
      const mirror = (side === 'R') !== front;
      const T = mirror ? mul(M, [-1, 0, 0, 1, W, 0]) : M;
      this.setTx(T);
      c.fillStyle = this.o.paper;
      c.fillRect(0, 0, W, H);
      if (i < 0) return;
      const img = this.o.image(i);
      if (img && img.complete && img.naturalWidth) c.drawImage(img, 0, 0, W, H);
      else { c.fillStyle = '#c9ced6'; c.font = Math.round(W * 0.06) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('載入中…', W / 2, H / 2); }
      // 書背的內側陰影（靠書背那一邊暗一點，像真的書）
      if (!this.single) {
        const spineU = mirror ? W : 0;     // 圖片座標中書背所在的 x
        const g = c.createLinearGradient(spineU, 0, spineU + (mirror ? -1 : 1) * W * 0.12, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.20)'); g.addColorStop(0.35, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
    }
    flatPage(i, side, off) {
      if (i < 0) return;
      const c = this.ctx;
      c.save();
      this.paintPage(i, this.S(side, off), side, true);
      c.restore();
    }
    bookShadow(off, sides) {
      const c = this.ctx;
      c.save();
      this.setTx([1, 0, 0, 1, 0, 0]);
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 24 * this.scale; c.shadowOffsetY = 6 * this.scale;
      c.fillStyle = this.o.paper;
      for (const s of sides) { const r = this.sideRect(s, off); c.fillRect(r.x, r.y, r.w, r.h); }
      c.restore();
    }
    // 書口的紙張厚度線（還有很多頁的那一側比較厚）
    edges(off, side, n) {
      if (n <= 0 || this.single) return;
      const c = this.ctx, r = this.sideRect(side, off), k = Math.min(6, Math.ceil(n / 8));
      c.save(); this.setTx([1, 0, 0, 1, 0, 0]);
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
      for (let j = 1; j <= k; j++) {
        const x = side === 'R' ? r.x + r.w + j * 1.4 : r.x - j * 1.4;
        c.beginPath(); c.moveTo(x, r.y + j); c.lineTo(x, r.y + r.h - j); c.stroke();
      }
      c.restore();
    }

    draw() {
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      if (!this.count) return;
      const a = this.anim || (this.peek && !this.drag ? this.peek : null);
      if (a) this.drawFlip(a);
      else {
        const p = this.pagesOf(this.spread), off = this.centerOffset(this.spread);
        const fs = this.fwdSide, bs = fs === 'R' ? 'L' : 'R';
        this.bookShadow(off, [p.A >= 0 ? bs : null, p.B >= 0 ? fs : null].filter(Boolean));
        this.flatPage(p.A, bs, off);
        this.flatPage(p.B, fs, off);
        this.edges(off, fs, this.count - 1 - Math.max(p.A, p.B));
        this.edges(off, bs, Math.min(...[p.A, p.B].filter((x) => x >= 0)));
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      this.o.onDraw();
    }

    // 一次翻頁要用到的頁：side 翻動的一側；front 翻起的那頁、back 它的背面、under 掀開後露出的頁、still 另一側不動的頁
    flipPages(dir) {
      const k = this.spread;
      const cur = this.pagesOf(k);
      const fs = this.fwdSide, bs = fs === 'R' ? 'L' : 'R';
      if (dir > 0) {
        const nx = this.pagesOf(k + 1);
        return { side: fs, front: cur.B, back: this.single ? -2 : nx.A, under: nx.B, still: cur.A, from: k, to: k + 1 };
      }
      const pv = this.pagesOf(k - 1);
      if (this.single) return { side: fs, front: pv.B, back: -2, under: cur.B, still: -1, from: k, to: k - 1, reverse: true };
      return { side: bs, front: cur.A, back: pv.B, under: pv.A, still: cur.B, from: k, to: k - 1 };
    }
    isHard(f) { return this.o.hard && !this.single && [f.front, f.back].some((i) => i === 0 || i === this.count - 1); }

    drawFlip(a) {
      const c = this.ctx, W = this.W, H = this.H;
      const f = a.f;
      // 頁角在頁面座標的位置 → 進度（0 還沒翻、1 翻完）
      const prog = Math.max(0, Math.min(1, (W - a.M[0]) / (2 * W)));
      const off = this.centerOffset(f.from) + (this.centerOffset(f.to) - this.centerOffset(f.from)) * (a.reverseOffset ? 1 - prog : prog);
      const side = f.side, other = side === 'R' ? 'L' : 'R';
      const S = this.S(side, off);
      // 底下的書（另一側＋翻頁那一側最底下）
      const shadowSides = [];
      if (f.still >= 0) shadowSides.push(other);
      if (f.under >= 0 || f.front >= 0) shadowSides.push(side);
      this.bookShadow(off, [...new Set(shadowSides)]);
      this.flatPage(f.still, other, off);
      if (this.isHard(f)) return this.drawHard(a, f, S, side, off, prog);

      const C = [W, a.corner];
      let M = a.M.slice();
      if (Math.hypot(M[0] - C[0], M[1] - C[1]) < 0.5) { // 幾乎沒掀：直接畫平的
        this.flatPage(f.front, side, off);
        return;
      }
      const P = [(C[0] + M[0]) / 2, (C[1] + M[1]) / 2];
      const len = Math.hypot(C[0] - M[0], C[1] - M[1]);
      const n = [(C[0] - M[0]) / len, (C[1] - M[1]) / len];
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      const F = clipHalf(rect, P, n, true);      // 掀起來的部分（原位置）
      const K = clipHalf(rect, P, n, false);     // 還平貼著的部分
      const pn = P[0] * n[0] + P[1] * n[1];
      const R = [1 - 2 * n[0] * n[0], -2 * n[0] * n[1], -2 * n[0] * n[1], 1 - 2 * n[1] * n[1], 2 * pn * n[0], 2 * pn * n[1]];
      const flap = F.map((p) => apply(R, p));

      // 1. 掀開處露出的頁＋翻頁投下的陰影
      c.save();
      this.setTx(S); this.pathPoly(F); c.clip();
      this.paintPage(f.under, S, side, true);
      this.setTx(S);
      const sh = Math.min(W * 0.35, len * 0.6);
      const g1 = c.createLinearGradient(P[0], P[1], P[0] + n[0] * sh, P[1] + n[1] * sh);
      g1.addColorStop(0, 'rgba(0,0,0,0.38)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g1; this.pathPoly(F); c.fill();
      c.restore();
      // 2. 還平貼的部分
      if (K.length > 2) {
        c.save(); this.setTx(S); this.pathPoly(K); c.clip();
        this.paintPage(f.front, S, side, true);
        // 翻起的紙在平面上的陰影（摺線外側一點點）
        this.setTx(S);
        const g2 = c.createLinearGradient(P[0], P[1], P[0] - n[0] * W * 0.08, P[1] - n[1] * W * 0.08);
        g2.addColorStop(0, 'rgba(0,0,0,0.22)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g2; this.pathPoly(K); c.fill();
        c.restore();
      }
      // 3. 翻過去的那一片（背面）
      if (flap.length > 2) {
        c.save();
        this.setTx(S);
        c.shadowColor = 'rgba(0,0,0,0.30)'; c.shadowBlur = 14 * this.scale;
        c.fillStyle = this.o.paper; this.pathPoly(flap); c.fill();
        c.shadowColor = 'transparent';
        this.pathPoly(flap); c.clip();
        if (f.back === -2) { // 單頁模式：紙的背面（淡淡透出正面）
          this.setTx(mul(S, R)); c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, W, H);
          c.globalAlpha = 0.12; this.paintPage(f.front, mul(S, R), side, true); c.globalAlpha = 1;
        } else this.paintPage(f.back, mul(S, R), side, false);
        // 紙張彎曲的光影：摺線處最暗，往外漸亮
        this.setTx(S);
        const w = Math.min(len * 0.5, W * 0.5);
        const g3 = c.createLinearGradient(P[0], P[1], P[0] - n[0] * w, P[1] - n[1] * w);
        g3.addColorStop(0, 'rgba(0,0,0,0.25)'); g3.addColorStop(0.12, 'rgba(255,255,255,0.18)');
        g3.addColorStop(0.45, 'rgba(0,0,0,0.04)'); g3.addColorStop(1, 'rgba(0,0,0,0.10)');
        c.fillStyle = g3; this.pathPoly(flap); c.fill();
        c.restore();
      }
    }

    // 硬封面：繞著書背轉（不彎曲）
    drawHard(a, f, S, side, off, prog) {
      const c = this.ctx, W = this.W, H = this.H;
      const th = Math.PI * prog, cs = Math.cos(th);
      this.flatPage(f.under, side, off);
      c.save();
      if (cs > 0) {
        const T = mul(S, [cs, 0, -0.0, 1, 0, 0]);
        c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 16 * this.scale;
        this.setTx(T); c.fillStyle = this.o.paper; c.fillRect(0, 0, W, H); c.shadowColor = 'transparent';
        this.paintPage(f.front, T, side, true);
        this.setTx(T); c.fillStyle = 'rgba(0,0,0,' + (0.25 * (1 - cs)).toFixed(3) + ')'; c.fillRect(0, 0, W, H);
      } else {
        const T = mul(S, [cs, 0, 0, 1, 0, 0]);   // x 變負＝到另一側
        c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 16 * this.scale;
        this.setTx(T); c.fillStyle = this.o.paper; c.fillRect(0, 0, W, H); c.shadowColor = 'transparent';
        this.paintPage(f.back, T, side, false);
        this.setTx(T); c.fillStyle = 'rgba(0,0,0,' + (0.25 * (1 + cs)).toFixed(3) + ')'; c.fillRect(0, 0, W, H);
      }
      c.restore();
    }

    // ================================================================ 翻頁動作
    canFlip(dir) {
      if (!this.count) return false;
      const t = this.spread + dir;
      if (t < 0 || t >= this.spreads()) return false;
      const f = this.flipPages(dir);
      return f.front >= 0 || f.under >= 0;
    }
    constrain(M, corner) {
      const W = this.W, H = this.H;
      const E = [0, corner], O = [0, H - corner], D = Math.hypot(W, H);
      for (let k = 0; k < 2; k++) {
        let d = Math.hypot(M[0] - E[0], M[1] - E[1]);
        if (d > W) M = [E[0] + (M[0] - E[0]) * W / d, E[1] + (M[1] - E[1]) * W / d];
        d = Math.hypot(M[0] - O[0], M[1] - O[1]);
        if (d > D) M = [O[0] + (M[0] - O[0]) * D / d, O[1] + (M[1] - O[1]) * D / d];
      }
      return M;
    }
    // 螢幕座標 → 某一側的頁面座標
    toLocal(side, x, y, off) {
      const sx = this.spineX + (off || 0);
      return [side === 'R' ? x - sx : sx - x, y - this.top];
    }

    // 用動畫翻一頁（按鈕、鍵盤、眼控、自動播放）
    flip(dir, opts) {
      if (this.anim || !this.enabled) return false;
      if (!this.canFlip(dir)) return false;
      const f = this.flipPages(dir);
      const corner = (opts && opts.top) ? 0 : this.H;
      const W = this.W, H = this.H;
      const start = f.reverse ? [-W, corner] : (this.peek && this.peek.f.side === f.side && this.peek.dir === dir ? this.peek.M.slice() : [W, corner]);
      const end = f.reverse ? [W, corner] : [-W, corner];
      const lift = corner ? -1 : 1;
      this.peek = null;
      this._run({ f, dir, corner, M: start, from: start, to: end, arc: H * 0.12 * lift, dur: this.o.duration, done: true, reverseOffset: !!f.reverse });
      return true;
    }
    next(o) { return this.flip(1, o); }
    prev(o) { return this.flip(-1, o); }
    goto(page) {
      const k = Math.max(0, Math.min(this.spreads() - 1, this.spreadOf(page)));
      if (k === this.spread || this.anim) return;
      if (Math.abs(k - this.spread) === 1) return this.flip(k > this.spread ? 1 : -1);
      // 跳很多頁：直接換到那一頁，再用一次翻頁動畫帶過去
      const dir = k > this.spread ? 1 : -1;
      this.spread = k - dir;
      if (!this.flip(dir)) { this.spread = k; this.draw(); this.o.onChange(this.spread); }
    }
    _run(a) {
      this.anim = a;
      this.o.onFlipStart(a);
      if (this.o.sound && a.done) this.o.sound();
      const t0 = performance.now();
      const step = (now) => {
        if (this.anim !== a) return;
        let t = Math.min(1, (now - t0) / 1000 / Math.max(0.05, a.dur));
        const e = a.easeOut ? easeOut(t) : ease(t);
        const M = [a.from[0] + (a.to[0] - a.from[0]) * e, a.from[1] + (a.to[1] - a.from[1]) * e];
        M[1] += a.arc * Math.sin(Math.PI * e);
        a.M = this.constrain(M, a.corner);
        this.draw();
        if (t < 1) return requestAnimationFrame(step);
        this.anim = null;
        if (a.done && !a.cancel) { this.spread = a.f.to; this.o.onChange(this.spread); }
        this.draw();
        this.o.onFlipEnd(a);
      };
      requestAnimationFrame(step);
    }

    // ================================================================ 滑鼠、觸控
    _bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(), z = (FB.Z && FB.Z()) || 1; return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; };
      cv.addEventListener('pointerdown', (e) => {
        if (!this.enabled || this.anim || e.button > 0) return;
        const [x, y] = pos(e);
        if (this.zoom > 1.01) { this.drag = { pan: true, x, y, px: this.panX, py: this.panY, moved: 0 }; cv.setPointerCapture(e.pointerId); return; }
        const g = this.grab(x, y);
        if (!g) return;
        this.drag = Object.assign(g, { x0: x, y0: y, t0: performance.now(), moved: 0 });
        this.peek = null;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        const [x, y] = pos(e);
        const d = this.drag;
        if (d && d.pan) {
          this.panX = d.px + x - d.x; this.panY = d.py + y - d.y; d.moved += 1;
          this.layout(); this.draw(); return;
        }
        if (d) {
          d.moved = Math.max(d.moved, Math.hypot(x - d.x0, y - d.y0));
          if (d.moved < 4) return;
          if (!this.anim || !this.anim.dragging) {
            this.anim = { f: d.f, dir: d.dir, corner: d.corner, M: [this.W, d.corner], dragging: true, reverseOffset: !!d.f.reverse };
            this.o.onFlipStart(this.anim);
          }
          const off = this.centerOffset(d.f.from);
          let L = this.toLocal(d.f.side, x, y, off);
          if (d.f.reverse) L = [L[0] - 0, L[1]];
          this.anim.M = this.constrain(L, d.corner);
          d.lastX = L[0]; d.lastT = performance.now();
          this.draw();
          return;
        }
        if (e.pointerType === 'mouse') this.hover(x, y);
      });
      const up = (e) => {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        if (d.pan) { if (d.moved < 3 && this.o.onTap) this.o.onTap(...pos(e)); return; }
        const a = this.anim;
        if (!a || !a.dragging) { // 沒有拖：當作點一下 → 往那個方向翻
          this.anim = null;
          if (this.o.onTap && this.o.onTap(...pos(e)) === false) return;
          this.flip(d.dir, { top: d.corner === 0 });
          return;
        }
        const W = this.W;
        const vel = d.lastT ? (a.M[0] - (d.prevX ?? W)) : 0;
        const goOn = d.f.reverse ? a.M[0] > -W * 0.2 : (a.M[0] < W * 0.3 || (performance.now() - d.t0 < 300 && d.moved > 30));
        const target = goOn ? (d.f.reverse ? [W, d.corner] : [-W, d.corner]) : (d.f.reverse ? [-W, d.corner] : [W, d.corner]);
        const frac = Math.abs(target[0] - a.M[0]) / (2 * W);
        this.anim = null;
        this._run({ f: d.f, dir: d.dir, corner: d.corner, M: a.M, from: a.M.slice(), to: target, arc: 0, dur: Math.max(0.15, this.o.duration * frac), done: goOn, cancel: !goOn, easeOut: true, reverseOffset: !!d.f.reverse });
        void vel;
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('pointerleave', (e) => { if (!this.drag && this.peek && e.pointerType === 'mouse') { this.peek = null; this.draw(); } });
      cv.addEventListener('wheel', (e) => {
        if (!this.o.wheel || this.zoom > 1.01 || this.anim) return;
        e.preventDefault();
        if (Math.abs(e.deltaY) > 8) this.flip(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    }
    // 按下的位置可以翻哪一頁：右頁往前、左頁往後（RTL 相反）；上半部抓上角
    grab(x, y) {
      const off = this.centerOffset(this.spread);
      for (const dir of [1, -1]) {
        if (!this.canFlip(dir)) continue;
        const f = this.flipPages(dir);
        const side = this.single ? f.side : (dir > 0 ? this.fwdSide : (this.fwdSide === 'R' ? 'L' : 'R'));
        const L = this.toLocal(side, x, y, off);
        if (this.single) {
          // 單頁：右半往前、左半往後
          if (L[1] < 0 || L[1] > this.H || L[0] < 0 || L[0] > this.W) continue;
          if ((dir > 0) !== (L[0] > this.W * 0.5)) continue;
        } else if (L[0] < 0 || L[0] > this.W || L[1] < 0 || L[1] > this.H) continue;
        return { f, dir, corner: L[1] < this.H / 2 ? 0 : this.H };
      }
      return null;
    }
    // 滑鼠停在頁角附近：那一角微微掀起來（提示可以翻）
    hover(x, y) {
      if (this.anim || this.zoom > 1.01 || !this.enabled) return;
      const off = this.centerOffset(this.spread);
      let pk = null;
      for (const dir of [1, -1]) {
        if (!this.canFlip(dir)) continue;
        const f = this.flipPages(dir);
        if (f.reverse) continue;
        const L = this.toLocal(f.side, x, y, off);
        const zone = Math.min(this.W, this.H) * 0.16;
        for (const corner of [0, this.H]) {
          const d = Math.hypot(L[0] - this.W, L[1] - corner);
          if (d < zone && L[0] <= this.W + 2) {
            const k = 0.55;  // 掀起的幅度
            const M = [this.W - (this.W - L[0]) * k - zone * 0.25, corner + (L[1] - corner) * k + (corner ? -1 : 1) * zone * 0.25];
            pk = { f, dir, corner, M: this.constrain(M, corner), peek: true };
          }
        }
      }
      if (!!pk !== !!this.peek || pk) { this.peek = pk; this.draw(); }
    }
    setZoom(z, cx, cy) {
      z = Math.max(1, Math.min(4, z));
      if (z === 1) { this.panX = 0; this.panY = 0; }
      else if (cx !== undefined) { // 以 (cx,cy) 為中心放大
        const k = z / this.zoom;
        this.panX = (this.panX - (cx - this.cw / 2)) * k + (cx - this.cw / 2);
        this.panY = (this.panY - (cy - this.ch / 2)) * k + (cy - this.ch / 2);
      }
      this.zoom = z; this.peek = null;
      this.layout(); this.draw();
    }
    set(o) { Object.assign(this.o, o); this.spread = Math.min(this.spread, Math.max(0, this.spreads() - 1)); this.layout(); this.draw(); }
  }
  FB.Flip = Flip;
})();
