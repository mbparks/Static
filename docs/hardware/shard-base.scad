// =====================================================================
//  STATIC — Shard player token base (parametric, printable)
//  ---------------------------------------------------------------------
//  *** WORK IN PROGRESS — v0.1. Print, test fit, tune the numbers. ***
//
//  A two-part 3D-printed base that houses the Shard electronics:
//    - base_shell(): the body — cavity for board + LiPo, a rim ledge the
//      LED ring sits on, a pillar the touch pad screws/glues to, and a
//      cable notch for USB-C charging/provisioning.
//    - base_lid():   the top — a figure mount post and a translucent-ready
//      window channel so the ring glows through instead of dotting.
//
//  Print the shell in any filament; print the LID (or just the ring
//  window insert) in translucent/natural filament so the LEDs diffuse.
//
//  ALL DIMENSIONS ARE STARTING GUESSES. Measure your actual ring, board,
//  and cell and adjust the parameters below before wasting filament.
//  Units: millimetres.
// =====================================================================

// ---- key parameters (measure your parts, then edit) -----------------
outer_d      = 60;    // token outer diameter (fits a 50-60mm ring)
wall         = 2.4;   // shell wall thickness
base_h       = 18;    // internal cavity height (board + LiPo stack)
ring_od      = 54;    // LED ring outer diameter
ring_id      = 40;    // LED ring inner diameter
ring_t       = 2.0;   // ring PCB thickness (depth of the seat)
board_l      = 34;    // ESP32 board length
board_w      = 20;    // ESP32 board width
board_h      = 6;     // board + tallest component clearance
cell_l       = 30;    // LiPo length
cell_w       = 20;    // LiPo width
cell_h       = 6;     // LiPo thickness
pad_d        = 14;    // touch-pad copper disc diameter
usb_w        = 12;    // USB-C cutout width
usb_h        = 5;     // USB-C cutout height
figure_post_d = 6;    // peg the miniature keys onto
lid_h        = 3;     // lid thickness
fit          = 0.4;   // clearance for a friction fit
$fn          = 96;

// ---------------------------------------------------------------------
module base_shell() {
  difference() {
    // solid body
    cylinder(d=outer_d, h=base_h + wall);

    // main internal cavity
    translate([0,0,wall])
      cylinder(d=outer_d - 2*wall, h=base_h + 1);

    // ring seat: a shallow ledge at the top rim for the LED ring PCB
    translate([0,0, base_h + wall - ring_t])
      difference() {
        cylinder(d=ring_od + fit, h=ring_t + 1);
        translate([0,0,-1]) cylinder(d=ring_id - fit, h=ring_t + 3);
      }

    // USB-C notch through the wall (charging + provisioning)
    translate([outer_d/2 - wall - 1, -usb_w/2, wall + 2])
      cube([wall + 3, usb_w, usb_h]);
  }

  // board rails (two low ribs to seat the ESP32 off the floor)
  for (x = [-board_l/2, board_l/2 - 2])
    translate([x, -board_w/2, wall])
      cube([2, board_w, 3]);

  // touch-pad pillar (glue/screw the copper disc on top)
  translate([-outer_d/4, outer_d/4, wall])
    cylinder(d=pad_d + 4, h=base_h - 4);
}

// ---------------------------------------------------------------------
module base_lid() {
  difference() {
    cylinder(d=outer_d - 2*wall - fit, h=lid_h);
    // ring window: an annular channel so light escapes upward, not sideways
    translate([0,0,-1])
      difference() {
        cylinder(d=ring_od - 2, h=lid_h + 2);
        cylinder(d=ring_id + 2, h=lid_h + 2);
      }
  }
  // figure mount post (key your miniature onto this)
  translate([0,0,lid_h - 0.01])
    cylinder(d=figure_post_d, h=6);
}

// ---- layout for viewing / slicing: shell + lid side by side ----------
base_shell();
translate([outer_d + 8, 0, 0]) base_lid();
