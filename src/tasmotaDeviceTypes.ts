
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
  SWITCH: {Switch: {On: {get: {cmd:'POWER'}}}},
  SWITCH1: {Switch: {On: {get: {cmd:'POWER1'}}}},
  SWITCH2: {Switch: {On: {get: {cmd:'POWER2'}}}},
  SWITCH3: {Switch: {On: {get: {cmd:'POWER3'}}}},
  SWITCH4: {Switch: {On: {get: {cmd:'POWER4'}}}},
  LIGHT: {Lightbulb: {On: {get:{cmd: 'POWER'}}}},
  LIGHT1: {Lightbulb: {On: {get:{cmd: 'POWER1'}}}},
  LIGHT2: {Lightbulb: {On: {get:{cmd: 'POWER2'}}}},
  LIGHT3: {Lightbulb: {On: {get:{cmd: 'POWER3'}}}},
  LIGHT4: {Lightbulb: {On: {get:{cmd: 'POWER4'}}}},
  LIGHT_B: {
    Lightbulb: {
      On: {get: {cmd:'POWER'}},
      Brightness: {get: {cmd:'Dimmer'}},
    },
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
  BUTTON2: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        statValuePath: 'Button2.Action',
        statUpdate: StatUpdate.Always,
        mapping: [ {from: 'SINGLE', to: 0}, {from: 'DOUBLE', to: 1}, {from: 'HOLD', to: 3}],
      },
    },
  },
  BUTTON3: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        statValuePath: 'Button3.Action',
        statUpdate: StatUpdate.Always,
        mapping: [ {from: 'SINGLE', to: 0}, {from: 'DOUBLE', to: 1}, {from: 'HOLD', to: 3}],
      },
    },
  },
  BUTTON4: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        statValuePath: 'Button4.Action',
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
  CONTACT2: {
    ContactSensor: {
      ContactSensorState: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.Switch2'},
        statValuePath: 'Switch2.Action',
        teleValuePath: 'Switch2',
        mapping: [ {from: 'ON', to: 0}, {from: 'OFF', to: 1}],
      },
    },
  },
  CONTACT3: {
    ContactSensor: {
      ContactSensorState: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.Switch3'},
        statValuePath: 'Switch3.Action',
        teleValuePath: 'Switch3',
        mapping: [ {from: 'ON', to: 0}, {from: 'OFF', to: 1}],
      },
    },
  },
  CONTACT4: {
    ContactSensor: {
      ContactSensorState: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.Switch4'},
        statValuePath: 'Switch4.Action',
        teleValuePath: 'Switch4',
        mapping: [ {from: 'ON', to: 0}, {from: 'OFF', to: 1}],
      },
    },
  },
  VALVE: {
    Valve: {
      Active: {
        get: {cmd: 'POWER', shareResponseMessage: true},
        set: {cmd: 'POWER', shareResponseMessage: true},
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
      },
      InUse: {
        statValuePath: 'POWER',
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
      },
      ValveType: {
        defaultValue: 3,
      },
      RemainingDuration: {
        defaultValue: 3600,
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
  DHT11_TH: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.DHT11.Temperature'},
        teleValuePath: 'DHT11.Temperature',
        statUpdate: StatUpdate.Never,
      },
    },
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.DHT11.Humidity'},
        teleValuePath: 'DHT11.Humidity',
        statUpdate: StatUpdate.Never,
      },
    },
  },
  ANALOG_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.ANALOG.Temperature'},
        teleValuePath: 'ANALOG.Temperature',
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
  BMP280_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.BMP280.Temperature'},
        teleValuePath: 'BMP280.Temperature',
        statUpdate: StatUpdate.Never,
      },
    },
  },
  DS18B20_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.DS18B20.Temperature'},
        teleValuePath: 'DS18B20.Temperature',
        statUpdate: StatUpdate.Never,
      },
    },
  },
  HTU21_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', topic: 'STATUS10', valuePath: 'StatusSNS.HTU21.Temperature'},
        teleValuePath: 'HTU21.Temperature',
        statUpdate: StatUpdate.Never,
      },
    },
  },
};
