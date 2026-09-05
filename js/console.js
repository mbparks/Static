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
  save(); broadcast(); render();
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
function flash(kind, kicker, text){ bc.postMessage({ type:'flash', kind, kicker, text }); }
bc.onmessage = e => { if (e.data && e.data.type==='hello') broadcast(); };

function find(id){ return S.pcs.find(c=>c.id===id) || S.foes.find(c=>c.id===id); }
function isPC(c){ return S.pcs.includes(c); }

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
    host.innerHTML = `<button id="c-setup">ROLL INITIATIVE</button>`;
    $('c-setup').addEventListener('click', () => act('initiative called','',() => { S.combat.setup=true; }));
  } else if (S.combat.setup){
    host.innerHTML = `<span class="footnote" style="align-self:center;">enter each roll on the rows, then</span> <button class="primary" id="c-start">START COMBAT</button>`;
    $('c-start').addEventListener('click', () => {
      const all = [...S.pcs.filter(p=>!p.dead), ...S.foes.filter(f=>!f.dead)];
      all.sort((a,b)=>b.init-a.init);
      act('combat — round 1','warn',() => {
        S.combat = {active:true, setup:false, order:all.map(c=>c.id), turn:0};
        S.round = 1; S.mode='combat';
      });
      const first = find(S.combat.order[0]);
      if (first) flash('turn','ROUND 1', first.name);
    });
  } else {
    host.innerHTML = `<button class="primary" id="c-next">NEXT TURN</button>
      <button id="c-sweep">THE SWEEP</button>
      <button id="c-end">END COMBAT</button>`;
    $('c-next').addEventListener('click', () => {
      act(null,'',() => {
        do { S.combat.turn = (S.combat.turn+1) % S.combat.order.length; }
        while (find(S.combat.order[S.combat.turn]).dead);
      });
      const c = find(S.combat.order[S.combat.turn]);
      flash('turn','', c.name);
    });
    $('c-sweep').addEventListener('click', sweep);
    $('c-end').addEventListener('click', () => act('combat ends','',() => { S.combat={active:false,setup:false,order:[],turn:-1}; S.mode='scene'; }));
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
  if (!c){ host.innerHTML = `<div class="footnote" style="text-align:left;">choose a combatant on the left. the machine never wins an argument with the table — every button here is a ruling.</div>`; return; }
  const pc = isPC(c);
  pendingDeath = pendingDeath===c.id ? pendingDeath : null;
  let h = `<div class="resolve-target"><span class="nm">${c.name}</span>
    <div class="st">HP ${c.hp}/${c.maxhp}${pc?` · FW ${c.fw} · Static ${c.static}`:c.fw===null?' · not a node':` · FW ${c.fw}`}${c.fx.length?` · <span class="fx">${c.fx.map(f=>f.name).join(', ')}</span>`:''}</div>
    ${!pc?`<div class="st">${c.move} · wants ${c.want}</div>`:''}</div>`;
  h += `<div class="minibtns">
    <button data-a="dmg1">HIT 1</button><button data-a="dmg2">HIT 2</button><button data-a="dmg3">HIT 3</button>
    <button data-a="heal">HEAL 1d6</button></div>`;
  if (pc) h += `<div class="minibtns">
    <select id="ice-pick">${CONTENT.ice.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</select>
    <button data-a="ice">ICE THEM</button>
    <button data-a="yank" ${c.fx.length?'':'disabled'}>YANK</button>
    <button data-a="static">+1 STATIC</button></div>`;
  h += `<div class="minibtns">
    <select id="zone-pick">${S.zones.map(z=>`<option value="${z.id}" ${z.id===c.zone?'selected':''}>${z.name}</option>`).join('')}</select>
    ${!pc?`<button data-a="reveal">${c.revealed?'HIDE':'REVEAL'}</button>`:''}
    ${pc?`<button data-a="oath">OATH\u2026</button>`:''}
    ${pendingDeath===c.id
      ? `<button class="danger" data-a="confirm-death">CONFIRM THE DEATH RECORD</button>`
      : `<button class="danger" data-a="death">SAY IT ALOUD FIRST</button>`}
  </div>`;
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
  const dot = isPC(c) ? `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${PCCOLORS[i%PCCOLORS.length]};margin-right:5px;"></i>` : '';
  const state = c.dead ? 'the record is sealed'
    : c.down ? `DOWN — ${c.down} ember${c.down===1?'':'s'}`
    : `HP ${c.hp}/${c.maxhp}` + (isPC(c) ? ` · FW ${c.fw} · St ${c.static}` : c.revealed ? ' · revealed' : ' · unrevealed');
  return `<div class="crow ${sel===c.id?'sel':''} ${c.dead?'dead':''} ${acting?'acting':''}" data-sel="${c.id}" tabindex="0">
    <span class="nm">${dot}${c.name}</span>${initInput}
    <div class="st">${state}${c.fx.length?` · <span class="fx">${c.fx.map(f=>f.name.toLowerCase()).join(', ')}</span>`:''} · ${zoneName(c.zone)}</div>
  </div>`;
}
function render(){
  $('party').innerHTML = S.pcs.map((p,i)=>crowHTML(p,i)).join('') || '<div class="footnote" style="text-align:left;">no crew yet.</div>';
  $('opposition').innerHTML = S.foes.map(f=>crowHTML(f,0)).join('') || '<div class="footnote" style="text-align:left;">the ruins are quiet. for now.</div>';
  document.querySelectorAll('[data-sel]').forEach(el => {
    el.addEventListener('click', e => { if (e.target.tagName!=='INPUT'){ sel = el.dataset.sel; render(); } });
    el.addEventListener('keydown', e => { if(e.key==='Enter'){ sel = el.dataset.sel; render(); } });
  });
  document.querySelectorAll('[data-init]').forEach(inp =>
    inp.addEventListener('change', () => { find(inp.dataset.init).init = +inp.value; save(); }));

  $('zones').innerHTML = S.zones.map(z => `
    <div class="zone-row" data-z="${z.id}">
      <input value="${z.name.replace(/"/g,'&quot;')}" data-zn="${z.id}" aria-label="zone name">
      ${CONTENT.tags.map(t => `<span class="tagchip ${z.tags.includes(t.id)?'on':''}" data-tag="${z.id}:${t.id}" title="${t.desc}">${t.id}</span>`).join('')}
    </div>`).join('');
  document.querySelectorAll('[data-zn]').forEach(inp =>
    inp.addEventListener('change', () => act(null,'',() => S.zones.find(z=>z.id===inp.dataset.zn).name = inp.value)));
  document.querySelectorAll('[data-tag]').forEach(ch =>
    ch.addEventListener('click', () => {
      const [zidv, tag] = ch.dataset.tag.split(':');
      act(null,'',() => {
        const z = S.zones.find(z=>z.id===zidv);
        const i = z.tags.indexOf(tag);
        if (i>-1) z.tags.splice(i,1); else z.tags.push(tag);
      });
    }));

  $('heatbar').innerHTML = Array.from({length:7},(_,i)=>{
    const on = i < S.heat;
    const cls = !on ? '' : i>=6?'h3': i>=4?'h2':'h1';
    return `<span class="${cls}"></span>`;
  }).join('');
  $('heat-note').textContent = HEAT_NOTES[S.heat] || '';

  $('clocks').innerHTML = S.clocks.map(c => `
    <div class="clockrow"><span>${c.name} — ${c.fill}/${c.segs}${c.public?'':' · hidden'}</span>
      <button data-tick="${c.id}">TICK</button></div>`).join('') || '<div class="footnote" style="text-align:left;">nothing approaches. yet.</div>';
  document.querySelectorAll('[data-tick]').forEach(b =>
    b.addEventListener('click', () => {
      const c = S.clocks.find(x=>x.id===b.dataset.tick);
      act(c.fill+1>=c.segs ? `the clock fills: ${c.name}` : null, 'warn', () => c.fill = Math.min(c.segs, c.fill+1));
    }));

  $('log').innerHTML = S.log.slice(-40).reverse().map(l => `<div class="${l.kind}">${l.t} ${l.text}</div>`).join('');
  renderResolve();
  renderCombatControls();
}

/* ── top bar ── */
$('scene-name').addEventListener('change', () => act(null,'',() => S.scene = $('scene-name').value));
$('mode-ambient').addEventListener('click', () => act(null,'',() => S.mode='ambient'));
$('mode-scene').addEventListener('click', () => act(null,'',() => S.mode='scene'));
$('open-table').addEventListener('click', () => { window.open('table.html','static-table','width=1024,height=640'); setTimeout(broadcast, 600); });

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
$('add-cls').innerHTML = CONTENT.classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
$('add-foe').innerHTML = CONTENT.enemies.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
$('scene-name').value = S.scene || '';
render(); broadcast();
