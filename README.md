
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

[![npm](https://img.shields.io/npm/dt/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![npm](https://img.shields.io/npm/v/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![Build Status](https://travis-ci.org/mdaskalov/homebridge-tasmota-zbbridge.svg?branch=master)](https://travis-ci.org/mdaskalov/homebridge-tasmota-zbbridge)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/pulls)
[![GitHub issues](https://img.shields.io/github/issues/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/issues)

# Homebridge Tasmota ZbBridge

Thsis plugin can controll zigbee devices connected to [Sonoff ZbBridge](https://zigbee.blakadder.com/Sonoff_ZBBridge.html) or any other device running [Tasmota](https://tasmota.github.io/docs) firmware using MQTT commands.
Requires a MQTT broker to communicate with the devices.

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
            "id": "0x8e8e",
            "type": "light1",
            "name": "Hue Lamp"
        },
        {
            "id": "0x6769",
            "type": "light3",
            "name": "Go"
        },
        {
            "id": "0xAC3C",
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
            "name": "Living Temperature"
        },
        {
            "topic": "sonoff",
            "type": "StatusSNS.AM2301.Humidity",
            "name": "Living Humidity"
        },
        {
            "topic": "sonoff-4ch",
            "type": "POWER2",
            "name": "Power 2"
        }
    ],
    "mqttBroker": "raspi2",
    "platform": "TasmotaZbBridge"
}
