
import { TasmotaDeviceDefinition } from './tasmotaAccessory';

export const ACCESSORY_INFORMATION: TasmotaDeviceDefinition = {
  AccessoryInformation: {
    Manufacturer: {
      get: {cmd: 'MODULE0', res: {path: 'Module.0'}},
      stat: {update: false},
      default: 'Tasmota',
    },
    Model: {
      get: {cmd: 'DeviceName'},
      stat: {update: false},
      default: '{deviceName}',
    },
    SerialNumber: {
      get: {cmd: 'STATUS 5', res: {topic: '{stat}/STATUS5', path: 'StatusNET.Mac'}},
      stat: {update: false},
      default: 'Unknown',
    },
    FirmwareRevision: {
      get: {cmd: 'STATUS 2', res: {topic: '{stat}/STATUS2', path: 'StatusFWR.Version', mapping: {separator: '(', index: 0}}},
      stat: {update: false},
      default: 'Unknown',
    },
  },
};

export const DEVICE_TYPES: { [key: string] : TasmotaDeviceDefinition } = {
  SWITCH: {Switch: {On: {get: {cmd: 'POWER{idx}'}}}},
  LIGHT: {Lightbulb: {On: {get:{cmd: 'POWER{idx}'}}}},
  LIGHT_B: {
    Lightbulb: {
      On: {get: {cmd: 'POWER{idx}'}},
      Brightness: {get: {cmd: 'Dimmer'}},
    },
  },
  LIGHT_B_CT: {
    Lightbulb: {
      On: {get: {cmd: 'POWER{idx}'}},
      Brightness: {get: {cmd: 'Dimmer'}},
      ColorTemperature: {get: {cmd: 'CT'}, props: {minValue: 153}},
    },
  },
  LIGHT_B_HS: {
    Lightbulb: {
      On: {get: {cmd: 'POWER{idx}'}},
      Brightness: {get: {cmd: 'Dimmer'}},
      Hue: {
        get: {cmd: 'HSBColor', res: {mapping: {index: 0}}},
        set: {cmd: 'HSBColor1', res: {path: 'HSBColor'}},
      },
      Saturation: {
        get: {cmd: 'HSBColor', res: {mapping: {index: 1}}},
        set: {cmd: 'HSBColor2', res: {path: 'HSBColor'}},
      },
    },
  },
  LIGHT_B_HS_CT: {
    Lightbulb: {
      On: {get: {cmd: 'POWER{idx}'}},
      Brightness: {get: {cmd: 'Dimmer'}},
      Hue: {
        get: {cmd: 'HSBColor', res: {mapping: {index: 0}}},
        set: {cmd: 'HSBColor1', res: {path: 'HSBColor'}},
      },
      Saturation: {
        get: {cmd: 'HSBColor', res: {mapping: {index: 1}}},
        set: {cmd: 'HSBColor2', res: {path: 'HSBColor'}},
      },
      ColorTemperature: {get: {cmd: 'CT'}, props: {minValue: 153}},
    },
  },
  BUTTON: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        stat: {
          path: 'Button{idx}.Action',
          update: true,
          mapping: [{from: 'SINGLE', to: 0}, {from: 'DOUBLE', to: 1}, {from: 'HOLD', to: 3}],
        },
      },
    },
  },
  CONTACT: {
    ContactSensor: {
      ContactSensorState: {
        get: {
          cmd: 'STATUS 10',
          res: {topic: '{stat}/STATUS10', path: 'StatusSNS.Switch{idx}', mapping: [{from: 'ON', to: 0}, {from: 'OFF', to: 1}]},
        },
        stat: {path: 'Switch{idx}.Action'},
      },
    },
  },
  VALVE: {
    Valve: {
      Active: {
        get: {cmd: 'POWER{idx}', res: {shared: true, mapping: [{from: 'ON', to: 1}, {from: 'OFF', to: 0}]}},
      },
      InUse: {
        stat: {path: 'POWER{idx}', mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}]},
      },
      ValveType: {
        default: 3,
      },
      RemainingDuration: {
        default: 3600,
      },
    },
  },
  LOCK: {
    LockMechanism: {
      LockTargetState: {
        get: {cmd: 'POWER{idx}', res: {shared: true, mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}]}},
      },
      LockCurrentState: {
        stat: {path: 'POWER{idx}', mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}]},
      },
    },
  },
  AM2301_TH: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.AM2301.Temperature'}},
        stat: {topic: '{sensor}', path: 'AM2301.Temperature'},
      },
    },
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.AM2301.Humidity'}},
        stat: {topic: '{sensor}', path: 'AM2301.Humidity'},
      },
    },
  },
  DHT11_TH: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.DHT11.Temperature'}},
        stat: {topic: '{sensor}', path: 'DHT11.Temperature'},
      },
    },
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.DHT11.Humidity'}},
        stat: {topic: '{sensor}', path: 'DHT11.Humidity'},
      },
    },
  },
  ANALOG_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.ANALOG.Temperature'}},
        stat: {topic: '{sensor}', path: 'ANALOG.Temperature'},
      },
    },
  },
  AXP192_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.AXP192.Temperature'}},
        stat: {topic: '{sensor}', path: 'AXP192.Temperature'},
      },
    },
  },
  BMP280_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.BMP280.Temperature'}},
        stat: {topic: '{sensor}', path: 'BMP280.Temperature'},
      },
    },
  },
  DS18B20_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.DS18B20.Temperature'}},
        stat: {topic: '{sensor}', path: 'DS18B20.Temperature'},
      },
    },
  },
  HTU21_T: {
    TemperatureSensor: {
      CurrentTemperature: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.HTU21.Temperature'}},
        stat: {topic: '{sensor}', path: 'HTU21.Temperature'},
      },
    },
  },
};
