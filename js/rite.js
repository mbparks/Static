'use strict';

const state = {
  mode:null,            // 'serial' | 'sim'
  cls:null, stats:{MEAT:1,WIRE:2,EDGE:3,SOUL:4},
  chrome:[], look:'', enclave:'', name:'',
  genesis:null, hash:'', ignitionOrder:[],
};

const $ = id => document.getElementById(id);
const screens = ['threshold','builder','name-screen','ignition'];
function show(id){ screens.forEach(s => $(s).classList.toggle('active', s===id)); window.scrollTo(0,0); }

/* ─────────────────── threshold ─────────────────── */
$('btn-sim').addEventListener('click', () => {
  state.mode = 'sim';
  $('detect-head').textContent = '\u25c8 SHARD SIMULATED \u2014 in effigy';
  $('detect-body').innerHTML = 'state: <span style="color:var(--amb)">UNCONSECRATED</span> \u00b7 record: empty \u00b7 nobody yet';
  startBuilder();
});

$('btn-serial').addEventListener('click', async () => {
  const err = $('serial-err'); err.style.display='none';
  if (!('serial' in navigator)) {
    err.textContent = 'This browser has no Web Serial. Chrome or Edge on desktop can reach a Shard.';
    err.style.display='block'; return;
  }
  try {
    const port = await navigator.serial.requestPort();
    const info = port.getInfo();
    state.mode = 'serial';
    state.port = port;
    $('detect-head').textContent = '\u25c8 SHARD DETECTED \u2014 serial';
    $('detect-body').innerHTML =
      'usb ' + (info.usbVendorId ? info.usbVendorId.toString(16) : '?') + ':' +
      (info.usbProductId ? info.usbProductId.toString(16) : '?') +
      ' \u00b7 identity handshake: <span style="color:var(--amb)">pending firmware</span><br>' +
      'treated as: <span style="color:var(--amb)">UNCONSECRATED</span> \u00b7 flashing arrives with firmware v0';
    startBuilder();
  } catch(e) {
    err.textContent = 'No Shard chosen. The rite waits.';
    err.style.display='block';
  }
});

/* ─────────────────── builder frame ─────────────────── */
const RAIL = [
  {id:'connect', label:'CONNECT'},
  {id:'class',   label:'CLASS'},
  {id:'stats',   label:'STATS'},
  {id:'chrome',  label:'CHROME'},
  {id:'flesh',   label:'THE FLESH'},
  {id:'name',    label:'THE NAME'},
  {id:'ignite',  label:'IGNITION'},
];
let step = 'class';
const stepOrder = ['class','stats','chrome','flesh'];

function startBuilder(){ step='class'; show('builder'); renderAll(); }

function railState(id){
  if (id==='connect') return 'done';
  if (id===step) return 'now';
  const bi = stepOrder.indexOf(id), si = stepOrder.indexOf(step);
  if (bi>-1 && si>-1 && bi<si) return 'done';
  if (id==='class' && !stepOrder.includes(step)) return 'done';
  return 'todo';
}
function renderRail(){
  $('rail').innerHTML = RAIL.map(r => {
    const st = railState(r.id);
    const mark = st==='done' ? '\u2713' : st==='now' ? '\u25cf' : '\u25cb';
    const cls  = st==='done' ? 'done' : st==='now' ? 'now' : '';
    const clickable = stepOrder.includes(r.id) && st==='done';
    return clickable
      ? `<div class="${cls}"><button data-goto="${r.id}">${mark} ${r.label}</button></div>`
      : `<div class="${cls}">${mark} ${r.label}</div>`;
  }).join('');
  $('rail').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { step=b.dataset.goto; renderAll(); }));
}

function renderRecord(){
  const c = state.cls;
  const fw = firewall(), hp = hitpoints();
  let html = '<h3>THE RECORD SO FAR</h3>';
  html += `<div class="big">${c ? c.name : 'UNCHOSEN'}</div>`;
  html += `<div class="row">MEAT ${state.stats.MEAT} \u00b7 WIRE ${state.stats.WIRE}<br>EDGE ${state.stats.EDGE} \u00b7 SOUL ${state.stats.SOUL}</div>`;
  html += `<div class="row sep">HP <span class="val">${hp}</span> &nbsp;(8 + 2\u00d7MEAT)<br>` +
          `FIREWALL <span class="${state.chrome.length? 'warnfw':'val'}">${fw}</span> ` +
          `<span class="fw-math">(2 + ${state.stats.WIRE}${state.chrome.length? ' \u2212 '+state.chrome.length+' chrome':''})</span></div>`;
  if (c) html += `<div class="row sep" style="color:var(--dim); font-size:11px;">${c.gear.join('<br>')}</div>`;
  const doc = CONTENT.doctrine[step] || '';
  if (doc) html += `<div class="doctrine sep">${doc.replace(/\n/g,'<br>')}</div>`;
  $('record').innerHTML = html;
}
function firewall(){ return 2 + state.stats.WIRE - state.chrome.length; }
function hitpoints(){ return 8 + 2*state.stats.MEAT; }

function renderStep(){
  const host = $('step-host');
  if (step==='class'){
    host.innerHTML = `<div class="step-title">WHO ARE YOU, THAT THE RUINS SHOULD CARE? \u2014 choose a class.</div>` +
      CONTENT.classes.map(c => `
        <div class="choice ${state.cls&&state.cls.id===c.id?'sel':''}" data-cls="${c.id}" tabindex="0" role="button" aria-pressed="${state.cls&&state.cls.id===c.id}">
          <div class="nm">${state.cls&&state.cls.id===c.id?'\u25c9':'\u25cb'} ${c.name}</div>
          <div class="desc">${c.tag}</div>
          <div class="moves">${c.moves.map(m=>`<b>${m[0]}</b> \u2014 ${m[1]}`).join('<br>')}</div>
        </div>`).join('') +
      `<div class="nav-row"><span></span><button class="primary" id="next" ${state.cls?'':'disabled'}>STATS \u2192</button></div>`;
    host.querySelectorAll('[data-cls]').forEach(el => {
      const pick = () => {
        state.cls = CONTENT.classes.find(c=>c.id===el.dataset.cls);
        state.stats = {...state.cls.array};
        renderAll();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); } });
    });
    host.querySelector('#next').addEventListener('click', ()=>{ step='stats'; renderAll(); });
  }

  if (step==='stats'){
    host.innerHTML = `<div class="step-title">ARRANGE 4 \u00b7 3 \u00b7 2 \u00b7 1. YOUR CLASS SUGGESTS; IT DOESN\u2019T INSIST.</div>
      <div class="statgrid">` +
      STATS.map(k => `
        <div class="statbox"><div class="lbl">${k}</div>
          <select data-stat="${k}" aria-label="${k}">${[4,3,2,1].map(v =>
            `<option value="${v}" ${state.stats[k]===v?'selected':''}>${v}</option>`).join('')}</select>
        </div>`).join('') +
      `</div>
      <div class="stat-desc">MEAT \u2014 muscle, soak, violence by hand. &nbsp;WIRE \u2014 the Mesh, machines, your Firewall\u2019s root.<br>
      EDGE \u2014 speed, nerve, aim. &nbsp;SOUL \u2014 will, the cants, your grip when the Static sings.</div>
      <div class="nav-row"><button id="back">\u2190 CLASS</button><button class="primary" id="next">CHROME \u2192</button></div>`;
    host.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
      const k = sel.dataset.stat, v = +sel.value;
      const holder = STATS.find(s => s!==k && state.stats[s]===v);
      if (holder) state.stats[holder] = state.stats[k];   // swap keeps 4/3/2/1 a permutation
      state.stats[k] = v;
      renderAll();
    }));
    host.querySelector('#back').addEventListener('click', ()=>{ step='class'; renderAll(); });
    host.querySelector('#next').addEventListener('click', ()=>{ step='chrome'; renderAll(); });
  }

  if (step==='chrome'){
    host.innerHTML = `<div class="step-title">HOW MUCH MACHINE ARE YOU, ON DAY ONE? \u2014 choose up to two. zero is a real answer.</div>` +
      CONTENT.chrome.map(ch => {
        const on = state.chrome.includes(ch.id);
        const full = !on && state.chrome.length>=2;
        return `<div class="choice ${on?'sel':''}" data-ch="${ch.id}" tabindex="0" role="checkbox" aria-checked="${on}" ${full?'style="opacity:.45"':''}>
          <div class="nm">${on?'\u2611':'\u2610'} ${ch.name} <span class="cost">FIREWALL \u22121</span></div>
          <div class="desc">${ch.desc}</div></div>`;
      }).join('') +
      `<div class="nav-row"><button id="back">\u2190 STATS</button><button class="primary" id="next">THE FLESH \u2192</button></div>`;
    host.querySelectorAll('[data-ch]').forEach(el => {
      const toggle = () => {
        const id = el.dataset.ch, i = state.chrome.indexOf(id);
        if (i>-1) state.chrome.splice(i,1);
        else if (state.chrome.length<2) state.chrome.push(id);
        renderAll();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
    });
    host.querySelector('#back').addEventListener('click', ()=>{ step='stats'; renderAll(); });
    host.querySelector('#next').addEventListener('click', ()=>{ step='flesh'; renderAll(); });
  }

  if (step==='flesh'){
    const g = state.cls ? state.cls.gear : [];
    host.innerHTML = `<div class="step-title">WHAT THE TABLE SEES. YOUR GEAR IS YOUR CLASS\u2019S; YOUR FACE IS YOURS.</div>
      <div class="panel"><div class="step-title" style="margin-bottom:6px;">ISSUED WITH THE CLASS</div>
        <div class="gearlist">${g.join('<br>')}</div></div>
      <label class="f" for="f-enclave">BORN AT (ENCLAVE)</label>
      <input id="f-enclave" placeholder="Harrow Enclave" value="${state.enclave.replace(/"/g,'&quot;')}">
      <label class="f" for="f-look">THE FLESH \u2014 what they see coming</label>
      <textarea id="f-look" rows="3" placeholder="wire-thin, one grey optic, coat too big on purpose">${state.look}</textarea>
      <div class="nav-row"><button id="back">\u2190 CHROME</button><button class="primary" id="next">THE NAME \u2192</button></div>`;
    host.querySelector('#f-enclave').addEventListener('input', e => state.enclave = e.target.value);
    host.querySelector('#f-look').addEventListener('input', e => state.look = e.target.value);
    host.querySelector('#back').addEventListener('click', ()=>{ step='chrome'; renderAll(); });
    host.querySelector('#next').addEventListener('click', ()=>{ show('name-screen'); $('name-input').focus(); });
  }
}
function renderAll(){ renderRail(); renderStep(); renderRecord(); }

/* ─────────────────── the name ─────────────────── */
function acceptName(){
  const v = $('name-input').value.trim().toUpperCase();
  if (!v){ $('name-err').style.visibility='visible'; return; }
  state.name = v;
  state.ignitionOrder = derivePermutation(v, 24);
  beginIgnition();
}
$('name-input').addEventListener('input', () => $('name-err').style.visibility='hidden');
$('name-input').addEventListener('keydown', e => { if (e.key==='Enter') acceptName(); });
$('name-go').addEventListener('click', acceptName);

/* ─────────────────── ignition ─────────────────── */
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function beginIgnition(){
  show('ignition');
  $('ign-name').textContent = state.name;
  $('ign-actions').style.visibility='hidden';
  const log = $('rite-log'); log.innerHTML='';
  const fwLabel = state.mode==='serial' ? 'static-fw v0 \u2014 pending; nothing was written to your device' : 'static-fw 0.9.2-effigy';
  const lines = [
    ['firmware written', fwLabel],
    ['soul partition inscribed', 'genesis \u00b7 traits \u00b7 ignition order'],
    ['keys born on the shard', 'they never leave it'],
  ];
  for (const [main, note] of lines){
    log.innerHTML += `<div class="did">\u2713 ${main} &nbsp;<span class="note">(${note})</span></div>`;
    if (!reduced) await sleep(650);
  }
  log.innerHTML += `<div class="now">\u25b8 first ignition\u2026</div>`;

  // genesis record + hash
  state.genesis = {
    v:1, name:state.name, class:state.cls.id, stats:state.stats,
    chrome:[...state.chrome], enclave:state.enclave, look:state.look,
    forged:new Date().toISOString().slice(0,10),
    ignition:state.ignitionOrder, mode:state.mode,
  };
  state.hash = await sha256hex(JSON.stringify(state.genesis));
  $('genesis-hash').textContent = '#' + state.hash.slice(0,4).toUpperCase() + '-' + state.hash.slice(4,8).toUpperCase() +
    '-' + state.hash.slice(8,12).toUpperCase() + '-' + state.hash.slice(12,16).toUpperCase();
  try { localStorage.setItem('static.forge.lastGenesis', JSON.stringify({g:state.genesis, hash:state.hash})); } catch(e){}

  if (state.mode==='serial'){
    $('ring-note-big').textContent = 'PUT THE SCREEN DOWN.';
    $('ring-note-body').innerHTML = 'Watch your Shard. When firmware v0 lands, the ring itself will light here.<br>Until then the effigy below shows what it will do.';
  }
  await igniteRing();
  $('ign-actions').style.visibility='visible';
  $('btn-print').focus();
}


/* ring effigy: 24 LEDs light in the derived order, then settle to breathe */
async function igniteRing(){
  const cv = $('ring-stage'), ctx = cv.getContext('2d');
  const N=24, R=92, C=130;
  const lit = new Array(N).fill(0);
  function draw(glow){
    ctx.clearRect(0,0,260,260);
    ctx.fillStyle = '#12151d'; ctx.beginPath(); ctx.arc(C,C,R+22,0,7); ctx.fill();
    ctx.fillStyle = '#0a0c10'; ctx.beginPath(); ctx.arc(C,C,R-22,0,7); ctx.fill();
    for (let i=0;i<N;i++){
      const a = (i/N)*Math.PI*2 - Math.PI/2;
      const x = C+Math.cos(a)*R, y = C+Math.sin(a)*R;
      ctx.globalAlpha = lit[i] ? Math.max(0.15, glow*lit[i]) : 1;
      ctx.fillStyle = lit[i] ? '#5DCAA5' : '#232936';
      ctx.beginPath(); ctx.arc(x,y,8,0,7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  if (reduced){ lit.fill(1); draw(1); return; }
  for (const idx of state.ignitionOrder){
    lit[idx] = 1; draw(1); await sleep(150);
  }
  // settle into the slow green breathe — the last calm you'll get
  const t0 = performance.now();
  return new Promise(res => {
    let stopped = false;
    (function breathe(now){
      const t = (now-t0)/1000;
      draw(0.35 + 0.65*(0.5+0.5*Math.sin(t*0.5*Math.PI)));
      if (t < 4 || !stopped) requestAnimationFrame(breathe);
      if (t >= 3 && !stopped){ stopped = true; res(); }  // release UI; breathe continues
    })(t0);
  });
}

/* ─────────────────── the first card ─────────────────── */
$('btn-print').addEventListener('click', () => { buildCard(); window.print(); });
$('btn-done').addEventListener('click', () => {
  $('ring-note-big').textContent = 'THE RITE IS COMPLETE.';
  $('ring-note-body').textContent = state.mode==='serial'
    ? 'Your Shard will take its soul when firmware v0 arrives. The record you made is saved in this browser.'
    : 'This soul was forged in effigy. When you hold a real Shard, forge it again — properly, aloud.';
});

function glyphCells(hash){
  let bits = '';
  for (let i=0;i<7;i++) bits += parseInt(hash[i],16).toString(2).padStart(4,'0');
  return Array.from({length:25}, (_,i)=>bits[i]==='1');
}
function buildCard(){
  const g = state.genesis, c = state.cls;
  const fw = firewall(), hp = hitpoints();
  const chromeNames = state.chrome.map(id => CONTENT.chrome.find(x=>x.id===id));
  const hashShort = $('genesis-hash').textContent;
  const cells = glyphCells(state.hash);
  const boxes = '\u2610'.repeat(10).split('').join(' ');
  $('print-area').innerHTML = `
  <div class="card">
    <div class="hd">
      <div><div class="nm">${esc(g.name)}</div><div class="cls">${c.name} \u00b7 born ${esc(g.enclave)||'nowhere anyone claims'}</div></div>
      <div class="meta">FORGED ${g.forged}<br>STATE ${hashShort}<br>witnesses: none yet</div>
    </div>
    <div class="stats">
      ${STATS.map(k=>`<div><div class="l">${k}</div><div class="v">${g.stats[k]}</div></div>`).join('')}
    </div>
    <div class="defrow">
      <div>ARMOR <b>${state.chrome.includes('dermal')?1:0}${c.id==='ronin'?'+2 coat':c.id==='cantor'||c.id==='stitch'?'+1':''}</b></div>
      <div>FIREWALL <b>${fw}</b> <span style="color:#5a564c">(2+${g.stats.WIRE}${state.chrome.length?'\u2212'+state.chrome.length+' chrome':''})</span></div>
    </div>
    <div class="sec"><div class="t">MOVES</div>
      ${c.moves.map(m=>`<div class="mv"><b>${m[0]}</b> \u2014 ${m[1]}</div>`).join('')}
    </div>
    <div class="sec"><div class="t">GEAR</div><div>${c.gear.join(' \u00b7 ')}</div></div>
  </div>
  <div class="card">
    <div class="sec" style="border-top:none"><div class="t">STATIC \u2014 permanent. FW \u22121 per 3 marked.</div>
      <div class="track">${boxes}</div>
      <div style="font-size:7.5pt;color:#5a564c">at 3: idle flicker \u00b7 at 6: \u22121 SOUL \u00b7 at 9: the Choir can hear you</div>
    </div>
    <div class="sec"><div class="t">CHROME INSTALLED</div>
      <div>${chromeNames.length ? chromeNames.map(x=>x.name+' \u2014 FW \u22121').join('<br>') : 'none. slow, and unhackable.'}</div>
    </div>
    <div class="sec"><div class="t">RING LEGEND</div>
      <div class="legend">
        <div>green breathe \u2014 fine</div><div>white noise \u2014 ICED</div>
        <div>amber breathe \u2014 hurt</div><div>blue rotate \u2014 deep jack</div>
        <div>red pulse \u2014 critical</div><div>red orbit \u2014 tracked</div>
        <div>near-dark \u2014 DOWN</div><div>purple flicker \u2014 static</div>
      </div>
    </div>
    <div class="sec"><div class="t">IF YOUR SHARD DIES (analog fallback)</div>
      <div>HP ${hp}: ${'\u2610'.repeat(hp)} &nbsp; conditions: ______________</div>
    </div>
    <div class="sec foot">
      <div><div class="t">ADVANCES</div><div style="font-size:8.5pt">XP ${'\u2610'.repeat(8)} \u00b7 next: +1 stat or new move</div>
        <div style="font-size:7.5pt;color:#5a564c;margin-top:2pt">${esc(state.look)||''}</div></div>
      <div class="glyph">${cells.map(on=>`<span class="${on?'on':''}"></span>`).join('')}</div>
    </div>
  </div>`;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
