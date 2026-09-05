// =====================================================================
//  STATIC — GM DOCK firmware
//  ---------------------------------------------------------------------
//  *** WORK IN PROGRESS — v0. Bridges, but single-shard for now. ***
//
//  The dock is the plainest device in the system: a radio bridge and
//  nothing else. It sits on the GM laptop's USB cable, listens to the
//  browser console over serial, and relays each event to the player
//  Shards over BLE. It holds no game state and makes no decisions — the
//  console is the only brain (rulebook, Part Three ch.0).
//
//  It is the same ESP32 as a Shard, minus the ring, battery, and pad.
//
//  Data path:
//    console (Web Serial) --USB--> dock --BLE--> shard(s)
//    shard --BLE notify--> dock --USB--> console
//
//  Serial protocol (v0, newline-terminated text, mirrors the contract):
//    from console:  STATE|...   FX|...   TURN   IGNITE|name   LOCK
//    to console:    IN|YANK      IN|TAP       (forwarded shard inputs)
//                   LOG|...      (dock status: connects, drops)
//
//  WIP / TODO (the big ones):
//    - Connects to ONE shard (first STATIC service found). Real play
//      needs a table of shards, addressed per message. Next milestone.
//    - No addressing in the frames yet; every event goes to the one
//      link. A "P2|STATE|..." prefix is the obvious next step.
//    - No signing. The console will eventually sign; the dock relays the
//      signed bytes untouched (it must never become a trusted party).
//    - BLE central reconnection is minimal; expect to re-run on drop.
// =====================================================================

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include "../shared/static_contract.h"

static BLEUUID serviceUUID(STATIC_SERVICE_UUID);
static BLEUUID stateUUID(STATIC_STATE_UUID);   // we WRITE to this
static BLEUUID inputUUID(STATIC_INPUT_UUID);   // we SUBSCRIBE to this

static BLEAdvertisedDevice* gFound = nullptr;
static BLERemoteCharacteristic* gStateChar = nullptr;
static BLERemoteCharacteristic* gInputChar = nullptr;
static bool gConnected = false;
static bool gShouldConnect = false;

// ---- shard -> hub: forward notifications up the USB line -------------
static void onNotify(BLERemoteCharacteristic* c, uint8_t* data, size_t len, bool) {
  Serial.print("IN|");
  for (size_t i = 0; i < len; ++i) Serial.write(data[i]);
  Serial.println();
}

// ---- find the first STATIC shard advertising ------------------------
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) override {
    if (dev.haveServiceUUID() && dev.isAdvertisingService(serviceUUID)) {
      BLEDevice::getScan()->stop();
      gFound = new BLEAdvertisedDevice(dev);
      gShouldConnect = true;
      Serial.print("LOG|found shard "); Serial.println(dev.getAddress().toString().c_str());
    }
  }
};

class ClientCallback : public BLEClientCallbacks {
  void onConnect(BLEClient*) override {}
  void onDisconnect(BLEClient*) override {
    gConnected = false;
    Serial.println("LOG|shard disconnected");
  }
};

static bool connectToShard() {
  BLEClient* client = BLEDevice::createClient();
  client->setClientCallbacks(new ClientCallback());
  if (!client->connect(gFound)) { Serial.println("LOG|connect failed"); return false; }

  BLERemoteService* svc = client->getService(serviceUUID);
  if (!svc) { Serial.println("LOG|no STATIC service"); client->disconnect(); return false; }

  gStateChar = svc->getCharacteristic(stateUUID);
  gInputChar = svc->getCharacteristic(inputUUID);
  if (!gStateChar || !gInputChar) { Serial.println("LOG|missing characteristic"); return false; }

  if (gInputChar->canNotify()) gInputChar->registerForNotify(onNotify);

  gConnected = true;
  Serial.println("LOG|connected");
  return true;
}

// =====================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("LOG|STATIC dock v0 (WIP) up");

  BLEDevice::init("STATIC-Dock");
  BLEScan* scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCallback());
  scan->setActiveScan(true);
  scan->start(0, nullptr, false);   // scan until a shard appears
}

// =====================================================================
void loop() {
  // ---- establish / re-establish the BLE link ------------------------
  if (gShouldConnect) {
    gShouldConnect = false;
    connectToShard();
  }

  // ---- console -> shard: relay one serial line as one BLE write -----
  if (gConnected && gStateChar && Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length()) {
      gStateChar->writeValue((uint8_t*)line.c_str(), line.length(), false);
    }
  }

  delay(5);
}
