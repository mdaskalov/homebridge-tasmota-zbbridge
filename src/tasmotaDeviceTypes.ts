
import { TasmotaDeviceDefinition } from './tasmotaAccessory';

export const ACCESSORY_INFORMATION: TasmotaDeviceDefinition = {
  AccessoryInformation: {
    Manufacturer: {
      get: {cmd: 'MODULE0', valuePath: 'Module.0'},
      defaultValue: 'Tasmota',
      statDisabled: true,
    },
    Model: {
      get: {cmd: 'DeviceName'},
      defaultValue: 'Unknown',
      statDisabled: true,
    },
    SerialNumber: {
      get: {cmd: 'STATUS 5', topic: 'STATUS5', valuePath: 'StatusNET.Mac'},
      defaultValue: 'Unknown',
      statDisabled: true,
    },
    FirmwareRevision: {
      get: {cmd: 'STATUS 2', topic: 'STATUS2', valuePath: 'StatusFWR.Version'},
      defaultValue: 'Unknown',
      statDisabled: true,
    },
  },
};

export const DEVICE_TYPES: { [key: string] : TasmotaDeviceDefinition } = {
  POWER: {
    Switch: {On: {get: {cmd:'POWER'}}},
  },
  LIGHT: {
    Lightbulb: {On: {get:{cmd: 'POWER'}}},
  },
  LIGHT_B: {
    Lightbulb: {
      On: {get: {cmd:'POWER'}},
      Brightness: {get: {cmd:'Dimmer'}},
    },
  },
  CONTACT1: {
    ContactSensor: {
      ContactSensorState: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.Switch1'},
        statValuePath: 'Switch1.Action',
        teleValuePath: 'Switch1',
        mapping: [ {from: 'ON', to: 0}, {from: 'OFF', to: 1}],
      },
    },
  },
  AM2301_TH: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.AM2301.Temperature'},
        teleValuePath: 'AM2301.Temperature',
        statDisabled: true,
      },
    },
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.AM2301.Humidity'},
        teleValuePath: 'AM2301.Humidity',
        statDisabled: true,
      },
    },
  },
};
