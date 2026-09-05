// =====================================================================
//  STATIC — shared device contract
//  ---------------------------------------------------------------------
//  *** WORK IN PROGRESS — v0, not final, not tested on a full bench. ***
//
//  This header is the ONE piece of firmware that must agree, byte for
//  byte, with the website. The functions below are ported directly from
//  js/device.js in the web project. If you change the algorithm here,
//  you MUST change it there too, or a name will light the ring in a
//  different order on the chip than it did in the browser, and the whole
//  "the object is the character" promise quietly breaks.
//
//  What this file provides:
//    - fnv1a()            : name -> 32-bit hash        (matches device.js)
//    - derivePermutation(): name -> LED ignition order (matches device.js)
//    - the STATIC BLE UUIDs and the tiny wire-message vocabulary
//
//  WIP NOTES / TODO:
//    - No signing yet. v0 trusts anything that arrives on the STATIC
//      characteristic. Real builds must verify a hub signature before
//      acting on an event (see the rulebook, Part Three ch.0: "the
//      machine never wins an argument with the table" — but also never
//      trusts an unsigned one).
//    - Message format is a placeholder CSV-ish text frame, chosen so it
//      is trivial to eyeball on a serial monitor during bring-up. It
//      will become a compact binary struct once the vocabulary settles.
// =====================================================================

#ifndef STATIC_CONTRACT_H
#define STATIC_CONTRACT_H

#include <Arduino.h>

// ---- ring geometry (must match the token's physical LED count) -------
static const uint8_t STATIC_LED_COUNT = 24;

// ---------------------------------------------------------------------
//  fnv1a — FNV-1a 32-bit hash of a string.
//  Ported from device.js. Uses uint32_t math; the JS version relies on
//  Math.imul + >>>0 to stay 32-bit, which this reproduces natively.
// ---------------------------------------------------------------------
inline uint32_t staticFnv1a(const char* str) {
  uint32_t h = 0x811c9dc5UL;              // FNV offset basis
  for (const char* p = str; *p; ++p) {
    h ^= (uint8_t)(*p);
    h *= 0x01000193UL;                    // FNV prime; wraps at 32 bits
  }
  return h;                               // already 32-bit
}

// ---------------------------------------------------------------------
//  derivePermutation — name -> ignition order for N LEDs.
//  xorshift32 seeded by the name hash, then Fisher-Yates. This is the
//  exact sequence device.js produces; do not "improve" it in isolation.
//  out[] must have room for n entries.
// ---------------------------------------------------------------------
inline void staticDerivePermutation(const char* name, uint8_t* out, uint8_t n) {
  uint32_t s = staticFnv1a(name);
  if (s == 0) s = 1;                      // xorshift can't start at 0

  for (uint8_t i = 0; i < n; ++i) out[i] = i;

  // Fisher-Yates, drawing floats in [0,1) exactly as the JS does:
  //   rnd() = (xorshift32 state) / 4294967296
  for (int i = n - 1; i > 0; --i) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;   // xorshift32
    double r = (double)s / 4294967296.0;       // 2^32
    int j = (int)(r * (i + 1));
    uint8_t tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
}

// ---------------------------------------------------------------------
//  BLE identifiers. Placeholder 128-bit UUIDs for v0 — regenerate your
//  own before anything ships, these are just so the two sketches find
//  each other on a bench.
// ---------------------------------------------------------------------
#define STATIC_SERVICE_UUID   "5741544f-5354-4154-4943-000000000001"
#define STATIC_STATE_UUID     "5741544f-5354-4154-4943-000000000002"  // hub -> shard
#define STATIC_INPUT_UUID     "5741544f-5354-4154-4943-000000000003"  // shard -> hub

// ---------------------------------------------------------------------
//  Wire vocabulary (v0, text frames "TYPE|arg|arg").
//  Kept human-readable on purpose while bringing the bench up.
//  Hub -> shard:
//    STATE|hp|maxhp|static|down    set the baseline the ring performs
//    FX|<name>                     overlay: ICE / TRACK / HUSH / CLEAR
//    TURN                          one white lap (your turn)
//    IGNITE|<name>                 first boot: light in name order
//    LOCK                          death: run the boot sequence backward
//  Shard -> hub:
//    YANK                          pad held long enough to purge
//    TAP                           short pad press (boot / trade intent)
// ---------------------------------------------------------------------
enum StaticFx { FX_NONE, FX_ICE, FX_TRACK, FX_HUSH };

// ---------------------------------------------------------------------
//  SERIAL provisioning protocol (v0) — used by the web Forge over USB
//  Web Serial to consecrate a blank Shard and by the Status page to
//  read one back. Newline-terminated text frames, human-readable on
//  purpose. This is the "First Boot at the Forge" path from the rulebook.
//
//  Forge -> shard:
//    HELLO?                         probe: who are you?
//    SOUL|name|cls|hp|fw|static|hash    write this soul to NVS, then ignite
//    READ?                          dump current soul (for the Status page)
//    WIPE                           clear the soul (unconsecrate) — dev only
//  shard -> Forge:
//    STATIC|UNCONSECRATED|<fwver>       blank, ready to be forged
//    STATIC|SOULED|name|cls|hp|fw|static|hash    already carries a soul
//    OK|IGNITED                     soul written, ring lit in name order
//    OK|WIPED
//  The name -> ignition-order derivation is identical to the browser's
//  (staticDerivePermutation), so the device lights exactly as previewed.
// ---------------------------------------------------------------------
#define STATIC_FW_VERSION "0.1-wip"

#endif // STATIC_CONTRACT_H
