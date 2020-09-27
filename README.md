
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

[![npm](https://img.shields.io/npm/dt/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![npm](https://img.shields.io/npm/v/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![Build Status](https://travis-ci.org/mdaskalov/homebridge-tasmota-zbbridge.svg?branch=master)](https://travis-ci.org/mdaskalov/homebridge-tasmota-zbbridge)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/pulls)
[![GitHub issues](https://img.shields.io/github/issues/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/issues)

# Homebridge Tasmota ZbBridge

Thsis plugin can controll zigbee devices connected to [Sonoff Zigbee Bridge](https://zigbee.blakadder.com/Sonoff_ZBBridge.html) or any other device running [Tasmota](https://tasmota.github.io/docs) firmware using MQTT commands.
Requires MQTT broker to communicate.

# Installation

* Flash your device with Tasmota firmware
* install homebridge `npm install -g homebridge`
* install the plugin `npm install -g homebridge-tasmota-zbbridge`
* alternatively use the great [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to install and configure

# Configuration

```
{
    "name": "ZbBridge",
    "zbBridgeDevices": [
        {
            "addr": "0x8e8e",
            "type": "light1",
            "name": "Hue Lamp"
        },
        {
            "addr": "0x6769",
            "type": "light3",
            "name": "Go"
        },
        {
            "addr": "0xAC3C",
            "type": "switch",
            "name": "Switch"
        }
    ],
    "tasmotaDevices": [
        {
            "topic": "sonoff",
            "type": "POWER",
            "name": "Sonoff TM"
        },
        {
            "topic": "sonoff",
            "type": "StatusSNS.AM2301.Temperature",
            "name": "Sonoff TM Temperature"
        },
        {
            "topic": "sonoff",
            "type": "StatusSNS.AM2301.Humidity",
            "name": "Sonoff TM Humidity"
        },
        {
            "topic": "sonoff-4ch",
            "type": "POWER2",
            "name": "Sonoff 4CH Channel 2"
        }
    ],
    "mqttBroker": "raspi2",
    "platform": "TasmotaZbBridge"
}
```

`mqttTopic`- Identifying topic of your ZbBridge device (i.e. tasmota_ABCDEF)

`zbBridgeDevices` - Zigbee devices connected to the Sonoff Zigbee Bridge

* `addr` - Device short address
* `type` - Device type (`light0`, `light1`, `light2`, `light3`, `switch`) see descriptions in `config.schema.json`
* `name` - Accessory name to be used in the Home applicaiton. Should be unique. Will update ZbBridge Friendly Name

`tasmotaDevices` - Tasmota flashed devices

* `topic` - Device topic as configured in the MQTT menu
* `type` - Device type (`POWER`, `StatusSNS.AM2301.Temperature`, `StatusSNS.AM2301.Humidity`, etc.) see descriptions in `config.schema.json`
* `name` - Accessory name to be used in the Home applicaiton. Should be unique.

`mqttBroker` - MQTT Broker hostname if not localhost

`mqttUsername` - MQTT Broker username if passwort protected

`mqttPassword` - MQTT Broker passwort if passwort protected
