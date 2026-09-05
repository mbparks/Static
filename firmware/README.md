# STATIC firmware — WORK IN PROGRESS (v0)

Arduino sketches for the two ESP32 devices in a STATIC table. **Still a work in progress**, but consecration is now real: flash the common
firmware once, and the website's Forge writes each character's soul over USB
into the Shard's flash — the ring lights, on your desk, in the name's order.
The BLE play link and multi-Shard support are the parts still maturing. Every sketch carries a WIP banner listing
what it still lacks.

```
firmware/
├── shared/static_contract.h   the byte-identical device contract
├── shard/shard.ino            player token: renderer + pad + BLE receive
└── dock/dock.ino              GM bridge: USB serial <-> BLE
```

## The one rule: the contract must match the website

`shared/static_contract.h` ports `fnv1a` and `derivePermutation` directly from
the web project's `js/device.js`. A character's name derives the order its ring
first ignites — and, reversed, the order it goes dark at death. If the chip and
the browser compute that order differently, a forged Shard lights wrong and the
"this object *is* my character" promise breaks. **Change one, change both.**

## Building

- Arduino IDE with ESP32 board support installed.
- Shard needs the Adafruit NeoPixel library (Library Manager).
- Both use the ESP32's built-in BLE. No other dependencies.
- Open `shard/shard.ino` or `dock/dock.ino`, pick your ESP32 board, upload.
- The `.ino` files include `../shared/static_contract.h` by relative path;
  keep the folder layout, or copy the header next to the sketch.

## Wiring (Shard)

See `docs/hardware/schematic.svg` for the full schematic. In brief:
`RING_PIN` (GPIO5, example) → ~330Ω → LED ring DIN, bulk cap across the ring
supply; `PAD_PIN` (TOUCH0, example) → a copper touch area; power from a
LiPo + TP4056 charger + 3.3V regulator. Prefer SK6812 LEDs at 3.3V. Pin names
are examples — adjust to your board.

The dock is the same board with no ring, battery, or pad: it lives on the
laptop's USB and only relays.

## What v0 does NOT do yet

- ~~No NVS-persisted soul~~ — DONE: the soul lives in NVS; the Forge writes it
  over serial and the Shard loads it on boot.
- No signing or verification — v0 trusts the BLE link. Real builds must verify
  a hub signature before acting on any event, and never trust an unsigned one.
- No on-device keys, no ledger, no persistent death-lock.
- Dock talks to ONE Shard; multi-Shard addressing is the next milestone.
- No base-to-base trade.

## Roadmap (matches the project README)

1. Multi-Shard addressing in the dock + per-message routing.
2. NVS soul: the Forge writes genesis over serial; the Shard loads it on boot.
3. Signing: console signs events, devices verify, ledger writes begin.
4. Trade, witness co-signing, and the persistent death-lock.

## How consecration works now (the serial path)

1. Flash `shard/shard.ino` to an ESP32 once, with the Arduino IDE. It boots
   `UNCONSECRATED` — a single dim pixel drifting, "nobody yet".
2. Open the website's Forge, click **connect a Shard**, and pick the serial
   port. The Forge probes with `HELLO?`; a blank Shard answers
   `STATIC|UNCONSECRATED|<fwver>` and the rite proceeds. (A Shard that already
   has a soul answers `SOULED` and the Forge refuses to reforge it.)
3. Build the character, speak the name. At ignition the Forge sends
   `SOUL|name|cls|hp|fw|static|hash`; the Shard writes it to NVS, lights the
   ring in the name's order, and replies `OK|IGNITED`.
4. Unplug it. It wakes showing who it is. The Status page can read it back
   with `READ?` at any time.

No browser-side flashing and no compiler needed after the one-time firmware
upload — the website only ever writes the small soul, never the firmware.
