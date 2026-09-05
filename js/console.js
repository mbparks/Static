'use strict';
/* THE CONSOLE — one brain. The table view is a dumb renderer fed a
   filtered public slice over BroadcastChannel. Autosaves every event. */

const $ = id => document.getElementById(id);
const bc = new BroadcastChannel('static-table');
const KEY = 'static.console.state';

const PCCOLORS = ['#1D9E75','#378ADD','#EF9F27','#D4537E','#9b6dd6','#5DCAA5'];
let sel = null;           // selected combatant id
let pendingDeath = null;  // id awaiting the second press

let S = load() || fresh();

function fresh(){
  return {
    scene:'', mode:'ambient', heat:0, round:0,
    pcs:[], foes:[], zones:[
      {id:zid(), name:'Zone 1', tags:['POWERED']},
      {id:zid(), name:'Zone 2', tags:[]},
      {id:zid(), name:'Zone 3', tags:['DARK']},
    ],
    clocks:[], log:[],
    combat:{active:false, setup:false, order:[], turn:-1},
    flags:{},   // per-pc "it cost you" tracking
  };
}
function zid(){ return 'z' + Math.random().toString(36).slice(2,8); }
function cid(){ return 'c' + Math.random().toString(36).slice(2,8); }

function load(){ try { return JSON.parse(localStorage.getItem(KEY)); } catch(e){ return null; } }
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); $('save-note').textContent = 'saved ' + new Date().toLocaleTimeString(); }
  catch(e){ $('save-note').textContent = 'save failed — session lives in this window only'; }
}

/* ── the one mutation path: act → log → save → broadcast → render ── */
function act(text, kind, fn){
  if (fn) fn();
  if (text) log(text, kind);
  save(); broadcast(); dockSyncAll(false); render();
}
function log(text, kind){
  S.log.push({ t:new Date().toTimeString().slice(0,5), text, kind:kind||'' });
}

/* ── public slice: only what the whole table may know ── */
function publicSlice(){
  const hpState = c => c.dead ? 'gathered' : c.down ? 'down' : c.hp <= Math.ceil(c.maxhp/3) ? 'critical' : c.hp < c.maxhp ? 'wounded' : 'fine';
  return {
    scene:S.scene, mode:S.mode, heat:S.heat, round:S.round,
    zones:S.zones.map(z => ({id:z.id, name:z.name, tags:z.tags.filter(t => t!=='FOLD')})),
    pcs:S.pcs.map((p,i) => ({ name:p.name, cls:p.cls.toUpperCase(), zone:p.zone,
      state:hpState(p), fx:p.fx.map(f=>f.name), static:p.static>=3, down:p.down||0,
      color:PCCOLORS[i%PCCOLORS.length] })),
    foes:S.foes.filter(f => f.revealed && !f.dead).map(f => ({zone:f.zone})),
    rail:S.combat.active ? S.combat.order.map(id => { const c=find(id); return {name:c?c.name:'?', now:id===S.combat.order[S.combat.turn], dead:c?c.dead:false}; }) : [],
    clocks:S.clocks.filter(c => c.public),
  };
}
function broadcast(){ bc.postMessage({ type:'state', pub:publicSlice() }); }

// ---- live play link to a physical dock (WIP) -------------------------
let dockOn = false;
let dockRoster = [];
const dockLast = {};   // per-name: last frame we sent, to send edges only

async function dockConnect(){
  if (!StaticDock.supported()){ log('this browser has no Web Serial','warn'); render(); return; }
  try {
    await StaticDock.connect({
      onRoster: names => { dockRoster = names; render(); },
      onInput: (name, msg) => {
        // a Shard's pad: forward its intent into the session
        const pc = S.pcs.find(p => p.name === name);
        if (!pc) return;
        if (msg === 'YANK'){
          act(`${pc.name} yanks (from the Shard) — purged, +1 static`, 'pur', () => {
            pc.fx=[]; pc.static=Math.min(10,pc.static+1); S.flags[pc.id]=true;
          });
        } else if (msg === 'TAP'){
          log(`${pc.name} taps in`, '');
          save(); render();
        }
      },
      onLog: t => { /* dock chatter; ignore in UI */ }
    });
    dockOn = true;
    log('dock connected — rings are live', 'good');
    dockSyncAll(true);
    render();
  } catch(e){ log('no dock connected','warn'); render(); }
}
async function dockDisconnect(){ await StaticDock.disconnect(); dockOn=false; dockRoster=[]; render(); }

// map a PC to its ring frames and send only what changed
function pcStateFrame(p){
  return `STATE|${p.hp}|${p.maxhp}|${p.static}|${p.down||0}`;
}
function pcFxFrame(p){
  const f = p.fx.length ? p.fx[0].name.toUpperCase().split(' ')[0] : 'CLEAR';
  // normalize to the firmware's FX vocabulary
  const map = { SCRAMBLER:'ICE', TRACKER:'TRACK', THE:'HUSH', PUPPET:'ICE' };
  return 'FX|' + (map[f] || (f==='CLEAR'?'CLEAR':'ICE'));
}
async function dockSyncAll(force){
  if (!dockOn) return;
  const acting = S.combat.active ? find(S.combat.order[S.combat.turn]) : null;
  for (const p of S.pcs){
    const key = p.name;
    const st = pcStateFrame(p), fx = pcFxFrame(p);
    const prev = dockLast[key] || {};
    try {
      if (force || prev.st !== st) { await StaticDock.to(p.name, st); prev.st = st; }
      if (force || prev.fx !== fx) { await StaticDock.to(p.name, fx); prev.fx = fx; }
      if (p.dead && !prev.locked){ await StaticDock.to(p.name, 'LOCK'); prev.locked = true; }
      if (acting && acting.id === p.id && prev.turn !== S.combat.turn){
        await StaticDock.to(p.name, 'TURN'); prev.turn = S.combat.turn;
      }
      dockLast[key] = prev;
    } catch(e){ /* link hiccup; next act() retries */ }
  }
}
function flash(kind, kicker, text){ bc.postMessage({ type:'flash', kind, kicker, text }); }
bc.onmessage = e => { if (e.data && e.data.type==='hello') broadcast(); };

function find(id){ return S.pcs.find(c=>c.id===id) || S.foes.find(c=>c.id===id); }
function isPC(c){ return S.pcs.includes(c); }

/* ── console UI mode (what the GM is doing), separate from the projector mode ── */
let uiMode = 'setup';
function setUiMode(m){ uiMode = m; document.body.dataset.uimode = m; render(); }

/* ── the crew as living rings ── */
function hpState(c){
  return c.dead ? 'dead' : c.down ? 'down' : c.hp <= Math.ceil(c.maxhp/3) ? 'critical' : c.hp < c.maxhp ? 'wounded' : 'fine';
}
function ringSVG(c, size){
  const N = 24, R = 13, cx = 17, cy = 17;
  const st = hpState(c);
  const iced = c.fx && c.fx.length && !c.down && !c.dead;
  const base = st==='fine' ? '#5dcaa5' : st==='wounded' ? '#f0a02a' : st==='critical' ? '#e8402a' : '#232838';
  let dots = '';
  for (let i=0;i<N;i++){
    const a = (i/N)*Math.PI*2 - Math.PI/2;
    const x = cx + Math.cos(a)*R, y = cy + Math.sin(a)*R;
    let fill = base, op = 1;
    if (st==='dead'){ fill='#1a1d26'; }
    else if (st==='down'){ fill = (i % 8 === 0 && i/8 < (c.down||0)) ? '#a02218' : '#1a1d26'; }
    else if (iced){ fill = '#e8f0ff'; op = (i*7)%5 ? 1 : .2; }
    else if (c.static > 0 && ((i*11) % 30) < c.static){ fill='#9b6dd6'; }
    dots += `<circle class="led" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${fill}" opacity="${op}"/>`;
  }
  const cls = 'ring ' + (iced ? 'ice' : (st==='fine'||st==='wounded'||st==='critical') ? 'breathe '+st : st);
  return `<svg class="${cls}" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="#0b0d12" stroke="#1b2030"/>${dots}</svg>`;
}

function renderZoneMap(){
  const host = $('zonemap'); if (!host) return;
  host.innerHTML = S.zones.map(z => {
    const pcs = S.pcs.filter(p => p.zone===z.id && !p.dead);
    const foes = S.foes.filter(f => f.zone===z.id && !f.dead);
    return `<div class="zm">
      <div class="zn">${z.name}</div>
      ${z.tags.length ? `<div class="zt">${z.tags.join(' \u2022 ')}</div>` : ''}
      <div class="occ">
        ${pcs.map((p,i)=>`<span class="dot ${sel===p.id?'sel':''} ${p.down?'down':''}" data-sel="${p.id}" title="${p.name}" style="background:${PCCOLORS[S.pcs.indexOf(p)%PCCOLORS.length]}"></span>`).join('')}
        ${foes.map(f=>`<span class="foe ${f.revealed?'revealed':''} ${sel===f.id?'sel':''}" data-sel="${f.id}" title="${f.name}${f.revealed?'':' (unrevealed)'}"></span>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderHero(){
  const host = $('combat-hero'); if (!host) return;
  if (!S.combat.active){
    host.className = 'hero only-combat idle';
    host.innerHTML = `<div><div class="round">Combat</div><div class="who">${S.combat.setup ? 'Enter each initiative on the crew, then start.' : 'No fight yet. Roll initiative when it starts.'}</div></div>`;
    return;
  }
  const c = find(S.combat.order[S.combat.turn]);
  host.className = 'hero only-combat';
  host.innerHTML = `<div><div class="round">Round ${S.round}</div><div class="who">${c ? c.name : '\u2014'}<small>acts</small></div></div>
    <div class="round">heat ${S.heat}</div>`;
}

/* ── party & opposition ── */
function addPC(name, clsId){
  const cls = CONTENT.classes.find(c=>c.id===clsId);
  const stats = cls.array;
  S.pcs.push({ id:cid(), name:name.toUpperCase(), cls:cls.name, hp:8+2*stats.MEAT, maxhp:8+2*stats.MEAT,
    fw:2+stats.WIRE, static:0, fx:[], zone:S.zones[0].id, down:0, dead:false, init:0 });
}
$('add-pc').addEventListener('click', () => {
  const n = $('add-name').value.trim(); if (!n) return;
  act(`${n.toUpperCase()} joins the crew`, 'good', () => addPC(n, $('add-cls').value));
  $('add-name').value='';
});
$('add-effigy').addEventListener('click', () => {
  let g=null; try { g = JSON.parse(localStorage.getItem('static.forge.lastGenesis')).g; } catch(e){}
  if (!g){ act('no effigy in this browser — the Forge is that way', 'warn'); return; }
  act(`${g.name} jacks in — forged ${g.forged}`, 'good', () => {
    S.pcs.push({ id:cid(), name:g.name, cls:CONTENT.classes.find(c=>c.id===g.class).name,
      hp:8+2*g.stats.MEAT, maxhp:8+2*g.stats.MEAT, fw:2+g.stats.WIRE-g.chrome.length,
      static:0, fx:[], zone:S.zones[0].id, down:0, dead:false, init:0 });
  });
});
$('add-enemy').addEventListener('click', () => {
  const e = CONTENT.enemies.find(x=>x.id===$('add-foe').value);
  act(null, '', () => {
    S.foes.push({ id:cid(), name:e.name, hp:e.hp, maxhp:e.hp, armor:e.armor, fw:e.fw,
      dmg:e.dmg, move:e.move, want:e.want, fx:[], zone:S.zones[0].id,
      revealed:false, dead:false, init:0 });
  });
});

/* ── zones ── */
$('add-zone').addEventListener('click', () =>
  act(null,'',() => S.zones.push({id:zid(), name:'Zone '+(S.zones.length+1), tags:[]})));

/* ── heat ── */
const HEAT_NOTES = {3:'noticed — pick a consequence', 5:'traced — pick a consequence', 7:'counterstrike — spend it like you mean it'};
$('heat-up').addEventListener('click', () => {
  const was = S.heat;
  act(null,'',() => S.heat = Math.min(7, S.heat+1));
  if (S.heat !== was && HEAT_NOTES[S.heat]){
    act(`heat ${S.heat} — ${HEAT_NOTES[S.heat].split(' — ')[0]}`, 'warn');
    flash('heat', 'SYSTEM HEAT ' + S.heat, S.heat>=7 ? 'IT ANSWERS' : S.heat>=5 ? 'TRACED' : 'IT KNOWS SOMEONE IS HERE');
  }
});
$('heat-dn').addEventListener('click', () => act(null,'',() => S.heat = Math.max(0, S.heat-1)));

/* ── clocks ── */
$('add-clock').addEventListener('click', () => {
  const n = $('clock-name').value.trim(); if (!n) return;
  act(null,'',() => S.clocks.push({ id:cid(), name:n, segs:+$('clock-segs').value, fill:0, public:$('clock-pub').checked }));
  $('clock-name').value='';
});

/* ── combat loop ── */
function renderCombatControls(){
  const host = $('combat-controls'); host.innerHTML='';
  if (!S.combat.active && !S.combat.setup){
    host.innerHTML = `<button id="c-setup" class="big primary">Roll initiative</button>`;
    $('c-setup').addEventListener('click', () => act('initiative called','',() => { S.combat.setup=true; }));
  } else if (S.combat.setup){
    host.innerHTML = `<button class="big primary" id="c-start">Start combat</button><div class="note">Enter each roll on the crew and opposition rows first.</div>`;
    $('c-start').addEventListener('click', () => {
      const all = [...S.pcs.filter(p=>!p.dead), ...S.foes.filter(f=>!f.dead)];
      all.sort((a,b)=>b.init-a.init);
      act('combat \u2014 round 1','warn',() => { S.combat = {active:true, setup:false, order:all.map(c=>c.id), turn:0}; S.round = 1; S.mode='combat'; });
      const first = find(S.combat.order[0]);
      if (first) flash('turn','ROUND 1', first.name);
      setUiMode('combat');
    });
  } else {
    host.innerHTML = `<button class="big primary" id="c-next">Next turn</button>
      <button class="big" id="c-sweep">The sweep</button>
      <button class="big quiet" id="c-end">End combat</button>`;
    $('c-next').addEventListener('click', () => {
      act(null,'',() => { do { S.combat.turn = (S.combat.turn+1) % S.combat.order.length; } while (find(S.combat.order[S.combat.turn]).dead); });
      const c = find(S.combat.order[S.combat.turn]); flash('turn','', c.name);
    });
    $('c-sweep').addEventListener('click', sweep);
    $('c-end').addEventListener('click', () => { act('combat ends','',() => { S.combat={active:false,setup:false,order:[],turn:-1}; S.mode='scene'; }); setUiMode('scene'); });
  }
}
function sweep(){
  act(`the sweep — round ${S.round} ends`, '', () => {
    for (const p of S.pcs){
      if (p.down > 0 && !p.dead){
        p.down -= 1;
        log(`${p.name}'s embers: ${p.down} remain${p.down===1?'s':''}`, p.down<=1?'bad':'warn');
        if (p.down === 0) log(`${p.name} — the last ember. confirm, or reach them.`, 'bad');
      }
    }
    S.round += 1;
    S.combat.turn = 0;
    while (find(S.combat.order[S.combat.turn]).dead) S.combat.turn = (S.combat.turn+1)%S.combat.order.length;
  });
  const first = find(S.combat.order[S.combat.turn]);
  if (first) flash('turn','ROUND '+S.round, first.name);
}

/* ── resolve panel ── */
function renderResolve(){
  const host = $('resolve');
  const c = sel ? find(sel) : null;
  if (!c){ host.innerHTML = `<div class="resolve-empty">Choose someone on the table to resolve against them. Every button here is a ruling \u2014 the machine never wins an argument with the table.</div>`; return; }
  const pc = isPC(c);
  pendingDeath = pendingDeath===c.id ? pendingDeath : null;
  let h = `<div class="resolve-target">${ringSVG(c)}<div>
      <div class="nm">${c.name}</div>
      <div class="st">HP ${c.hp}/${c.maxhp}${pc?` \u00b7 firewall ${c.fw} \u00b7 static ${c.static}`:c.fw===null?' \u00b7 not a node':` \u00b7 firewall ${c.fw}`}${c.fx.length?` \u00b7 <span class="fx">${c.fx.map(f=>f.name.toLowerCase()).join(', ')}</span>`:''}</div>
      ${!pc?`<div class="want">${c.move} \u2014 wants ${c.want}</div>`:''}
    </div></div>
    <div class="actions">
      <div class="group"><span class="lbl">Hit</span><span class="seg"><button data-a="dmg1">1</button><button data-a="dmg2">2</button><button data-a="dmg3">3</button></span><button data-a="heal">Heal 1d6</button></div>`;
  if (pc) h += `<div class="group"><span class="lbl">Mesh</span>
      <select id="ice-pick">${CONTENT.ice.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</select>
      <button data-a="ice">Ice them</button>
      <button data-a="yank" ${c.fx.length?'':'disabled'}>Yank</button>
      <button data-a="static">+1 static</button></div>`;
  h += `<div class="group"><span class="lbl">Place</span>
      <select id="zone-pick">${S.zones.map(z=>`<option value="${z.id}" ${z.id===c.zone?'selected':''}>${z.name}</option>`).join('')}</select>
      ${!pc?`<button data-a="reveal">${c.revealed?'Hide':'Reveal'}</button>`:''}
      ${pc?`<button class="oath" data-a="oath">Swear an oath\u2026</button>`:''}</div>
    <div class="group"><span class="lbl">Death</span>
      ${pendingDeath===c.id
        ? `<button class="danger armed" data-a="confirm-death">Confirm the death record</button>`
        : `<button class="danger" data-a="death">Say it aloud first</button>`}
    </div></div>`;
  host.innerHTML = h;
  host.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => resolveAction(b.dataset.a, c)));
  const zp = host.querySelector('#zone-pick');
  zp.addEventListener('change', () => act(null,'',() => c.zone = zp.value));
}

function resolveAction(a, c){
  const pc = isPC(c);
  if (a.startsWith('dmg')){
    const n = +a[3];
    const taken = pc ? n : Math.max(1, n - (c.armor||0));
    act(null,'',() => {
      c.hp = Math.max(0, c.hp - taken);
      if (c.hp === 0 && pc && !c.down){ c.down = 3; log(`${c.name} goes down — three embers`, 'bad'); flash('down','', c.name + ' IS DOWN'); }
      else if (c.hp === 0 && !pc){ c.dead = true; log(`${c.name} — dropped`, ''); }
      else log(`${c.name} takes ${taken}`, '');
    });
  }
  if (a==='heal'){
    const r = 1 + Math.floor(Math.random()*6);
    act(`${c.name} — ${r} restored${c.down?'; back from it':''}`, 'good', () => {
      c.hp = Math.min(c.maxhp, c.hp + r);
      if (c.down){ c.down = 0; }
    });
  }
  if (a==='ice'){
    const ice = CONTENT.ice.find(i => i.id === document.getElementById('ice-pick').value);
    act(`ice \u2192 ${c.name}: ${ice.name.toLowerCase()} — clear: ${ice.clear}`, 'bad', () => {
      if (!c.fx.find(f=>f.id===ice.id)) c.fx.push({id:ice.id, name:ice.name});
      S.flags[c.id] = true;
    });
    flash('ice','ICE', c.name + ' — ' + ice.effect.toUpperCase());
  }
  if (a==='yank'){
    act(`${c.name} yanks — purged, +1 static`, 'pur', () => { c.fx=[]; c.static=Math.min(10,c.static+1); S.flags[c.id]=true; });
  }
  if (a==='static'){
    act(`${c.name} — static ${c.static+1}`, 'pur', () => {
      c.static = Math.min(10, c.static+1); S.flags[c.id]=true;
      if (c.static % 3 === 0) c.fw = Math.max(0, c.fw - 1);
      if (c.static === 9) log(`${c.name} — the Choir can hear them now`, 'bad');
    });
  }
  if (a==='reveal'){
    act(c.revealed?null:`${c.name} — revealed in ${zoneName(c.zone)}`, 'warn', () => c.revealed = !c.revealed);
  }
  if (a==='oath'){
    const t = prompt('the oath, as the record will keep it:');
    if (t){ act(`oath: ${t}`, 'good'); flash('oath','OATH', t.toUpperCase()); }
  }
  if (a==='death'){ pendingDeath = c.id; render(); }
  if (a==='confirm-death'){
    pendingDeath = null;
    act(`${c.name} — the death record is written. witnesses don't forget.`, 'bad', () => { c.dead = true; c.down = 0; });
    flash('death','THE RECORD SEALS', c.name);
  }
}
function zoneName(id){ const z = S.zones.find(z=>z.id===id); return z ? z.name : '?'; }

/* ── render ── */
function crowHTML(c, i){
  const acting = S.combat.active && S.combat.order[S.combat.turn]===c.id;
  const initInput = S.combat.setup && !c.dead ? `<input class="init" data-init="${c.id}" type="number" value="${c.init||''}" placeholder="init" aria-label="initiative for ${c.name}">` : '';
  const state = c.dead ? 'the record is sealed'
    : c.down ? `down \u2014 ${c.down} ember${c.down===1?'':'s'}`
    : `HP ${c.hp}/${c.maxhp}` + (isPC(c) ? ` \u00b7 FW ${c.fw} \u00b7 static ${c.static}` : c.revealed ? ' \u00b7 revealed' : ' \u00b7 unrevealed');
  const fx = c.fx.length ? ` <span class="fx">${c.fx.map(f=>f.name.toLowerCase()).join(', ')}</span>` : '';
  return `<div class="crow ${sel===c.id?'sel':''} ${c.dead?'dead':''} ${acting?'acting':''}" data-sel="${c.id}" tabindex="0">
    ${ringSVG(c)}
    <div><div class="nm">${c.name}</div><div class="st">${state}${fx}</div></div>
    <div><div class="zone">${zoneName(c.zone)}</div>${initInput}</div>
  </div>`;
}
function render(){
  $('party').innerHTML = S.pcs.map((p,i)=>crowHTML(p,i)).join('') || '<div class="crew-empty">No crew yet. Add a character below.</div>';
  $('opposition').innerHTML = S.foes.map(f=>crowHTML(f,0)).join('') || '<div class="crew-empty">The ruins are quiet. For now.</div>';
  renderZoneMap(); renderHero();
  document.querySelectorAll('[data-sel]').forEach(el => {
    el.addEventListener('click', e => { if (e.target.tagName!=='INPUT'){ sel = el.dataset.sel; render(); } });
    el.addEventListener('keydown', e => { if(e.key==='Enter'){ sel = el.dataset.sel; render(); } });
  });
  document.querySelectorAll('[data-init]').forEach(inp =>
    inp.addEventListener('change', () => { find(inp.dataset.init).init = +inp.value; save(); }));

  $('zones').innerHTML = S.zones.map(z => `
    <div class="zone-row" data-z="${z.id}">
      <input value="${z.name.replace(/"/g,'&quot;')}" data-zn="${z.id}" aria-label="zone name">
      <div class="tags">${CONTENT.tags.map(t => `<span class="tagchip ${z.tags.includes(t.id)?'on':''}" data-tag="${z.id}:${t.id}" title="${t.desc}">${t.id}</span>`).join('')}</div>
    </div>`).join('');
  document.querySelectorAll('[data-zn]').forEach(inp =>
    inp.addEventListener('change', () => act(null,'',() => S.zones.find(z=>z.id===inp.dataset.zn).name = inp.value)));
  document.querySelectorAll('[data-tag]').forEach(ch =>
    ch.addEventListener('click', () => {
      const [zidv, tag] = ch.dataset.tag.split(':');
      act(null,'',() => { const z = S.zones.find(z=>z.id===zidv); const i = z.tags.indexOf(tag); if (i>-1) z.tags.splice(i,1); else z.tags.push(tag); });
    }));

  $('heatbar').innerHTML = Array.from({length:7},(_,i)=>{
    const on = i < S.heat; const cls = !on ? '' : i>=6?'h3': i>=4?'h2':'h1';
    return `<span class="${cls}"></span>`;
  }).join('');
  $('heat-note').textContent = HEAT_NOTES[S.heat] || '';

  $('clocks').innerHTML = S.clocks.map(c => clockRow(c)).join('') || '<div class="clocks-empty">Nothing approaches. Yet.</div>';
  document.querySelectorAll('[data-tick]').forEach(b =>
    b.addEventListener('click', () => {
      const c = S.clocks.find(x=>x.id===b.dataset.tick);
      act(c.fill+1>=c.segs ? `the clock fills: ${c.name}` : null, 'warn', () => c.fill = Math.min(c.segs, c.fill+1));
    }));

  $('log').innerHTML = S.log.slice(-60).reverse().map(l => `<div class="${l.kind}"><span class="t">${l.t}</span>${l.text}</div>`).join('')
    || '<div class="crew-empty">The record is blank. The night is young.</div>';
  renderResolve();
  renderCombatControls();

  // tabs + status pills
  const tabs = {setup:'mode-setup', scene:'mode-scene', combat:'mode-combat'};
  for (const [m,id] of Object.entries(tabs)){ const b=$(id); if(b){ b.classList.toggle('on', uiMode===m); b.classList.toggle('live', m==='combat' && S.combat.active); } }
  const db = $('connect-dock');
  if (db){ db.textContent = dockOn ? ('Dock: ' + (dockRoster.length ? dockRoster.length + ' live' : 'no shards')) : 'Connect dock'; db.classList.toggle('live', dockOn); }
  if (typeof renderCampaignInfo === 'function') renderCampaignInfo();
}

function clockRow(c){
  const r=13, cx=17, cy=17; let segs='';
  for (let i=0;i<c.segs;i++){
    const a0=(i/c.segs)*2*Math.PI-Math.PI/2, a1=((i+1)/c.segs)*2*Math.PI-Math.PI/2, large=(a1-a0)>Math.PI?1:0;
    segs += `<path d="M${cx} ${cy} L${(cx+r*Math.cos(a0)).toFixed(1)} ${(cy+r*Math.sin(a0)).toFixed(1)} A${r} ${r} 0 ${large} 1 ${(cx+r*Math.cos(a1)).toFixed(1)} ${(cy+r*Math.sin(a1)).toFixed(1)} Z" fill="${i<c.fill?'#d85a30':'#1b2030'}" stroke="#11141b" stroke-width="1"/>`;
  }
  return `<div class="clockrow"><svg viewBox="0 0 34 34">${segs}</svg><span class="cname">${c.name} <span class="hid">${c.fill}/${c.segs}${c.public?'':' \u00b7 hidden'}</span></span><button class="tiny" data-tick="${c.id}">tick</button></div>`;
}

/* ── top bar ── */
$('scene-name').addEventListener('change', () => act(null,'',() => S.scene = $('scene-name').value));
$('mode-setup').addEventListener('click', () => setUiMode('setup'));
$('mode-scene').addEventListener('click', () => { act(null,'',() => S.mode='scene'); setUiMode('scene'); });
$('mode-combat').addEventListener('click', () => setUiMode('combat'));
$('mode-ambient').addEventListener('click', () => act(null,'',() => S.mode='ambient'));
$('open-table').addEventListener('click', () => { window.open('table.html','static-table','width=1024,height=640'); setTimeout(broadcast, 600); });
$('connect-dock').addEventListener('click', () => { dockOn ? dockDisconnect() : dockConnect(); });

$('btn-says').addEventListener('click', () => {
  const t = $('gm-says').value.trim(); if (!t) return;
  act(`ruling: ${t}`, 'warn'); $('gm-says').value='';
});

/* ── jack out: XP tally + credits ── */
$('end-session').addEventListener('click', () => {
  const job = $('job-settled').checked;
  act('jack-out — the record closes over the night like water', '', () => {
    for (const p of S.pcs){
      if (p.dead) continue;
      let xp = 1; const why = ['survived'];
      if (job){ xp++; why.push('the job settled'); }
      if (S.flags[p.id]){ xp++; why.push('it cost them'); }
      log(`${p.name} — ${xp} XP (${why.join(', ')})`, 'good');
    }
  });
  bc.postMessage({ type:'credits', log:S.log.map(l=>l.text) });
});
$('wipe').addEventListener('click', () => {
  if (!confirm('clear the console and start a new session? the record in this browser will be erased.')) return;
  S = fresh(); sel=null; save(); broadcast(); render();
});

/* ── boot ── */
StaticCampaign.boot();   // load any saved campaign pack over the built-in content
$('add-cls').innerHTML = CONTENT.classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
$('add-foe').innerHTML = CONTENT.enemies.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
$('scene-name').value = S.scene || '';
uiMode = S.combat.active ? 'combat' : (S.pcs.length ? 'scene' : 'setup');
document.body.dataset.uimode = uiMode;
render(); broadcast();


// ---- campaign packs (chapter-0 authoring) ----------------------------
function renderCampaignInfo(){
  const el = document.getElementById('campaign-info'); if (!el) return;
  const c = StaticCampaign.counts();
  el.innerHTML = '<b style="color:var(--text-secondary)">' + StaticCampaign.name() + '</b><br>' +
    c.classes + ' classes · ' + c.chrome + ' chrome · ' + c.tags + ' tags · ' +
    c.ice + ' ice · ' + c.enemies + ' enemies';
}
(function wireCampaign(){
  const ex = document.getElementById('camp-export');
  const im = document.getElementById('camp-import');
  const rs = document.getElementById('camp-reset');
  const fi = document.getElementById('camp-file');
  if (!ex) return;
  ex.addEventListener('click', () => {
    const name = prompt('Name this campaign pack:', StaticCampaign.name());
    if (name === null) return;
    const author = prompt('Author (optional):', '') || '';
    StaticCampaign.exportFile(name, author);
  });
  im.addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => {
    const f = fi.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const res = StaticCampaign.importPack(r.result);
      if (!res.ok){ log('campaign import failed: ' + res.error, 'warn'); render(); return; }
      log('loaded campaign: ' + (res.name || 'unnamed'), 'good');
      // refresh the dropdowns that read CONTENT
      $('add-cls').innerHTML = CONTENT.classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      $('add-foe').innerHTML = CONTENT.enemies.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
      renderCampaignInfo(); render();
    };
    r.readAsText(f);
    fi.value = '';
  });
  rs.addEventListener('click', () => {
    if (!confirm('Reset to the built-in Six Houses? Your loaded pack stays in its file.')) return;
    StaticCampaign.reset();
    $('add-cls').innerHTML = CONTENT.classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    $('add-foe').innerHTML = CONTENT.enemies.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
    log('campaign reset to built-in', '');
    renderCampaignInfo(); render();
  });
  renderCampaignInfo();
})();
