
import { TasmotaDeviceDefinition } from './tasmotaAccessory';
import { StatUpdate } from './tasmotaCharacteristic';

export const ACCESSORY_INFORMATION: TasmotaDeviceDefinition = {
  AccessoryInformation: {
    Manufacturer: {
      get: {cmd: 'MODULE0', valuePath: 'Module.0'},
      defaultValue: 'Tasmota',
      statUpdate: StatUpdate.Never,
    },
    Model: {
      get: {cmd: 'DeviceName'},
      defaultValue: 'Unknown',
      statUpdate: StatUpdate.Never,
    },
    SerialNumber: {
      get: {cmd: 'STATUS 5', topic: 'STATUS5', valuePath: 'StatusNET.Mac'},
      defaultValue: 'Unknown',
      statUpdate: StatUpdate.Never,
    },
    FirmwareRevision: {
      get: {cmd: 'STATUS 2', topic: 'STATUS2', valuePath: 'StatusFWR.Version'},
      defaultValue: 'Unknown',
      statUpdate: StatUpdate.Never,
    },
  },
};

export const DEVICE_TYPES: { [key: string] : TasmotaDeviceDefinition } = {
  LIGHT: {
    Lightbulb: {On: {get:{cmd: 'POWER'}}},
  },
  LIGHT_B: {
    Lightbulb: {
      On: {get: {cmd:'POWER'}},
      Brightness: {get: {cmd:'Dimmer'}},
    },
  },
  SWITCH1: {
    Switch: {On: {get: {cmd:'POWER'}}},
  },
  BUTTON1: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        statValuePath: 'Button1.Action',
        statUpdate: StatUpdate.Always,
        mapping: [ {from: 'SINGLE', to: 0}, {from: 'DOUBLE', to: 1}, {from: 'HOLD', to: 3}],
      },
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
        statUpdate: StatUpdate.Never,
      },
    },
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.AM2301.Humidity'},
        teleValuePath: 'AM2301.Humidity',
        statUpdate: StatUpdate.Never,
      },
    },
  },
  AXP192_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.AXP192.Temperature'},
        teleValuePath: 'AXP192.Temperature',
        statUpdate: StatUpdate.Never,
      },
    },
  },
};
