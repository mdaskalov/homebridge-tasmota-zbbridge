
import { TasmotaDeviceDefinition, TasmotaSensorDefinition } from './tasmotaDeviceDefinition';

export const SENSOR_TYPES: TasmotaSensorDefinition[] = [
  { key: 'Temperature', service: 'TemperatureSensor', characteristic: 'CurrentTemperature' },
  { key: 'Humidity', service: 'HumiditySensor', characteristic: 'CurrentRelativeHumidity' },
];

export const DEVICE_TYPES: { [key: string]: TasmotaDeviceDefinition } = {
  SWITCH: { Switch: { On: { get: { cmd: 'POWER{idx}' } } } },
  LIGHTBULB: { Lightbulb: { On: { get: { cmd: 'POWER{idx}' } } } },
  LIGHTBULB_B: {
    Lightbulb: {
      On: { get: { cmd: 'POWER{idx}' } },
      Brightness: { get: { cmd: 'Dimmer' } },
    },
  },
  LIGHTBULB_B_CT: {
    Lightbulb: {
      On: { get: { cmd: 'POWER{idx}' } },
      Brightness: { get: { cmd: 'Dimmer' } },
      ColorTemperature: { get: { cmd: 'CT' }, props: { minValue: 153 } },
    },
  },
  LIGHTBULB_B_HS: {
    Lightbulb: {
      On: { get: { cmd: 'POWER{idx}' } },
      Brightness: { get: { cmd: 'Dimmer' } },
      Hue: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 0 } } },
        set: { cmd: 'HSBColor1', res: { path: 'HSBColor' } },
      },
      Saturation: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 1 } } },
        set: { cmd: 'HSBColor2', res: { path: 'HSBColor' } },
      },
    },
  },
  LIGHTBULB_B_HS_CT: {
    Lightbulb: {
      On: { get: { cmd: 'POWER{idx}' } },
      Brightness: { get: { cmd: 'Dimmer' } },
      Hue: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 0 } } },
        set: { cmd: 'HSBColor1', res: { path: 'HSBColor' } },
      },
      Saturation: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 1 } } },
        set: { cmd: 'HSBColor2', res: { path: 'HSBColor' } },
      },
      ColorTemperature: { get: { cmd: 'CT' }, props: { minValue: 153 } },
    },
  },
  BUTTON: {
    StatelessProgrammableSwitch: {
      ProgrammableSwitchEvent: {
        stat: {
          path: 'Button{idx}.Action',
          update: true,
          mapping: [{ from: 'SINGLE', to: 0 }, { from: 'DOUBLE', to: 1 }, { from: 'HOLD', to: 3 }],
        },
      },
    },
  },
  CONTACT: {
    ContactSensor: {
      ContactSensorState: {
        get: {
          cmd: 'STATUS 10',
          res: { topic: '{stat}/STATUS10', path: 'StatusSNS.Switch{idx}', mapping: [{ from: 'ON', to: 0 }, { from: 'OFF', to: 1 }] },
        },
        stat: { path: 'Switch{idx}.Action' },
      },
    },
  },
  VALVE: {
    Valve: {
      Active: {
        get: { cmd: 'POWER{idx}', res: { shared: true, mapping: [{ from: 'ON', to: 1 }, { from: 'OFF', to: 0 }] } },
      },
      InUse: {
        stat: { path: 'POWER{idx}', mapping: [{ from: 'ON', to: 1 }, { from: 'OFF', to: 0 }] },
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
        get: { cmd: 'POWER{idx}', res: { shared: true, mapping: [{ from: 'ON', to: 1 }, { from: 'OFF', to: 0 }] } },
      },
      LockCurrentState: {
        stat: { path: 'POWER{idx}', mapping: [{ from: 'ON', to: 1 }, { from: 'OFF', to: 0 }] },
      },
    },
  },

  // backward compatibility
  POWER: { Switch: { On: { get: { cmd: 'POWER' } } } },
  POWER1: { Switch: { On: { get: { cmd: 'POWER1' } } } },
  POWER2: { Switch: { On: { get: { cmd: 'POWER2' } } } },
  POWER3: { Switch: { On: { get: { cmd: 'POWER3' } } } },
  POWER4: { Switch: { On: { get: { cmd: 'POWER4' } } } },
  LIGHT: { Lightbulb: { On: { get: { cmd: 'POWER' } } } },
  LIGHT1: { Lightbulb: { On: { get: { cmd: 'POWER1' } } } },
  LIGHT2: { Lightbulb: { On: { get: { cmd: 'POWER2' } } } },
  LIGHT3: { Lightbulb: { On: { get: { cmd: 'POWER3' } } } },
  LIGHT4: { Lightbulb: { On: { get: { cmd: 'POWER4' } } } },
  HSBColor: {
    Lightbulb: {
      On: { get: { cmd: 'POWER{idx}' } },
      Brightness: { get: { cmd: 'Dimmer' } },
      Hue: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 0 } } },
        set: { cmd: 'HSBColor1', res: { path: 'HSBColor' } },
      },
      Saturation: {
        get: { cmd: 'HSBColor', res: { mapping: { index: 1 } } },
        set: { cmd: 'HSBColor2', res: { path: 'HSBColor' } },
      },
    },
  },
  'StatusSNS.AM2301.Temperature': {
    TemperatureSensor: {
      CurrentTemperature: {
        get: { cmd: 'STATUS 10', res: { topic: '{stat}/STATUS10', path: 'StatusSNS.AM2301.Temperature' } },
        stat: { topic: '{sensor}', path: 'AM2301.Temperature' },
      },
    },
  },
  'StatusSNS.AM2301.Humidity': {
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: { cmd: 'STATUS 10', res: { topic: '{stat}/STATUS10', path: 'StatusSNS.AM2301.Humidity' } },
        stat: { topic: '{sensor}', path: 'AM2301.Humidity' },
      },
    },
  },
  'StatusSNS.DHT11.Temperature': {
    TemperatureSensor: {
      CurrentTemperature: {
        get: { cmd: 'STATUS 10', res: { topic: '{stat}/STATUS10', path: 'StatusSNS.DHT11.Temperature' } },
        stat: { topic: '{sensor}', path: 'DHT11.Temperature' },
      },
    },
  },
  'StatusSNS.DHT11.Humidity': {
    HumiditySensor: {
      CurrentRelativeHumidity: {
        get: { cmd: 'STATUS 10', res: { topic: '{stat}/STATUS10', path: 'StatusSNS.DHT11.Humidity' } },
        stat: { topic: '{sensor}', path: 'DHT11.Humidity' },
      },
    },
  },
};
