'use strict';
/* THE TABLE VIEW — a dumb renderer. It holds no truth, makes no
   decisions, and only ever sees the filtered public slice. */
const bc = new BroadcastChannel('static-table');
const stage = document.getElementById('stage');
let pub = null;
let flashTimer = null;

bc.onmessage = e => {
  const m = e.data;
  if (m.type === 'state'){ pub = m.pub; render(); }
  if (m.type === 'flash'){ showFlash(m); }
  if (m.type === 'credits'){ credits(m.log); }
};
bc.postMessage({ type:'hello' });   // ask the console for the current slice

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function render(){
  if (!pub){ ambient(); return; }
  if (pub.mode === 'ambient') return ambient();
  if (pub.mode === 'combat') return combat();
  return scene();
}

function ambient(){
  stage.innerHTML = `
    <div style="flex:1"></div>
    <div class="tv-kicker">A TABLETOP GAME OF</div>
    <div class="tv-title">STATIC</div>
    <div class="tv-sub">${pub && pub.scene ? esc(pub.scene) : 'the last witnesses are dying'}</div>
    <div class="tv-noise">${noiseLine()}<br>${noiseLine()}</div>
    <div style="flex:1.4"></div>`;
}
function noiseLine(){
  const c = '\u2591\u2592\u2593\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7';
  let s=''; for (let i=0;i<48;i++) s += c[Math.floor(Math.random()*c.length)];
  return s;
}

function partyStrip(){
  return `<div class="tv-strip">` + pub.pcs.map(p => `
    <div class="tv-card">
      <div class="n"><span style="display:inline-block;width:1.4vh;height:1.4vh;border-radius:50%;background:${p.state==='down'||p.state==='gathered'?'#3a1512':p.color};margin-right:.6vh;"></span>${esc(p.name)} <span style="color:#5a6478">(${p.cls.toLowerCase()})</span></div>
      <div class="s">${stateLine(p)}</div>
    </div>`).join('') + `</div>`;
}
function stateLine(p){
  if (p.state==='gathered') return 'the record is sealed';
  if (p.state==='down') return `\u26a0 DOWN — ${p.down} ember${p.down===1?'':'s'}`;
  let s = p.state;
  if (p.fx.length) s += ' · \u26a0 ' + p.fx.map(f=>f.toLowerCase()).join(', ');
  if (p.static) s += ' · static shows';
  return s;
}

function clocksHTML(){
  if (!pub.clocks.length) return '';
  return `<div class="tv-clocks">` + pub.clocks.map(c => {
    const r=5.5, cx=7, cy=7;
    let segs='';
    for (let i=0;i<c.segs;i++){
      const a0=(i/c.segs)*2*Math.PI-Math.PI/2, a1=((i+1)/c.segs)*2*Math.PI-Math.PI/2;
      const large = (a1-a0)>Math.PI?1:0;
      segs += `<path d="M${cx} ${cy} L${cx+r*Math.cos(a0)} ${cy+r*Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)} Z"
        fill="${i<c.fill?'#D85A30':'#1a1f28'}" stroke="#0d1016" stroke-width="0.4"/>`;
    }
    return `<div class="tv-clock"><svg viewBox="0 0 14 14" style="width:9vh;height:9vh;">${segs}</svg><div>${esc(c.name)}</div></div>`;
  }).join('') + `</div>`;
}

function scene(){
  stage.innerHTML = `
    <div class="tv-head"><span>${esc(pub.scene)||'\u2014'}</span><span></span></div>
    <div style="flex:1"></div>
    ${clocksHTML()}
    ${partyStrip()}`;
}

function combat(){
  const cols = pub.zones.length<=3 ? pub.zones.length : Math.ceil(pub.zones.length/2);
  const zones = pub.zones.map(z => {
    const here = pub.pcs.filter(p=>p.zone===z.id && p.state!=='gathered');
    const foes = pub.foes.filter(f=>f.zone===z.id);
    return `<div class="tv-zone">
      <div class="zn">${esc(z.name).toUpperCase()}</div>
      ${z.tags.length?`<div class="zt">\u25c8 ${z.tags.join(' · ')}</div>`:''}
      <div class="occ">
        ${here.map(p=>`<span class="pcdot ${p.state==='down'?'down':''}"><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}
        ${foes.map(()=>`<span class="foesq"></span>`).join('')}
      </div>
    </div>`;
  }).join('');
  const heat = Array.from({length:7},(_,i)=>{
    const on=i<pub.heat, cls=!on?'':i>=6?'h3':i>=4?'h2':'h1';
    return `<span class="${cls}"></span>`;
  }).join('');
  const heatWord = pub.heat>=7?'IT ANSWERS':pub.heat>=5?'TRACED':pub.heat>=3?'NOTICED':'';
  stage.innerHTML = `
    <div class="tv-head"><span>${esc(pub.scene)||'\u2014'}</span><span>ROUND ${pub.round}</span></div>
    <div class="tv-zones" style="grid-template-columns:repeat(${cols},1fr);">${zones}</div>
    <div class="tv-bottom">
      <div class="tv-heat">
        <div class="hl"><span>SYSTEM HEAT</span><span>${pub.heat} / 7 ${heatWord?'\u2014 '+heatWord:''}</span></div>
        <div class="tv-heatbar">${heat}</div>
      </div>
      <div class="tv-rail">${pub.rail.map(r=>`<div class="${r.now?'now':''}">${r.now?'\u25b8 ':''}${r.dead?'\u2020 ':''}${esc(r.name)}</div>`).join('')}</div>
    </div>
    ${partyStrip()}`;
}

function showFlash(m){
  const f = document.getElementById('flash');
  document.getElementById('fx-k').textContent = m.kicker || '';
  document.getElementById('fx-t').textContent = m.text || '';
  f.className = 'tv-flash ' + (m.kind||'');
  f.style.display = 'flex';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.style.display='none'; }, m.kind==='death' ? 5000 : m.kind==='turn' ? 1400 : 2600);
}

function credits(log){
  stage.innerHTML = `
    <div class="tv-kicker" style="margin-bottom:2vh;">THE RECORD CLOSES OVER THE NIGHT LIKE WATER</div>
    <div class="tv-credits"><div class="roll">${log.map(esc).join('<br>')}</div></div>`;
}

ambient();
