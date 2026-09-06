'use strict';
// STATIC — circuit backdrop. A fixed canvas behind every page: PCB traces
// with 45° bends, via pads at junctions, and packets of light traveling the
// network. Kept low-contrast so the page stays readable; honours
// prefers-reduced-motion (static traces, no packets); pauses when hidden.

(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.className = 'backdrop'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');

  const PAL = ['#5dcaa5', '#378add', '#9b6dd6', '#1d9e75', '#fac775'];
  const TRACE = 'rgba(96,116,150,0.13)';
  const PAD   = 'rgba(96,116,150,0.28)';
  const CELL  = 42;               // grid pitch
  let W = 0, H = 0, dpr = 1, traces = [], packets = [], raf = 0, last = 0;

  // ---- build a PCB-ish network on a grid ----
  function build() {
    traces = []; packets = [];
    const cols = Math.ceil(W / CELL) + 2, rows = Math.ceil(H / CELL) + 2;
    const count = Math.max(10, Math.floor((W * H) / 26000));
    const used = new Set();
    for (let t = 0; t < count; t++) {
      let cx = Math.floor(Math.random() * cols) - 1, cy = Math.floor(Math.random() * rows) - 1;
      const pts = [[cx * CELL, cy * CELL]];
      let dir = [[1,0],[0,1],[-1,0],[0,-1]][Math.floor(Math.random()*4)];
      const len = 4 + Math.floor(Math.random() * 10);
      for (let i = 0; i < len; i++) {
        // mostly straight, sometimes a 45° jog (PCB style), sometimes a right turn
        const r = Math.random();
        if (r < 0.18) {               // 45° jog
          const d = [dir[0] + (dir[1] === 0 ? (Math.random()<.5?1:-1)*0 : 0), dir[1]];
          const jog = dir[0] !== 0 ? [dir[0], Math.random()<.5?1:-1] : [Math.random()<.5?1:-1, dir[1]];
          cx += jog[0]; cy += jog[1];
        } else if (r < 0.30) {        // right-angle turn
          dir = dir[0] !== 0 ? [0, Math.random()<.5?1:-1] : [Math.random()<.5?1:-1, 0];
          cx += dir[0] * 2; cy += dir[1] * 2;
        } else {
          cx += dir[0] * 2; cy += dir[1] * 2;
        }
        pts.push([cx * CELL, cy * CELL]);
        if (cx < -2 || cy < -2 || cx > cols + 1 || cy > rows + 1) break;
      }
      // cumulative lengths for packet travel
      const seg = [0];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0]-pts[i-1][0], dy = pts[i][1]-pts[i-1][1];
        seg.push(seg[i-1] + Math.hypot(dx, dy));
      }
      traces.push({ pts, seg, total: seg[seg.length-1] });
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = TRACE;
    for (const t of traces) {
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i][0], t.pts[i][1]);
      ctx.stroke();
    }
    // via pads at trace ends + some junctions
    ctx.strokeStyle = PAD; ctx.fillStyle = '#0c0e12';
    for (const t of traces) {
      for (const p of [t.pts[0], t.pts[t.pts.length-1]]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ---- packets: a bright short dash moving along a trace with a fading tail ----
  function spawn() {
    if (packets.length > Math.max(8, traces.length * 0.35)) return;
    const t = traces[Math.floor(Math.random() * traces.length)];
    if (!t || t.total < CELL) return;
    packets.push({ t, d: 0, v: 55 + Math.random() * 90, col: PAL[Math.floor(Math.random()*PAL.length)], len: 26 + Math.random()*30 });
  }
  function posAt(t, d) {
    d = Math.max(0, Math.min(t.total, d));
    let i = 1; while (i < t.seg.length - 1 && t.seg[i] < d) i++;
    const a = t.pts[i-1], b = t.pts[i], s0 = t.seg[i-1], s1 = t.seg[i];
    const f = s1 > s0 ? (d - s0) / (s1 - s0) : 0;
    return [a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f];
  }
  function drawPackets(dt) {
    ctx.lineCap = 'round';
    for (let k = packets.length - 1; k >= 0; k--) {
      const p = packets[k];
      p.d += p.v * dt;
      if (p.d - p.len > p.t.total) { packets.splice(k, 1); continue; }
      // tail as several fading dashes
      const steps = 5;
      for (let s = 0; s < steps; s++) {
        const d1 = p.d - (s * p.len / steps), d0 = d1 - p.len / steps;
        if (d1 <= 0) break;
        const a = posAt(p.t, d0), b = posAt(p.t, d1);
        ctx.strokeStyle = p.col; ctx.globalAlpha = 0.62 * (1 - s / steps);
        ctx.lineWidth = s === 0 ? 2 : 1.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // head glow
      const h = posAt(p.t, p.d);
      ctx.fillStyle = p.col; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(h[0], h[1], 1.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    drawStatic();
    acc += dt; if (acc > 0.22) { acc = 0; spawn(); }
    drawPackets(dt);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduced) drawStatic();
  }
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  resize();
  if (!reduced) { last = performance.now(); raf = requestAnimationFrame(frame); }
})();
