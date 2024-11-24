# Tasmota Device Definition

To configure custom tasmota device use `TasmotaDeviceDefinition` JSON.<br>
The definition is validated on startup so look for possible errors in the homebridge logs if the device is not added.

## Tasmota Device Definition

Defines services and characteristics which a device should implement and what tasmota commands should be executed to set or update a specific characteristic.

```
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
|`<Service>`|Defines service(s) to the device (accessory).<br>When more than one service of the same type is used, a `<SubType>` should be added.|
|`<Characteristic>`|Adds characteristic(s) to the service.|
|`get`|Tasmota command (see bellow) used to get current characteristic value. Optional if `default` is defined.|
|`set`|(optional) Tasmota command (see below) used to set current characteristic value|
|`props`|(optional) Characteristic properties (such as `unit`, `minValue`, `maxValue`) to be updated on characteristic setup.|
|`default`|(optional) Default value initialized on characteristic setup. Mandatory when `get` is not defined.|

See [here](https://developers.homebridge.io/#/service/AccessCode) which services and characteristics are currently supported in homebridge.

## Tasmota Command

Each device characteristic uses `TasmotaCommand` definitions to communicate with tasmota. These are messages sent to the `cmnd` topic of the device. Each command also defines an expected response containing the characteristic value. Values are mapped between tasmota and homebridge if different values are used. Command definitions could contain variables such as `{topic}`. See below which variables could be used.

```
{
    "cmd": <TasmotaCommand>,
    "res": <TasmotaResponse>
}
```

| Property | Description |
|----------|-------------|
|`cmd`|Sends `<Command>` to the device command topic `cmnd/{topic}/...`.<br> The command could also include payload separated with a space, for example `STATUS 10` sends the message `10` to the topic `cmnd/{topic}/STATUS`.|
|`res`|(optional) Awaits response from tasmota to confirm that the command was executed.<br>See below for explanation how responses are parsed.<br>If not specified the response is expected on the `stat/{topic}/RESULT` topic with the same value path as the comand itself.<br>For example the command `POWER1` will expect response `{"POWER1":"ON"}` on the `stat/{topic}/RESULT` topic.|

## Tasmota Response

Once a command is sent to tasmota the command response is awaited until a timeout is reached. The response is expected on the `<ResponseTopic>`. The value is then extracted using th `ValuePath` from the received message. The homebridge value is then updated with the new value. The value could be optionally maped using `<SplitMapping>` or `<SwapMapping>` definition.

```
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
|`topic`|(optional) Defines the topic where the response should be expected.|
|`path`|(optional) Dot separated path of to extract the value from the response JSON.|
|`update`|(optional) How to update the homebridge value: `undefined`: update if changed, `true`: update always and `false`: update never.|
|`mapping`|(optional) Map values between tasmota and homebridge using `SplitMapping` for splitting a value using separator character or `<SwapMapping>` by definig each possible value.|

## Value Paths

Value paths are used to extract a value from the comand response json.<br>

For example to extract temperature from following `SENSOR` response use `AM2301.Temperature`. To extract humidity use `AM2301.Humidity`.

```
{"Time":"2024-11-24T15:06:56","AM2301":{"Temperature":23.3,"Humidity":33.8,"DewPoint":6.4},"TempUnit":"C"}
```

## Split Mapping

Use split mapping if you want to select a single value from a list of values separated by `<Separator>` at `<Index>` position.

```
{
    "separator": <Separator>,
    "index": <Index>
}

| Property | Description |
|----------|-------------|
|`separator`|(optional) Defines the separator to select the value from a list of values.|
|`index`|Zero based index of the value which should be taken from the list.|

## Swap Mapping

Swap mappings define an array of 'from' (tasmota) and `to` (homebridge) values.

```
[
  { "from": "ON", "to": 0 },
  { "from": "OFF", "to": 1 }
]
```

## Variables

It is possible to use predefined variables for the `cmd`, `topic` and `path` properties.<br>
Here are the defined variables:
| Variable | Description |
|----------|-------------|
|`deviceName`|Configured device name. |
|`topic`|Configured main topic used to control the device.|
|`idx`|Configured device index.|
|`stat`|Default status topic defined as `stat/{topic}`.|
|`sensor`|Default sensor topic defined as `tele/{topic}/SENSOR`.|


## Examples

The simplest definition of a relay on a device as service `Switch` with characteristic `On` looks as follows:

```
{
    "Switch": {
        "On": { "get": { "cmd": "POWER{idx}" }}
    }
}
```

Define two relays on the same devise as two separate `Switch` services. Note that the same service could be used multiple times in a device by adding an unique SubType after the `_` character.

```
{
    "Switch": {
        "On": {"get": {"cmd": "POWER1"}}
    },
    "Switch_2": {
        "On": {"get": {"cmd": "POWER2"}}
    }
}
```

Define a separate white dimmable light on a RGBW light-stripe (4 channels) as service `Lightbulb` with `On` and `Brightness` characteristics.

```
{
    "Lightbulb": {
        "On": {"get": {"cmd": "POWER{idx}"}},
        "Brightness": {
            "get": {"cmd": "HSBColor", "res": {"path": "Dimmer{idx}"}},
            "set": {"cmd": "Dimmer{idx}"}
        }
    }
}
```

Control RGB lightbulb using `HSBColor` command as service `Lightbulb` with `On`, `Hue`, `Saturation` and `Brightness` characteristics.<br>
In the example an index mapping is used to extract the value from the `HSBColor` repsponse.<br>
For example in the response `{"HSBColor":"238,100,79"}` the values are: Hue: 238, Saturation: 100 and Brightness; 79.

```
{
    "Lightbulb": {
        "On": {"get": {"cmd": "POWER{idx}"}},
        "Hue": {
            "get": {"cmd": "HSBColor", "res": {"mapping": {"index": 0}}},
            "set": {"cmd": "HSBColor1", "res": {"path": "HSBColor"}}
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
