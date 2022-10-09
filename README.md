
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://img.shields.io/npm/dt/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![npm](https://img.shields.io/npm/v/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/pulls)
[![GitHub issues](https://img.shields.io/github/issues/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/issues)

# Homebridge Tasmota ZbBridge

This plugin can controll devices connected to a Zigbee bridge running [Tasmota](https://tasmota.github.io/docs) software (for example Sonoff [Zigbee Bridge](https://zigbee.blakadder.com/Sonoff_ZBBridge.html) or [Zigbee Bridge Pro](https://zigbee.blakadder.com/Sonoff_ZBBridge-P.html) or other [suported](https://tasmota.github.io/docs/Zigbee) hardware) or [Zigbee2MQTT](https://www.zigbee2mqtt.io) devices.

Devices running Tasmota are also suported (Outlet Switch, Lightbulb, RGB Stripe, Sensor, etc.).

It is possible to combine Tasmota devices - a switch device can turn a Zigbee lamp on and then the dimmer can be changed using Zigbee commands. The lightbulb should be configred to automatically turn on when power is applied.

The plugin uses MQTT commands to control the configured devices. MQTT broker is required.

# Installation

* Flash your device(s) with Tasmota
* Install homebridge `npm install -g homebridge`
* Install the plugin `npm install -g homebridge-tasmota-zbbridge`
* Alternatively use the great [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to install and configure

# Configuration

```
{
    "name": "ZbBridge",
    "zbBridgeDevices": [
        {
            "addr": "0x8E8E",
            "type": "light1",
            "name": "Hue Lamp",
            "powerTopic": "shelly-kitchen",
            "powerType": "POWER2"
        },
        {
            "addr": "0x001788011234567F",
            "type": "light3",
            "name": "Go"
        },
        {
            "addr": "0xAC3C:1",
            "type": "switch",
            "name": "Switch-1",
        },
        {
            "addr": "0xAC3C:2",
            "type": "switch",
            "name": "Switch-2",
        },
        {
            "addr": "0xAD0B",
            "type": "switch",
            "name": "Kitchen Outlet"
        },
        {
            "addr": "0x43D0",
            "type": "sensor",
            "name": "Garage Door",
            "sensorService": "ContactSensor",
            "sensorCharacteristic": "ContactSensorState",
            "sensorValuePath": "Contact"
        },
        {
            "addr": "0x002788011234567F",
            "type": "z2m",
            "name": "Light Bulb"
        },
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

`mqttTopic`- Identifying topic of your Zigbee bridge device (i.e. tasmota_ABCDEF)

`zbBridgeDevices` - Zigbee devices connected to the Zigbee bridge device

* `addr` - Device hardware or short address and optional endpoint (for example Tuya 2ch switch). The hardware address (64 bits) is unique per device and factory assigned so once configured it will still work even if the device have to be paired again. Example: Use `0xAC3C:1` for address 0xAC3C, endpoint 1.
* `type` - Device type (`light0`, `light1`, `light2`, `light3`, `light4`, `light5`, `switch`, `sensor`, `z2m`) see descriptions in `config.schema.json`. Alternatively use generic `light` adding supported features: `_B` for brigthness, `_CT` for color temperature, `_HS` for hue and saturation and `_XY` for XY color support (for example `light_B_CT_XY`). Configure desired `sensor` type using the specific fields below.
* `name` - Accessory name to be used in the Home applicaiton. Should be unique. Will update ZbBridge Friendly Name if endpoint is not used.
* Advanced settings
  * `powerTopic` - (optional) Use another tasmota device to controll the power (configure it's identifying topic)
  * `powerType` - (optional) Tasmota switch topic used to turn on/off the zigbee device, (default: `POWER`)
  * `sensorService` - (optional) Sensor service name as defined [here](https://developers.homebridge.io/#/service) (default: `ContactSensor`)
  * `sensorCharacteristic` - (optional) Service characteristic name (default: `ContactSensorState`)
  * `sensorValuePath` - (optional) Path of the sensor value in the SENSOR message (default: `Contact`).

    For example `CONTACT_DETECTED` will be reported when following message is received:
    ```
    {"ZbReceived":{"0x43D0":{"Device":"0x43D0","Name":"ContactSensorExample","Contact":0,"Endpoint":1,"LinkQuality":66}}}
    ```

`tasmotaDevices` - Tasmota flashed devices

* `topic` - Device topic as configured in the MQTT menu
* `type` - Device type (`POWER`, `StatusSNS.AM2301.Temperature`, `StatusSNS.AM2301.Humidity`, etc.) see descriptions in `config.schema.json`
* `name` - Accessory name to be used in the Home applicaiton. Should be unique.

`mqttBroker` - MQTT Broker hostname if not localhost

`mqttUsername` - MQTT Broker username if passwort protected

`mqttPassword` - MQTT Broker passwort if passwort protected

`z2mBaseTopic` - Zigbee2MQTT base topic (default: zigbee2mqtt)

# Zigbee2MQTT

It is also possible to controll devices using Zigbee2MQTT gateway. This is useful if you want to combine Zigbee and Tasmota devices using the `powerTopic`. Currently only `Switch` and `Lightbulb` accessories are supported. 
Configure the hardware (64 bits) address and select `z2m` as type. Supported features are queried directly from Zigbe2MQTT and configured automatically.

# Binding

You can add switches to HomeKit to control automations or bind them with other devices or groups for direct control.

Note: when a device is bound to a group you have to listen to the group messages for device status updates. By default EZSP will not report group messages unless you subscribe to the group.

IKEA remotes only support 1 group and can be linked to a light only via group numbers (no direct binding).

Type following commands in the tasmota console to bind a switch to a light:

1. Add the light to group 10

```
ZbSend {"Device":"IKEA_Light","Send":{"AddGroup":10}}
```

2. Bind the remote to group 10. Note: you need to press a button on the remote right before sending this command to make sure it's not in sleep mode

```
ZbBind {"Device":"IKEA_Remote","ToGroup":10,"Cluster":6}
```

3. Activate EZSP to listen to the group messages so the HomeKit device is updated each time a group command is received (Not necessary for CC2530 devices)

```
ZbListen1 10
```

You can also bind devices as usual using the link button. Then you have to find out the automatically generated group and activate EZSP to listen to this group:

1. Get all device groups:

```
ZbSend {"Device":"IKEA_Light","Send":{"GetAllGroups":true}}
tele/zbbridge/SENSOR = {"ZbReceived":{"0x303F":{"Device":"0x303F","Name":"IKEA_Light","0004<02":"FF01AFE0","GetGroupCapacity":255,"GetGroupCount":1,"GetGroup":[57519],"Endpoint":1,"LinkQuality":108}}}
```

3. Activate EZSP to listen to the group messages for the reported group (Not necessary for CC2530 devices)

```
ZbListen1 57519
```

The listen commands should be executed after each reboot. Alternatively a rule to execute them when the zigbee is initialized on boot could be created:

1. Create the rule:

```
RULE1 ON ZbState#status=0 DO Backlog ZbListen1 10; ZbListen2 57519 ENDON
```

2. Activate it:

```
RULE1 1
```
