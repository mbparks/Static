// =====================================================================
//  STATIC — GM DOCK firmware
//  ---------------------------------------------------------------------
//  *** WORK IN PROGRESS — v0.2. Multi-Shard addressed routing. ***
//
//  The dock is the radio bridge and nothing else. It sits on the GM
//  laptop's USB, listens to the browser console, and relays addressed
//  events to the player Shards over BLE. It holds no game state and
//  makes no decisions — the console is the only brain (rulebook P3 ch0).
//  Same ESP32 as a Shard, minus ring, battery, and pad.
//
//  Data path:
//    console (Web Serial) --USB--> dock --BLE--> the addressed shard
//    shard --BLE notify--> dock --USB--> console (tagged with its name)
//
//  Serial protocol (v0, newline text):
//    console -> dock:  TO|<name>|<frame>   ALL|<frame>   ROSTER?
//    dock -> console:  SHARDS|a,b,c        IN|<name>|<msg>   LOG|...
//  A shard's <name> is its advertised BLE name = its soul name, so the
//  console addresses tokens by character name. Names must match.
//
//  WIP / TODO:
//    - Connects to up to MAX_SHARDS peripherals. ESP32 BLE central
//      multi-connect is workable but finicky; expect the occasional
//      re-scan on a dropped link.
//    - No signing; the dock relays bytes untouched and must never become
//      a trusted party. Signing lives at the console/shard ends.
//    - Rescan is periodic + on demand (ROSTER?), not event-driven.
// =====================================================================

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <BLEClient.h>
#include "../shared/static_contract.h"

static const int MAX_SHARDS = 6;
static BLEUUID serviceUUID(STATIC_SERVICE_UUID);
static BLEUUID stateUUID(STATIC_STATE_UUID);   // dock WRITES here
static BLEUUID inputUUID(STATIC_INPUT_UUID);   // dock SUBSCRIBES here

struct Link {
  bool used = false;
  String name;
  BLEClient* client = nullptr;
  BLERemoteCharacteristic* stateChar = nullptr;
};
static Link links[MAX_SHARDS];

// pending devices discovered by a scan, connected in loop()
static BLEAdvertisedDevice* pending[MAX_SHARDS];
static int pendingCount = 0;

static int slotByName(const String& n) {
  for (int i=0;i<MAX_SHARDS;i++) if (links[i].used && links[i].name==n) return i;
  return -1;
}
static int freeSlot() {
  for (int i=0;i<MAX_SHARDS;i++) if (!links[i].used) return i;
  return -1;
}
static bool haveDevice(const String& n) { return slotByName(n) >= 0; }

// forward a shard's notification up to the console, tagged with its name
static Link* linkForChar(BLERemoteCharacteristic* c) {
  for (int i=0;i<MAX_SHARDS;i++)
    if (links[i].used && links[i].client && links[i].client->isConnected()) return &links[i];
  return nullptr;
}
static String gLastInputName;   // best-effort: name set at registration time
static void onNotify(BLERemoteCharacteristic* c, uint8_t* data, size_t len, bool) {
  Serial.print("IN|"); Serial.print(gLastInputName); Serial.print("|");
  for (size_t i=0;i<len;i++) Serial.write(data[i]);
  Serial.println();
}

class ScanCB : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) override {
    if (!dev.haveServiceUUID() || !dev.isAdvertisingService(serviceUUID)) return;
    String nm = dev.haveName() ? String(dev.getName().c_str()) : String(dev.getAddress().toString().c_str());
    if (haveDevice(nm)) return;
    if (pendingCount < MAX_SHARDS) {
      pending[pendingCount++] = new BLEAdvertisedDevice(dev);
      Serial.print("LOG|found "); Serial.println(nm);
    }
  }
};

static void sendRoster() {
  Serial.print("SHARDS|");
  bool first=true;
  for (int i=0;i<MAX_SHARDS;i++) if (links[i].used) {
    if(!first) Serial.print(","); Serial.print(links[i].name); first=false;
  }
  Serial.println();
}

static bool connectPending(BLEAdvertisedDevice* dev) {
  int slot = freeSlot();
  if (slot < 0) return false;
  String nm = dev->haveName() ? String(dev->getName().c_str()) : String(dev->getAddress().toString().c_str());

  BLEClient* client = BLEDevice::createClient();
  if (!client->connect(dev)) { Serial.print("LOG|connect failed "); Serial.println(nm); return false; }
  BLERemoteService* svc = client->getService(serviceUUID);
  if (!svc) { client->disconnect(); return false; }
  BLERemoteCharacteristic* sc = svc->getCharacteristic(stateUUID);
  BLERemoteCharacteristic* ic = svc->getCharacteristic(inputUUID);
  if (!sc || !ic) { client->disconnect(); return false; }

  gLastInputName = nm;                       // v0: best-effort input tagging
  if (ic->canNotify()) ic->registerForNotify(onNotify);

  links[slot].used=true; links[slot].name=nm; links[slot].client=client; links[slot].stateChar=sc;
  Serial.print("LOG|connected "); Serial.println(nm);
  sendRoster();
  return true;
}

// route one console line
static void handleConsole(String line) {
  line.trim();
  if (line == "ROSTER?") { sendRoster(); return; }
  if (line.startsWith("TO|")) {
    int a = line.indexOf('|'), b = line.indexOf('|', a+1);
    if (b < 0) return;
    String name = line.substring(a+1, b);
    String frame = line.substring(b+1);
    int slot = slotByName(name);
    if (slot >= 0 && links[slot].stateChar && links[slot].client->isConnected())
      links[slot].stateChar->writeValue((uint8_t*)frame.c_str(), frame.length(), false);
    return;
  }
  if (line.startsWith("ALL|")) {
    String frame = line.substring(4);
    for (int i=0;i<MAX_SHARDS;i++)
      if (links[i].used && links[i].stateChar && links[i].client->isConnected())
        links[i].stateChar->writeValue((uint8_t*)frame.c_str(), frame.length(), false);
    return;
  }
}

static uint32_t lastScan = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("LOG|STATIC dock v0.2 (WIP) up");
  BLEDevice::init("STATIC-Dock");
  BLEScan* scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCB());
  scan->setActiveScan(true);
}

void loop() {
  // periodic scan for new shards (5s), non-blocking-ish
  if (millis() - lastScan > 5000) {
    lastScan = millis();
    BLEDevice::getScan()->start(2, nullptr, false);   // 2s scan window
  }
  // connect anything the scan queued
  while (pendingCount > 0) {
    BLEAdvertisedDevice* d = pending[--pendingCount];
    connectPending(d);
    delete d;
  }
  // relay console -> shards
  if (Serial.available()) handleConsole(Serial.readStringUntil('\n'));
  // prune dead links
  for (int i=0;i<MAX_SHARDS;i++)
    if (links[i].used && links[i].client && !links[i].client->isConnected()) {
      Serial.print("LOG|dropped "); Serial.println(links[i].name);
      links[i].used=false; links[i].client=nullptr; links[i].stateChar=nullptr;
      sendRoster();
    }
  delay(5);
}
