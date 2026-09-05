'use strict';
/* Device contract: firmware v0 must implement fnv1a and
   derivePermutation byte-identically. */
/* FNV-1a → xorshift → Fisher-Yates: the name IS the ignition order.
   Firmware v0 must implement these three, byte-identical.          */
function fnv1a(str){
  let h = 0x811c9dc5;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function derivePermutation(name, n){
  let s = fnv1a(name) || 1;
  const rnd = () => { s ^= s<<13; s ^= s>>>17; s ^= s<<5; s >>>= 0; return s / 4294967296; };
  const p = Array.from({length:n}, (_,i)=>i);
  for (let i=n-1;i>0;i--){ const j = Math.floor(rnd()*(i+1)); [p[i],p[j]] = [p[j],p[i]]; }
  return p;
}


async function sha256hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
