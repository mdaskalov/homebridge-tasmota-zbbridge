# Tasmota Device Definition

To configure a custom Tasmota device, use the `TasmotaDeviceDefinition` JSON format.<br>
The definition is validated on startup, so check the Homebridge logs for possible errors if the device is not added successfully.

## Tasmota Device Definition

Defines the services and characteristics that a device should implement, as well as the Tasmota commands to set or update specific characteristics.

```json
{
    "<Service>[_<SubType>]": {
        "<Characteristic>": {
            "get": <TasmotaCommand>,
            "set": <TasmotaCommand>,
            "stat": <TasmotaResponse>,
            "props": <CharacteristicProperty>,
            "default": <CharacteristicValue>
        }
    }
}
```

| Property | Description |
|----------|-------------|
| `<Service>` | Defines service(s) for the device (accessory).<br>When more than one service of the same type is used, a `<SubType>` should be added. |
| `<Characteristic>` | Adds characteristic(s) to the service. |
| `get` | Tasmota command (see below) used to retrieve the current characteristic value. Optional if `default` is defined. |
| `set` | (optional) Tasmota command (see below) used to set the characteristic value. |
| `props` | (optional) Characteristic properties (such as `unit`, `minValue`, `maxValue`) to be updated during characteristic setup. |
| `default` | (optional) Default value initialized during characteristic setup. Mandatory if `get` is not defined. |

See [here](https://developers.homebridge.io/#/service/AccessCode) for a list of supported services and characteristics in Homebridge.

## Tasmota Command

Each device characteristic uses `TasmotaCommand` definitions to communicate with Tasmota.<br>
These are messages sent to the `cmnd` topic of the device. Each command also defines an expected response containing the characteristic value.<br>
Values can be mapped between Tasmota and Homebridge if different values are used. Command definitions may include variables such as `{topic}`. See below for available variables.

```json
{
    "cmd": <TasmotaCommand>,
    "res": <TasmotaResponse>
}
```

| Property | Description |
|----------|-------------|
| `cmd` | Sends `<Command>` to the device command topic `cmnd/{topic}/...`.<br>The command may include a payload separated by a space. For example, `STATUS 10` sends the message `10` to the topic `cmnd/{topic}/STATUS`. |
| `res` | (optional) Awaits a response from Tasmota to confirm command execution.<br>See below for details on how responses are parsed.<br>If not specified, the response is expected on the `stat/{topic}/RESULT` topic with the same value path as the command itself.<br>For example, the command `POWER1` will expect the response `{"POWER1":"ON"}` on the `stat/{topic}/RESULT` topic. |

## Tasmota Response

When a command is sent to Tasmota, the plugin waits for a response until a timeout is reached. The response is expected on the `<ResponseTopic>`. The value is extracted using the `ValuePath` from the received message, and the Homebridge value is updated accordingly. Optionally, values can be mapped using a `<SplitMapping>` or `<SwapMapping>` definition.

```json
{
    "topic": <ResponseTopic>,
    "path": <ValuePath>,
    "update": <undefined|true|false>,
    "shared": <undefined|true|false>,
    "mapping": <SplitMapping|SwapMapping>
}
```

| Property | Description |
|----------|-------------|
| `topic` | (optional) Defines the topic where the response should be expected. |
| `path` | (optional) Dot-separated path to extract the value from the response JSON. |
| `update` | (optional) Specifies how to update the Homebridge value:<br>`undefined`: update if changed,<br>`true`: always update,<br>`false`: never update. |
| `mapping` | (optional) Maps values between Tasmota and Homebridge using a `SplitMapping` for splitting a value using a separator character or a `SwapMapping` by defining each possible value. |

## Value Paths

Value paths are used to extract a value from the command response JSON.<br>
For example, to extract temperature from the following `SENSOR` response, use `AM2301.Temperature`. To extract humidity, use `AM2301.Humidity`.

```json
{"Time":"2024-11-24T15:06:56","AM2301":{"Temperature":23.3,"Humidity":33.8,"DewPoint":6.4},"TempUnit":"C"}
```

## Split Mapping

Use split mapping to select a single value from a list of values separated by `<Separator>` at `<Index>` position.

```json
{
    "separator": <Separator>,
    "index": <Index>
}
```

| Property | Description |
|----------|-------------|
| `separator` | (optional) Defines the separator to select a value from a list of values. |
| `index` | Zero-based index of the value to be extracted from the list. |

## Swap Mapping

Swap mappings define an array of `from` (Tasmota) and `to` (Homebridge) values.

```json
[
  { "from": "ON", "to": 0 },
  { "from": "OFF", "to": 1 }
]
```

## Variables

Predefined variables can be used for the `cmd`, `topic`, and `path` properties.<br>
Here are the defined variables:

| Variable | Description |
|----------|-------------|
| `deviceName` | Configured device name. |
| `topic` | Configured main topic used to control the device. |
| `idx` | Configured device index. |
| `stat` | Default status topic defined as `stat/{topic}`. |
| `sensor` | Default sensor topic defined as `tele/{topic}/SENSOR`. |

## Examples

### Single Relay as a Switch
The simplest definition of a relay on a device as a service `Switch` with a characteristic `On`:

```json
{
    "Switch": {
        "On": { "get": { "cmd": "POWER{idx}" } }
    }
}
```

### Multiple Relays on a Single Device
Define two relays on the same device as separate `Switch` services. Note that the same service can be used multiple times on a device by adding a unique SubType after the `_` character.

```json
{
    "Switch": {
        "On": { "get": { "cmd": "POWER1" } }
    },
    "Switch_2": {
        "On": { "get": { "cmd": "POWER2" } }
    }
}
```

### Dimmable White Light
Define a white dimmable light on an RGBW light-strip (4 channels) as a service `Lightbulb` with `On` and `Brightness` characteristics:

```json
{
    "Lightbulb": {
        "On": { "get": { "cmd": "POWER{idx}" } },
        "Brightness": {
            "get": { "cmd": "HSBColor", "res": { "path": "Dimmer{idx}" } },
            "set": { "cmd": "Dimmer{idx}" }
        }
    }
}
```

### RGB Lightbulb
Control an RGB lightbulb using the `HSBColor` command as a service `Lightbulb` with `On`, `Hue`, `Saturation`, and `Brightness` characteristics.<br>
In this example, an index mapping is used to extract values from the `HSBColor` response.<br>
For example, in the response `{"HSBColor":"238,100,79"}`, the values are: Hue: 238, Saturation: 100, and Brightness: 79.

```json
{
    "Lightbulb": {
        "On": { "get": { "cmd": "POWER{idx}" } },
        "Hue": {
            "get": { "cmd": "HSBColor", "res": { "mapping": { "index": 0 } } },
            "set": { "cmd": "HSBColor1", "res": { "path": "HSBColor" } }
        },
        "Saturation": {
            "get": {"cmd": "HSBColor", "res": {"mapping": {"index": 1}}},
            "set": {"cmd": "HSBColor2", "res": {"path": "HSBColor"}}
        },
        "Brightness": {
            "get": {"cmd": "HSBColor", "res": {"mapping": {"index": 2}}},
            "set": {"cmd": "HSBColor3", "res": {"path": "HSBColor"}}
        }
    }
}
```