// =====================================================================
//  STATIC — PLAYER SHARD firmware
//  ---------------------------------------------------------------------
//  *** WORK IN PROGRESS — v0.1. Consecration works; play is partial. ***
//
//  A Shard is the ESP32 in a miniature's base. It is a DUMB RENDERER
//  that also holds a persistent identity (its "soul"). It:
//    - loads its soul from NVS on boot (or waits, blank, to be forged)
//    - is consecrated over USB serial by the web Forge (First Boot)
//    - drives the LED ring vocabulary
//    - reads the one touch pad
//    - receives refereed state from the GM hub over BLE and performs it
//  It makes no game decisions. (Rulebook Part Two; ring legend ch.12.)
//
//  FLASH THIS ONCE with the Arduino IDE. After that the website writes
//  each character's soul over USB — you never reflash to make a new
//  character. Common firmware + generated soul = the whole design.
//
//  Hardware: ESP32 + 24-LED ring on RING_PIN (~330R + bulk cap; SK6812
//  preferred at 3.3V), capacitive pad on PAD_PIN. See docs/hardware/.
//  Libraries: Adafruit NeoPixel. Uses built-in BLE, Preferences, touch.
//
//  WIP / TODO:
//    - No signing yet (BLE play link is trusted in v0).
//    - No on-device keypair / ledger / persistent death-lock yet.
//    - Dock talks to one Shard; multi-Shard addressing is next.
// =====================================================================

#include <Adafruit_NeoPixel.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include "../shared/static_contract.h"

static const uint8_t  RING_PIN   = 5;
static const uint8_t  PAD_PIN    = T0;
static const uint8_t  MAX_BRIGHT = 60;
static const uint16_t TOUCH_THRESHOLD = 40;
static const uint16_t YANK_HOLD_MS    = 3000;

Adafruit_NeoPixel ring(STATIC_LED_COUNT, RING_PIN, NEO_GRB + NEO_KHZ800);
Preferences prefs;

// ---- the soul (persisted in NVS) -------------------------------------
bool    gSouled = false;
char    gName[20]  = "";
char    gClass[16] = "";
char    gHash[20]  = "";
int     gMaxHpBase = 12, gFwBase = 4, gStaticBase = 0;
uint8_t gIgnition[STATIC_LED_COUNT];

// ---- live play state the ring performs -------------------------------
int   gHp = 12, gMaxHp = 12, gStatic = 0, gDown = 0;
StaticFx gFx = FX_NONE;
bool  gLocked = false;

// ---- pad ----
uint32_t gPadDownAt = 0; bool gPadDown = false;
// ---- trophy timeout: after N ms with no hub, sleep the ring ----
uint32_t gLastHub = 0;

BLECharacteristic* gInputChar = nullptr;

// =====================================================================
//  NVS soul load / save
// =====================================================================
void loadSoul() {
  prefs.begin("static", true);
  gSouled = prefs.getBool("souled", false);
  if (gSouled) {
    prefs.getString("name",  gName,  sizeof(gName));
    prefs.getString("class", gClass, sizeof(gClass));
    prefs.getString("hash",  gHash,  sizeof(gHash));
    gMaxHpBase  = prefs.getInt("maxhp", 12);
    gFwBase     = prefs.getInt("fw", 4);
    gStaticBase = prefs.getInt("static", 0);
    gLocked     = prefs.getBool("locked", false);
  }
  prefs.end();
  gHp = gMaxHp = gMaxHpBase; gStatic = gStaticBase;
  if (gSouled) staticDerivePermutation(gName, gIgnition, STATIC_LED_COUNT);
}

void saveSoul() {
  prefs.begin("static", false);
  prefs.putBool("souled", true);
  prefs.putString("name",  gName);
  prefs.putString("class", gClass);
  prefs.putString("hash",  gHash);
  prefs.putInt("maxhp",  gMaxHpBase);
  prefs.putInt("fw",     gFwBase);
  prefs.putInt("static", gStaticBase);
  prefs.putBool("locked", false);
  prefs.end();
}

void wipeSoul() {
  prefs.begin("static", false);
  prefs.clear();
  prefs.end();
  gSouled = false; gLocked = false;
  gName[0] = 0; gClass[0] = 0; gHash[0] = 0;
}

void persistLock() {
  prefs.begin("static", false);
  prefs.putBool("locked", true);
  prefs.end();
  gLocked = true;
}

// =====================================================================
//  Ring vocabulary (unchanged palette; matches the card legend)
// =====================================================================
static uint32_t C(uint8_t r, uint8_t g, uint8_t b) { return ring.Color(r, g, b); }
static float breathe(uint16_t p) { float ph=(millis()%p)/(float)p; return 0.35f+0.65f*(0.5f+0.5f*sinf(ph*2*PI)); }
static void paintSolid(uint8_t r,uint8_t g,uint8_t b,float l){ for(uint8_t i=0;i<STATIC_LED_COUNT;i++) ring.setPixelColor(i,C(r*l,g*l,b*l)); }

static void paintBaseline() {
  float l,r,g,b;
  if (gHp <= (gMaxHp+2)/3){ r=232;g=64;b=42;  l=breathe(600);  }
  else if (gHp < gMaxHp)  { r=240;g=160;b=42; l=breathe(1400); }
  else                    { r=46; g=204;b=113;l=breathe(4000); }
  for (uint8_t i=0;i<STATIC_LED_COUNT;i++){
    bool corrupt = gStatic>0 && (random(30) < gStatic);
    ring.setPixelColor(i, corrupt ? C(155*l,77*l,219*l) : C(r*l,g*l,b*l));
  }
}
static void paintDown(){ ring.clear(); uint8_t e=gDown>0?gDown:1;
  for(uint8_t k=0;k<e;k++){ uint8_t idx=(k*STATIC_LED_COUNT)/3; float f=(random(100)<8)?0.9f:0.12f; ring.setPixelColor(idx,C(160*f,34*f,24*f)); } }
static void paintIce(){ for(uint8_t i=0;i<STATIC_LED_COUNT;i++){ float g=(random(100)<35)?(random(100)/100.0f):0.0f; ring.setPixelColor(i,C(232*g,240*g,255*g)); } }
static void paintTrack(){ paintSolid(46,204,113,0.25f); uint8_t p=(millis()/60)%STATIC_LED_COUNT; ring.setPixelColor(p,C(255,36,24)); }
static void paintHush(){ paintSolid(46,204,113,0.30f*breathe(3000)); }

static void turnLap(){ for(uint8_t i=0;i<STATIC_LED_COUNT;i++){ ring.clear(); ring.setPixelColor(i,C(255,255,255)); ring.show(); delay(18);} }
static void paintYankProgress(float f){ ring.clear(); uint8_t lit=(uint8_t)(f*STATIC_LED_COUNT); for(uint8_t i=0;i<lit;i++) ring.setPixelColor(i,C(240,240,240)); ring.show(); }

static void igniteInNameOrder(){
  staticDerivePermutation(gName, gIgnition, STATIC_LED_COUNT);
  ring.clear();
  for(uint8_t k=0;k<STATIC_LED_COUNT;k++){ ring.setPixelColor(gIgnition[k],C(46,204,113)); ring.show(); delay(150); }
}
static void runLockAnimation(){
  staticDerivePermutation(gName, gIgnition, STATIC_LED_COUNT);
  for(int k=STATIC_LED_COUNT-1;k>=0;k--){ ring.setPixelColor(gIgnition[k],C(0,0,0)); ring.show(); delay(150); }
  ring.clear(); ring.show();
}
// blank Shard idle: a single dim seeking pixel drifting — "nobody yet"
static void paintUnconsecrated(){
  ring.clear();
  uint8_t p=(millis()/120)%STATIC_LED_COUNT;
  ring.setPixelColor(p, C(30,30,40));
}

// =====================================================================
//  SERIAL provisioning — the Forge / Status page over USB
// =====================================================================
void handleSerialLine(String msg) {
  msg.trim();
  if (msg == "HELLO?" || msg == "READ?") {
    if (gSouled) {
      Serial.printf("STATIC|SOULED|%s|%s|%d|%d|%d|%s\n",
                    gName, gClass, gMaxHpBase, gFwBase, gStaticBase, gHash);
    } else {
      Serial.printf("STATIC|UNCONSECRATED|%s\n", STATIC_FW_VERSION);
    }
  }
  else if (msg.startsWith("SOUL|")) {
    // SOUL|name|cls|hp|fw|static|hash
    int p[6], last = 4;
    p[0]=msg.indexOf('|');
    for (int k=1;k<6;k++){ p[k]=msg.indexOf('|',p[k-1]+1); }
    msg.substring(p[0]+1,p[1]).toCharArray(gName, sizeof(gName));
    msg.substring(p[1]+1,p[2]).toCharArray(gClass, sizeof(gClass));
    gMaxHpBase  = msg.substring(p[2]+1,p[3]).toInt();
    gFwBase     = msg.substring(p[3]+1,p[4]).toInt();
    gStaticBase = msg.substring(p[4]+1,p[5]).toInt();
    msg.substring(p[5]+1).toCharArray(gHash, sizeof(gHash));
    gSouled = true; gLocked = false;
    gHp = gMaxHp = gMaxHpBase; gStatic = gStaticBase;
    saveSoul();
    igniteInNameOrder();               // First Boot: light in name order, live
    Serial.println("OK|IGNITED");
  }
  else if (msg == "WIPE") {
    wipeSoul();
    ring.clear(); ring.show();
    Serial.println("OK|WIPED");
  }
}

// =====================================================================
//  BLE receive (play link) — unchanged from v0
// =====================================================================
class StateCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    gLastHub = millis();
    String msg = String(c->getValue().c_str());
    if (msg.startsWith("STATE|")) {
      int a=msg.indexOf('|'), b=msg.indexOf('|',a+1), d=msg.indexOf('|',b+1), e=msg.indexOf('|',d+1);
      gHp=msg.substring(a+1,b).toInt(); gMaxHp=msg.substring(b+1,d).toInt();
      gStatic=msg.substring(d+1,e).toInt(); gDown=msg.substring(e+1).toInt();
    } else if (msg.startsWith("FX|")) {
      String f=msg.substring(3);
      gFx = (f=="ICE")?FX_ICE : (f=="TRACK")?FX_TRACK : (f=="HUSH")?FX_HUSH : FX_NONE;
    } else if (msg=="TURN") { turnLap(); }
    else if (msg.startsWith("IGNITE|")) { msg.substring(7).toCharArray(gName,sizeof(gName)); igniteInNameOrder(); }
    else if (msg=="LOCK") { runLockAnimation(); persistLock(); }
  }
};

// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  ring.begin(); ring.setBrightness(MAX_BRIGHT); ring.clear(); ring.show();

  loadSoul();
  Serial.printf("LOG|STATIC shard %s (WIP) — %s\n", STATIC_FW_VERSION,
                gSouled ? gName : "UNCONSECRATED");

  BLEDevice::init(gSouled ? gName : "STATIC-Shard");
  BLEServer* server = BLEDevice::createServer();
  BLEService* svc = server->createService(STATIC_SERVICE_UUID);
  BLECharacteristic* stateChar = svc->createCharacteristic(
      STATIC_STATE_UUID, BLECharacteristic::PROPERTY_WRITE);
  stateChar->setCallbacks(new StateCallback());
  gInputChar = svc->createCharacteristic(
      STATIC_INPUT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(STATIC_SERVICE_UUID); adv->start();

  if (gSouled && !gLocked) igniteInNameOrder();   // wake showing who you are
  else if (gLocked) { runLockAnimation(); }        // dead: one dark memorial pass
}

// =====================================================================
void loop() {
  // ---- serial provisioning (Forge / Status) -------------------------
  if (Serial.available()) handleSerialLine(Serial.readStringUntil('\n'));

  // ---- blank Shard: seek, and do nothing else -----------------------
  if (!gSouled) { paintUnconsecrated(); ring.show(); delay(30); return; }

  // ---- locked Shard: memorial dark ----------------------------------
  if (gLocked) { ring.clear(); ring.show(); delay(100); return; }

  // ---- touch pad: tap vs. 3s hold (Yank) ----------------------------
  uint16_t t = touchRead(PAD_PIN);
  bool pressed = (t < TOUCH_THRESHOLD);
  if (pressed && !gPadDown) { gPadDown=true; gPadDownAt=millis(); }
  else if (pressed && gPadDown) {
    uint32_t held = millis()-gPadDownAt;
    if (gFx != FX_NONE) {
      paintYankProgress(min(1.0f, held/(float)YANK_HOLD_MS));
      if (held >= YANK_HOLD_MS) {
        gFx = FX_NONE;
        if (gInputChar){ gInputChar->setValue("YANK"); gInputChar->notify(); }
        gPadDown=false; delay(200);
      }
      return;
    }
  } else if (!pressed && gPadDown) {
    uint32_t held = millis()-gPadDownAt; gPadDown=false;
    if (held < 600 && gInputChar){ gInputChar->setValue("TAP"); gInputChar->notify(); }
  }

  // ---- render current state -----------------------------------------
  if      (gDown > 0)       paintDown();
  else if (gFx == FX_ICE)   paintIce();
  else if (gFx == FX_TRACK) paintTrack();
  else if (gFx == FX_HUSH)  paintHush();
  else                      paintBaseline();
  ring.show();
  delay(16);
}
