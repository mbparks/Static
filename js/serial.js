'use strict';
// STATIC — Web Serial soul provisioning (shared by Forge + Status).
// Speaks the firmware's text protocol over USB. One line per message.
// Requires a Web Serial browser (Chrome/Edge desktop) and a Shard
// running the common firmware (flash it once with the Arduino IDE).

const StaticSerial = (() => {
  let port = null, reader = null, writer = null, buf = '';
  const enc = new TextEncoder(), dec = new TextDecoder();

  async function connect() {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    return true;
  }

  async function disconnect() {
    try { if (reader) { await reader.cancel(); reader.releaseLock(); } } catch(e){}
    try { if (writer) { writer.releaseLock(); } } catch(e){}
    try { if (port) { await port.close(); } } catch(e){}
    port = reader = writer = null; buf = '';
  }

  async function send(line) {
    if (!writer) throw new Error('not connected');
    await writer.write(enc.encode(line + '\n'));
  }

  // read lines until one satisfies match(line) or timeout; ignores LOG| lines
  async function expect(match, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: undefined, done: false }), 300)),
      ]);
      if (done) break;
      if (value) buf += dec.decode(value);
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || line.startsWith('LOG|')) continue;
        if (match(line)) return line;
      }
    }
    return null;
  }

  // probe a freshly connected Shard: returns {state:'UNCONSECRATED'|'SOULED', ...}
  async function identify() {
    await send('HELLO?');
    const line = await expect(l => l.startsWith('STATIC|'));
    if (!line) return null;
    const p = line.split('|');
    if (p[1] === 'SOULED') {
      return { state:'SOULED', name:p[2], cls:p[3], maxhp:+p[4], fw:+p[5], static:+p[6], hash:p[7] };
    }
    return { state:'UNCONSECRATED', fw:p[2] };
  }

  // write a soul and wait for the device to confirm ignition
  async function consecrate(soul) {
    const frame = ['SOUL', soul.name, soul.cls, soul.maxhp, soul.fw, soul.static, soul.hash].join('|');
    await send(frame);
    const ok = await expect(l => l.startsWith('OK|') || l.startsWith('STATIC|'), 6000);
    return ok === 'OK|IGNITED';
  }

  async function readSoul() {
    await send('READ?');
    const line = await expect(l => l.startsWith('STATIC|'));
    if (!line) return null;
    const p = line.split('|');
    if (p[1] !== 'SOULED') return { state:'UNCONSECRATED' };
    return { state:'SOULED', name:p[2], cls:p[3], maxhp:+p[4], fw:+p[5], static:+p[6], hash:p[7] };
  }

  const supported = () => 'serial' in navigator;

  return { supported, connect, disconnect, identify, consecrate, readSoul };
})();
