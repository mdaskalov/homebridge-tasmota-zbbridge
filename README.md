
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

It is also possible to combine devices - tasmota device can be used to switch a zigbee device on/off.

# Installation

* Flash your device with Tasmota firmware
* Install homebridge `npm install -g homebridge`
* Install the plugin `npm install -g homebridge-tasmota-zbbridge`
* Alternatively use the great [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to install and configure

# Configuration

```
{
    "name": "ZbBridge",
    "zbBridgeDevices": [
        {
            "addr": "0x8e8e",
            "type": "light1",
            "name": "Hue Lamp",
            "powerTopic": "shelly-kitchen",
            "powerType": "POWER2"
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
* `powerTopic` - (optional) Use another tasmota device to controll the power
* `powerType` - (optional) Which tasmota switch to use, default: `POWER`

`tasmotaDevices` - Tasmota flashed devices

* `topic` - Device topic as configured in the MQTT menu
* `type` - Device type (`POWER`, `StatusSNS.AM2301.Temperature`, `StatusSNS.AM2301.Humidity`, etc.) see descriptions in `config.schema.json`
* `name` - Accessory name to be used in the Home applicaiton. Should be unique.

`mqttBroker` - MQTT Broker hostname if not localhost

`mqttUsername` - MQTT Broker username if passwort protected

`mqttPassword` - MQTT Broker passwort if passwort protected

# Binding

You can add switches to HomeKit to control automations or bind them with other devices or groups for direct control.

To bind a switch to a light type following commands in the tasmota console. IKEA remotes only support 1 group and can be linked to a light only via group numbers (no direct binding). 

Note that when a device is bound to a group you have to listen to the group messages to update the device status. By default EZSP will not report group messages unless you subscribe to the group.

1. Add the light to group 100 
```
ZbSend {"device":"IKEA_Light","Send":{"AddGroup":100}}
```
2. Bind the remote to group 100. Note: you need to press a button on the remote right before sending this command to make sure it's not in sleep mode 
```
ZbBind {"Device":"IKEA_Remote","ToGroup":100,"Cluster":6}
```
3. Activate EZSP to listen to the group messages so the HomeKit device is updated each time a group command is received (Not necessary for CC2530 devices)
```
ZbListen1 100
```
You can also bind devices with the link button of the switch / remote. Then you have to find out the automatically generated group and activate EZSP to listen to this group:
1. Get all device groups:
```
ZbSend {"device":"IKEA_Light","Send":{"GetAllGroups":true}}
tele/zbbridge/SENSOR = {"ZbReceived":{"0x303F":{"Device":"0x303F","Name":"IKEA_Light","0004<02":"FF01AFE0","GetGroupCapacity":255,"GetGroupCount":1,"GetGroup":[57519],"Endpoint":1,"LinkQuality":108}}}
```
3. Activate EZSP to listen to the group messages for the reported group (Not necessary for CC2530 devices)
```
ZbListen1 57519
```
The listen commands should be executed after each reboot. Alternatively a rule to execute them when the zigbee is initialized on boot could be created:

1. Create the rule:
```
RULE1 ON ZbState#status=0 DO Backlog ZbListen1 100; ZbListen2 57519 ENDON
```
2. Activate it:
```
RULE1 1
```
