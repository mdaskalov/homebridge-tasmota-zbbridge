
import { TasmotaDeviceDefinition } from './tasmotaAccessory';
import { ValueUpdate } from './tasmotaCharacteristic';

export const ACCESSORY_INFORMATION: TasmotaDeviceDefinition = {
  AccessoryInformation: {
    Manufacturer: {
      get: {cmd: 'MODULE0', res: {path: 'Module.0'}},
      stat: {update: ValueUpdate.Never},
      default: 'Tasmota',
    },
    Model: {
      get: {cmd: 'DeviceName'},
      stat: {update: ValueUpdate.Never},
      default: 'Unknown',
    },
    SerialNumber: {
      get: {cmd: 'STATUS 5', res: {topic: '{stat}/STATUS5', path: 'StatusNET.Mac'}},
      stat: {update: ValueUpdate.Never},
      default: 'Unknown',
    },
    FirmwareRevision: {
      get: {cmd: 'STATUS 2', res: {topic: '{stat}/STATUS2', path: 'StatusFWR.Version'}},
      stat: {update: ValueUpdate.Never},
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
  BUTTON: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        stat: {path: 'Button{idx}.Action', update: ValueUpdate.Always},
        mapping: [{from: 'SINGLE', to: 0}, {from: 'DOUBLE', to: 1}, {from: 'HOLD', to: 3}],
      },
    },
  },
  CONTACT: {
    ContactSensor: {
      ContactSensorState: {
        get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: 'StatusSNS.Switch{idx}'}},
        stat: {path: 'Switch{idx}.Action'},
        mapping: [ {from: 'ON', to: 0}, {from: 'OFF', to: 1}],
      },
    },
  },
  VALVE: {
    Valve: {
      Active: {
        get: {cmd: 'POWER{idx}', res: {shared: true}},
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
      },
      InUse: {
        stat: {path: 'POWER{idx}'},
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
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
        get: {cmd: 'POWER{idx}', res: {shared: true}},
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
      },
      LockCurrentState: {
        stat: {path: 'POWER{idx}'},
        mapping: [ {from: 'ON', to: 1}, {from: 'OFF', to: 0}],
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
