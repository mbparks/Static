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

// =====================================================================
//  RF waterfall — a spectrum display down the right ~20% of the screen.
//  Frequency across, time scrolling down. A live noise floor, a few
//  drifting carriers, bursty packet trains, and every so often a strong
//  signal that lights the band. Colormap: the classic SDR waterfall.
// =====================================================================
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.className = 'waterfall'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d', { alpha: true });

  // ---- colormap: value 0..1 -> RGB (SDR style) ----
  const STOPS = [[0,[6,8,18]],[0.18,[10,30,110]],[0.36,[0,120,210]],[0.52,[0,205,190]],
                 [0.66,[70,220,60]],[0.80,[250,215,40]],[0.92,[240,70,40]],[1,[255,240,230]]];
  const CMAP = new Array(256);
  for (let i=0;i<256;i++){
    const v=i/255; let a=STOPS[0], b=STOPS[STOPS.length-1];
    for (let k=0;k<STOPS.length-1;k++){ if (v>=STOPS[k][0] && v<=STOPS[k+1][0]){ a=STOPS[k]; b=STOPS[k+1]; break; } }
    const f=(v-a[0])/((b[0]-a[0])||1);
    CMAP[i]=[Math.round(a[1][0]+(b[1][0]-a[1][0])*f), Math.round(a[1][1]+(b[1][1]-a[1][1])*f), Math.round(a[1][2]+(b[1][2]-a[1][2])*f)];
  }

  let W=0,H=0,dpr=1,bins=0,row=null,raf=0,last=0,acc=0;
  const carriers=[]; const bursts=[];
  const rnd=(a,b)=>a+Math.random()*(b-a);

  function reseed(){
    carriers.length=0;
    const n = 3 + Math.floor(Math.random()*3);
    for (let i=0;i<n;i++) carriers.push({ x:rnd(0.05,0.95), w:rnd(0.004,0.012), s:rnd(0.45,0.72), drift:rnd(-0.004,0.004), on:true, t:0, period:rnd(0.6,4) });
  }

  // one row of the spectrum, value per bin 0..1
  function spectrumRow(t, dt){
    const v = new Float32Array(bins);
    for (let i=0;i<bins;i++) v[i] = 0.06 + Math.random()*0.13 + 0.05*Math.sin(i*0.05 + t*0.4);
    // carriers: narrow, sometimes keyed on/off, slowly drifting
    for (const c of carriers){
      c.t += dt; if (c.t > c.period){ c.t=0; c.on = Math.random() < 0.75; }
      c.x += c.drift*dt; if (c.x<0.03||c.x>0.97) c.drift*=-1;
      if (!c.on) continue;
      const cx=c.x*bins, cw=Math.max(1,c.w*bins);
      for (let i=Math.floor(cx-cw*3); i<=cx+cw*3; i++){ if(i<0||i>=bins) continue;
        const d=(i-cx)/cw; v[i] += c.s*Math.exp(-d*d*0.9); }
    }
    // bursts: the strong signals
    for (let k=bursts.length-1;k>=0;k--){
      const b=bursts[k]; b.age+=dt;
      if (b.age>b.life){ bursts.splice(k,1); continue; }
      const env = Math.sin(Math.PI*Math.min(1,b.age/b.life));        // swell in/out
      let cx = b.x*bins;
      if (b.kind==='chirp') cx = (b.x + (b.age/b.life)*b.sweep)*bins;   // sweep across
      const cw = Math.max(2, b.w*bins);
      let gate = 1;
      if (b.kind==='packets') gate = (Math.floor(b.age*b.rate)%2===0) ? 1 : 0.05;  // on/off train
      for (let i=Math.floor(cx-cw*2); i<=cx+cw*2; i++){ if(i<0||i>=bins) continue;
        const d=(i-cx)/cw; v[i] += b.s*env*gate*Math.exp(-d*d*1.2); }
      if (b.kind==='wideband') for (let i=0;i<bins;i++) v[i] += 0.08*env*Math.random();
    }
    return v;
  }

  function maybeBurst(dt){
    acc += dt;
    if (acc < rnd(2.5, 7)) return; acc = 0;
    const kinds=['strong','packets','chirp','wideband'];
    const kind = kinds[Math.floor(Math.random()*kinds.length)];
    bursts.push({ kind, x:rnd(0.08,0.9), w: kind==='wideband'?0.35:rnd(0.02,0.09), s: kind==='strong'?rnd(0.9,1.1):rnd(0.7,0.95),
                  age:0, life: kind==='packets'?rnd(2,4):rnd(1.2,3.2), sweep:rnd(-0.5,0.5), rate:rnd(4,10) });
  }

  function paintRow(v){
    // scroll everything down one device pixel, then write the new top row
    ctx.drawImage(cv, 0, 1);
    for (let i=0;i<bins;i++){
      const val = Math.max(0, Math.min(1, v[i]));
      const c = CMAP[Math.round(val*255)];
      row.data[i*4]=c[0]; row.data[i*4+1]=c[1]; row.data[i*4+2]=c[2]; row.data[i*4+3]=255;
    }
    ctx.putImageData(row, 0, 0);
  }

  let tt=0;
  function frame(now){
    const dt=Math.min(0.05,(now-last)/1000||0); last=now; tt+=dt;
    maybeBurst(dt);
    paintRow(spectrumRow(tt, dt));
    raf=requestAnimationFrame(frame);
  }

  function resize(){
    dpr=Math.min(2,window.devicePixelRatio||1);
    W=Math.round(window.innerWidth*0.20); H=window.innerHeight;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    cv.style.width=W+'px'; cv.style.height=H+'px';
    ctx.setTransform(1,0,0,1,0,0);          // work in device pixels for the row buffer
    bins=cv.width; row=ctx.createImageData(bins,1);
    ctx.fillStyle='#06081a'; ctx.fillRect(0,0,cv.width,cv.height);
    reseed();
    // pre-fill the whole display with history so it never starts blank
    tt = 0;
    for (let k=0;k<cv.height;k++){ maybeBurst(0.033); tt += 0.033; paintRow(spectrumRow(tt,0.033)); }
  }
  let rt; window.addEventListener('resize',()=>{clearTimeout(rt); rt=setTimeout(resize,150);});
  document.addEventListener('visibilitychange',()=>{ if(reduced) return;
    if(document.hidden){cancelAnimationFrame(raf); raf=0;} else if(!raf){ last=performance.now(); raf=requestAnimationFrame(frame);} });

  resize();
  if(!reduced){ last=performance.now(); raf=requestAnimationFrame(frame); }
})();
