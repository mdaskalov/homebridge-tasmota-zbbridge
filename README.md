
<p align="center">

<img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-color-round-stylized.png" width="150">

</p>

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://img.shields.io/npm/dt/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![npm](https://img.shields.io/npm/v/homebridge-tasmota-zbbridge.svg)](https://www.npmjs.com/package/homebridge-tasmota-zbbridge)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/pulls)
[![GitHub issues](https://img.shields.io/github/issues/mdaskalov/homebridge-tasmota-zbbridge.svg)](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/issues)

# Homebridge Tasmota Zigbee Bridge

This Homebridge plugin can controll [Tasmota](https://tasmota.github.io/docs) or Zigbee devices connected to a MQTT broker.

Devices flashed with Tasmota firmware (Outlet Switch, Lightbulb, RGB Stripe, Button, Contact Sensor, Valve, Lock Mechanism, Sensor, etc.) are suported directly. Zigbee devices can be controlled using [Zigbee2Tasmota](https://tasmota.github.io/docs/Zigbee) or [Zigbee2MQTT](https://www.zigbee2mqtt.io) gateway/bridge.

By configuring a `powerTopic` it is possible to combine devices to a singe HomeKit appliance - Tasmota controlled switch can turn on a Zigbee lightbulb and then change the brightness or the collor over the Zigbee network (the lightbulb should be configured to turn on automatically when power is applied).

# Installation

* Flash your device(s) with Tasmota
* Install homebridge `npm install -g homebridge`
* Install the plugin `npm install -g homebridge-tasmota-zbbridge`
* Alternatively use the great [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to install and configure

# Configuration

``` json
{
    "name": "ZbBridge",
    "zigbee2TasmotaDevices": [
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
            "addr": "0xD394",
            "type": "sensor",
            "name": "Sensor3",
            "sensorService": "StatelessProgrammableSwitch",
            "sensorValuePath": "Click",
            "sensorValueMapping": [
                { "from": "single", "to": "0" },
                { "from": "double",  "to": "1" },
                { "from": "hold", "to": "2" }
            ]
        }
    ],
    "zigbee2mqttDevices": [
        {
            "ieee_address": "0x002788011234567F",
            "name": "Light Bulb"
        }
    ],
    "tasmotaDevices": [
        {
            "topic": "sonoff",
            "type": "SWITCH",
            "name": "SonoffTM"
        },
        {
            "topic": "sonoff",
            "type": "SENSOR",
            "name": "SonoffTM TH Sensor"
        },
        {
            "topic": "sonoff-4ch",
            "type": "SWITCH",
            "index": 2,
            "name": "Sonoff 4CH Channel 2"
        }
    ],
    "mqttBroker": "raspi2",
    "zigbee2tasmotaTopic": "zbbridge",
    "zigbee2mqttTopic": "zigbee2mqtt",
    "ignoreTimeouts": true,
    "ignoreUnexpected": true,
    "platform": "TasmotaZbBridge"
}
```

`zigbee2TasmotaDevices` - Zigbee devices connected to the Zigbee2Tasmota gateway/bridge

* `addr` - Device hardware or short address and optional endpoint (for example Tuya 2ch switch). The hardware address (64 bits) is unique per device and factory assigned so once configured it will still work even if the device have to be paired again. Example: Use `0xAC3C:1` for address 0xAC3C, endpoint 1.
* `type` - Device type (`light0`, `light1`, `light2`, `light3`, `light4`, `light5`, `switch`, `sensor`) see descriptions in `config.schema.json`. Alternatively use generic `light` adding supported features: `_B` for brigthness, `_CT` for color temperature, `_HS` for hue and saturation and `_XY` for XY color support (for example `light_B_CT_XY`). Configure desired `sensor` type using the specific fields below.
* `name` - Accessory name to be used in the Home applicaiton. Should be unique. Will update ZbBridge Friendly Name if endpoint is not used.
* Advanced settings
  * `powerTopic` - (optional) Use another tasmota device to controll the power (configure it's identifying topic)
  * `powerType` - (optional) Tasmota switch topic used to turn on/off the zigbee device, (default: `POWER`)
  * `sensorService` - (optional) Sensor service name as defined [here](https://developers.homebridge.io/#/service) (default: `ContactSensor`)
  * `sensorCharacteristic` - (optional) Service characteristic name (default: `ContactSensorState`)
  * `sensorValuePath` - (optional) Path of the sensor value in the SENSOR message (default: `Contact`).
  * `sensorValueMapping` - (optional) Map sensor `from` value to homebridge `to` value. All other values will be ignored.

    For example `CONTACT_DETECTED` will be reported when following message is received:
    ```json
    {"ZbReceived":{"0x43D0":{"Device":"0x43D0","Name":"ContactSensorExample","Contact":0,"Endpoint":1,"LinkQuality":66}}}
    ```

`zigbee2mqttDevices` - Zigbee devices connected to Zigbee2MQTT gateway/bridge

* `ieee_address`
* `name` - Accessory name to be used in the Home applicaiton. Should be unique.
* `powerTopic` - (optional) Use another tasmota device to controll the power (configure it's identifying topic)
* `powerType` - (optional) Tasmota switch topic used to turn on/off the zigbee device, (default: `POWER`)

`tasmotaDevices` - Tasmota flashed devices

* `topic` - Topic to control the device as configured in the "Configure MQTT" menu on the device web-interface.
* `type` - Device type (`SIWTCH`, `LIGHTBULB`, `BUTTON`, `CONTACT`, `VALVE`, `LOCK`, `SENSOR`, `CUSTOM`, etc.)
* `index` - (optiona) Optional index used to control the device. (`POWER1`, `POWER2`, `Switch1`, `Switch2`, etc.)
* `custom` - (optional) Custom device definition (when `type='CUSTOM'`) as JSON string. See [here](https://github.com/mdaskalov/homebridge-tasmota-zbbridge/blob/main/doc/TasmotaDeviceDefinition.md) for details.
* `name` - Accessory name to be used in the Home applicaiton. Should be unique.

`mqttBroker` - MQTT Broker hostname if not localhost

`mqttUsername` - MQTT Broker username if password protected

`mqttPassword` - MQTT Broker passwort if password protected

`zigbee2tasmotaTopic` - Zigbee2Tasmota gateway/bridge base topic (default: zbbridge)

`zigbee2mqttTopic` - Zigbee2MQTT gateway/bridge base topic (default: zigbee2mqtt)

`ignoreTimeouts` - (optional) Ignore MQTT command response timeouts (default: true)

`ignoreUnexpected` - (optional) Ignore unexpected response messages while waiting for a MQTT command response (default: true)

# Zigbee2MQTT

It is also possible to controll devices using Zigbee2MQTT gateway/bridge. This is useful if you want to combine Zigbee and Tasmota devices using the `powerTopic`.

Almost all accessory-types are supported but currently some characteristics are not mapped correctly (work in progress). Supported features are queried directly from Zigbe2MQTT and configured automatically.
