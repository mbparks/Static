# STATIC — the web layer

A tabletop RPG where every character lives inside an ESP32 in the miniature's
base ("a Shard"), the GM runs the table from a browser, and a projector
performs the fiction alongside the hardware. Sixty years ago something woke in
the network. The last witnesses are dying.

This folder is the game's entire web presence: static files, no build step,
no server, no accounts, no telemetry. Local-first all the way down.

## Deploying

Drop this folder anywhere. Every link is relative, so it works at the domain
root, in `/static/`, in `/games/whatever/` — any subfolder of any host.

Two notes:

- **Web Serial requires HTTPS** (or `localhost`). The Forge and Record pages
  degrade gracefully without it — the "in effigy" (simulated Shard) paths work
  anywhere, in any browser.
- Everything else is plain HTML/CSS/JS and runs from `file://` if you want it
  to.

For local work: `python3 -m http.server` in this folder, then
`http://localhost:8000/`.

## The pages

| page | what it is |
|---|---|
| `index.html` | The front door. Four doors in, one line of dread out. |
| `forge.html` | Character creation as a rite: class, stats, chrome, the flesh, **the name** (spoken aloud), first ignition, and a printable 6×4" character card (browser print → PDF). Works with a simulated Shard today; detects real ones over Web Serial, awaiting firmware v0 for the flash handshake. |
| `status.html` | "The Record." Shows a Shard its reflection — reads the effigy soul the Forge saved in this browser; will read real Shards when firmware lands. |
| `console.html` | The GM's brain. Party & opposition, zones with tags, initiative rail, turns, the sweep (ember clocks), heat with thresholds, ice (clear paths enforced), the two-step death rite, oaths, rulings, clocks, and jack-out with the XP tally. Autosaves every event. |
| `table.html` | The projected view. A dumb renderer: ambient / scene / combat modes, flash takeovers (ice, downs, oaths, deaths), end-credits roll. Open it from the console ("OPEN TABLE VIEW") and drag it to the external display. |
| `book.html` | The full rulebook, rendered. Regenerated from `rulebook-v0.8.md`, which ships alongside as the source of truth. |

## Architecture

```
one brain, many performers

console.html ──BroadcastChannel──▶ table.html      (filtered public slice)
     │
     └──(future: Web Serial)──▶ dock ESP32 ──ESP-NOW──▶ Shards
```

- **`js/content.js`** — the content pipeline: classes, chrome, zone tags, ice,
  enemies. These records use the schemas fixed in the rulebook's Part Three.
  A campaign file is just a document shaped like this one; the starter content
  is the first campaign.
- **`js/device.js`** — the device contract. Three functions (`fnv1a`,
  `derivePermutation`, `sha256hex`) that firmware v0 must implement
  **byte-identically**: the character's name deterministically derives the
  order the LED ring first ignites, and the death animation replays it in
  reverse. This file is deliberately tiny — it is the spec.
- **`js/rite.js` / `js/status.js` / `js/console.js` / `js/table.js`** —
  per-page logic. The console is the only writer of truth; the table view
  holds no state and only ever receives a filtered slice (hidden enemies and
  FOLD tags are never broadcast — filtering is structural, not cosmetic).
- **`css/site.css`** — one theme for every page.

### Data flow & storage

- `localStorage['static.forge.lastGenesis']` — the soul the Forge made in
  this browser (`{g: genesis, hash}`); read by the Record page and the
  console's "+ FROM EFFIGY."
- `localStorage['static.console.state']` — the console's full session state,
  saved on every event. Close mid-fight, reopen, resume.
- `BroadcastChannel('static-table')` — console ↔ table view. Message types:
  `state` (public slice), `flash` (takeovers), `credits` (jack-out roll),
  `hello` (table view asks for a rehydrate on open).

### Doctrine encoded as engineering

- The table view can only render what the whole table is entitled to know.
- Every ice effect carries its clear path; ice without one doesn't exist.
- The death rite is two presses, and the first button says to say it aloud.
- Updates never touch the soul (firmware/data partition split, enforced
  on-device once firmware lands).
- The fiction outranks the machine: every page degrades to paper.

## What's honest about v0

Working: everything listed above, end to end, with simulated Shards.
Stubbed, awaiting **firmware v0** on real ESP32 hardware:

- Flashing from the Forge (esptool-over-Web-Serial + soul partition image)
- Reading real Shards on the Record page (identity handshake)
- The console's dock bridge (signed ESP-NOW events to physical rings)
- On-device keys, ledger writes, witness co-signing, the death lock

## Roadmap

1. **Firmware v0** — port `device.js` to the ESP32; unconsecrated state,
   serial handshake, the ring (ignite / breathe / ice / yank / lock).
2. Dock bridge + signed event protocol (rulebook Part Three schemas on the
   wire).
3. Campaign file import/export in the console (the authoring promise).
4. Rulebook to v1.0: Part Three chapter 6, cant & chrome catalogs, prices.

## The book

`rulebook-v0.8.md` is canonical. `book.html` is generated from it. If you
edit the rules, edit the markdown and regenerate — the rendered page is a
build artifact, not a second source of truth. The Recollectors would insist.

---

Make. Hack. Learn. Share. Repeat.
