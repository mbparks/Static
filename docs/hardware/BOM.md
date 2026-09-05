# STATIC — Shard bill of materials (v0, WIP)

Sourceable parts for one player Shard and one GM dock. Exact modules vary;
these are the categories and the numbers the firmware and the printable base
(`shard-base.scad`) assume. Measure before you print.

## One player Shard
| part | notes |
|---|---|
| ESP32 dev board | any ESP32 with BLE + touch (e.g. a small WROOM or C3 module). Board dimensions feed `board_l/board_w` in the SCAD file. |
| 24-LED addressable ring | SK6812 preferred at 3.3 V (WS2812B works but is happier at 5 V). ~50–54 mm outer diameter to match `ring_od`. |
| LiPo cell | ~400–600 mAh, one session per charge. Dimensions feed `cell_*`. |
| TP4056 charge module | USB-C in; charges the cell and runs the board. |
| 3.3 V regulator | MCP1700 or the board's onboard regulator if it's clean enough. |
| 330 Ω resistor | in series on the LED data line. |
| 1000 µF capacitor | across the ring's supply (inrush). |
| 100 nF capacitor | decoupling at the ESP32 supply. |
| copper disc / pad | ~14 mm, the capacitive touch pad; wire to a touch GPIO. |
| printed base + lid | `shard-base.scad`; print the lid (or a ring insert) in translucent filament. |
| a miniature | keys onto the lid post. Yours. |

## One GM dock
| part | notes |
|---|---|
| ESP32 dev board | same family as a Shard; no ring, cell, or pad. Lives on the laptop's USB. |
| USB cable | data-capable, to the GM laptop. |

## Power budget note
24 LEDs at full white will brown out a small cell — the ring vocabulary
breathes dim and slow on purpose, and firmware caps brightness (`MAX_BRIGHT`).
Keep the cap low and the cell will last a session.

## Printing the base

Ready-to-slice STL files, exported from `shard-base.scad`:

| file | what it is |
|---|---|
| `shard-base-shell.stl` | the body — cavity, ring seat, pad pillar, USB notch. Print in any filament. |
| `shard-base-lid.stl` | the top — figure post + ring window. Print in **translucent/natural** filament so the LEDs diffuse. |
| `shard-base.stl` | both parts side by side, for viewing. |

Shell is Ø60 mm × ~20 mm; lid is Ø55 mm with a 6 mm figure post. All three are
manifold. Re-export from the `.scad` after changing any parameter — the STL is
a build artifact, the SCAD is the source of truth.
