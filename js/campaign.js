'use strict';
// STATIC — campaign packs. The chapter-0 authoring promise made real:
// the content pipeline (classes, chrome, tags, ice, enemies) is data a GM
// can export, edit, share, and load — building their own street on our world.
//
// A pack is just the CONTENT object as JSON, plus a little metadata:
//   { static_campaign:1, name, author, updated, content:{classes,chrome,tags,ice,enemies} }
//
// Load order: the built-in CONTENT (from content.js) is the default; a saved
// or imported pack REPLACES the keys it defines and leaves the rest as the
// built-in. So a pack can ship only custom enemies and inherit everything else.

const StaticCampaign = (() => {
  const KEY = 'static.campaign.pack';
  const KEYS = ['classes','chrome','tags','ice','enemies'];

  // snapshot the built-in content so "reset to default" always works
  const BUILTIN = JSON.parse(JSON.stringify({
    classes: CONTENT.classes, chrome: CONTENT.chrome,
    tags: CONTENT.tags, ice: CONTENT.ice, enemies: CONTENT.enemies,
  }));

  let meta = { name: 'The Six Houses (built-in)', author: 'Green Shoe', updated: null };

  function applyPack(pack) {
    // start from a clean builtin, then overlay the pack's keys
    const merged = JSON.parse(JSON.stringify(BUILTIN));
    if (pack && pack.content) {
      for (const k of KEYS) if (Array.isArray(pack.content[k])) merged[k] = pack.content[k];
    }
    for (const k of KEYS) CONTENT[k] = merged[k];
    if (pack && pack.name) meta = { name: pack.name, author: pack.author || 'unknown', updated: pack.updated || null };
    else meta = { name: 'The Six Houses (built-in)', author: 'Green Shoe', updated: null };
  }

  // called once at console startup, before first render
  function boot() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (saved && saved.static_campaign) applyPack(saved);
  }

  function currentPack(name, author) {
    return {
      static_campaign: 1,
      name: name || meta.name,
      author: author || meta.author,
      updated: new Date().toISOString().slice(0, 10),
      content: {
        classes: CONTENT.classes, chrome: CONTENT.chrome,
        tags: CONTENT.tags, ice: CONTENT.ice, enemies: CONTENT.enemies,
      },
    };
  }

  function exportFile(name, author) {
    const pack = currentPack(name, author);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (pack.name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url; a.download = 'static-campaign-' + slug + '.json';
    a.click();
    URL.revokeObjectURL(url);
    return pack;
  }

  // returns {ok, error, counts} — validates lightly, applies + persists on success
  function importPack(text) {
    let pack;
    try { pack = JSON.parse(text); } catch (e) { return { ok: false, error: 'not valid JSON' }; }
    if (!pack || !pack.static_campaign || !pack.content)
      return { ok: false, error: 'not a STATIC campaign pack' };
    // minimal shape checks
    for (const k of KEYS) {
      if (pack.content[k] !== undefined && !Array.isArray(pack.content[k]))
        return { ok: false, error: k + ' must be a list' };
    }
    if (Array.isArray(pack.content.classes)) {
      for (const c of pack.content.classes)
        if (!c.id || !c.name || !c.array) return { ok: false, error: 'a class is missing id/name/array' };
    }
    applyPack(pack);
    try { localStorage.setItem(KEY, JSON.stringify(pack)); } catch (e) {}
    return { ok: true, counts: KEYS.reduce((o, k) => (o[k] = CONTENT[k].length, o), {}), name: pack.name };
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    applyPack(null);
  }

  const name = () => meta.name;
  const counts = () => KEYS.reduce((o, k) => (o[k] = CONTENT[k].length, o), {});

  return { boot, exportFile, importPack, reset, name, counts, KEYS };
})();
