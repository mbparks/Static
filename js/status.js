'use strict';
const $ = id => document.getElementById(id);

$('btn-serial').addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    $('st-msg').textContent = 'This browser has no Web Serial. Chrome or Edge on desktop can reach a Shard.';
    return;
  }
  try {
    await navigator.serial.requestPort();
    $('st-msg').textContent = 'Shard heard, but the identity handshake arrives with firmware v0. Until then, only effigies can be read.';
  } catch(e) {
    $('st-msg').textContent = 'No Shard chosen. The record waits.';
  }
});

$('btn-local').addEventListener('click', () => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('static.forge.lastGenesis')); } catch(e){}
  if (!saved || !saved.g) {
    $('st-msg').innerHTML = 'No soul in this browser. The <a href="forge.html">Forge</a> is that way.';
    $('st-view').style.display = 'none';
    return;
  }
  render(saved.g, saved.hash);
});

function render(g, hash){
  const cls = CONTENT.classes.find(c => c.id === g.class);
  const fw = 2 + g.stats.WIRE - g.chrome.length;
  const hp = 8 + 2 * g.stats.MEAT;
  const chromeNames = g.chrome.map(id => CONTENT.chrome.find(x => x.id === id).name);
  const seal = '#' + hash.slice(0,4).toUpperCase() + '-' + hash.slice(4,8).toUpperCase();
  $('st-msg').textContent = '';
  $('st-view').style.display = 'block';
  $('st-view').innerHTML = `
    <div class="st-head">
      <div>
        <div class="st-name">${esc(g.name)}</div>
        <div class="st-sub">${cls.name} \u00b7 born ${esc(g.enclave) || 'nowhere anyone claims'} \u00b7 forged ${g.forged}</div>
      </div>
      <div style="text-align:right;">
        <div class="chip">ALIVE \u00b7 GENESIS ONLY</div>
        <div class="st-sub" style="margin-top:4px;">0 sessions \u00b7 0 tables</div>
      </div>
    </div>
    <div class="vitals">
      <div class="vital"><div class="t">CONDITION</div><div class="v" style="color:var(--grn)">unmarked \u00b7 HP ${hp}/${hp}</div></div>
      <div class="vital"><div class="t">FIREWALL</div><div class="v">${fw} <span style="color:var(--crl); font-size:11px;">(2+${g.stats.WIRE}${g.chrome.length ? ' \u2212 '+g.chrome.length+' chrome' : ''})</span></div></div>
      <div class="vital"><div class="t">STATIC</div><div class="v" style="color:var(--pur)">${'\u2610'.repeat(10).split('').join('')} \u00b7 clean, for now</div></div>
    </div>
    <div class="st-cols">
      <div class="st-col">
        <h4>THE RECORD</h4>
        <div class="st-list">
          <div>genesis \u2014 forged ${g.forged}${g.mode === 'sim' ? ' \u00b7 in effigy' : ''}</div>
          <div style="color:var(--dim);">the rest of this life is unwritten.</div>
        </div>
      </div>
      <div class="st-col">
        <h4>BONDS \u00b7 WITNESSES</h4>
        <div class="st-list">
          <div style="color:var(--dim);">none yet \u2014 find a crew.</div>
        </div>
        <div class="st-prov">
          genesis ${seal}<br>
          chrome: ${chromeNames.length ? chromeNames.join(', ') : 'none'}<br>
          chain: 1 entry${g.mode === 'sim' ? ' \u00b7 signed in effigy' : ''}<br>
          <span style="color:var(--faint);">updates never touch the soul</span>
        </div>
      </div>
    </div>`;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
