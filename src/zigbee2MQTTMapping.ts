export const EXPOSES = {
  // Specific exposes (by exposed.type)
  light: {
    Lightbulb: {
      state: 'On',
      brightness: 'Brightness',
      color_temp: 'ColorTemperature',
      color_hs: {
        hue: 'Hue',
        saturation: 'Saturation',
      },
    },
  },
  switch: {
    Switch: {
      state: 'On',
    },
  },
  fan: {
    Fan: {
      state: 'On',
      mode: 'RotationSpeed',
    },
  },
  cover: {
    WindowCovering: {
      state: 'PositionState',
      position: 'CurrentPosition',
      tilt: 'CurrentHorizontalTiltAngle',
    },
  },
  lock: {
    LockMechanism: {
      state: 'LockTargetState',
      lock_state: 'LockCurrentState',
    },
  },
  climate: {
    Thermostat: {
      local_temperature: 'CurrentTemperature',
      current_heating_setpoint: 'TargetTemperature',
      occupied_heating_setpoint: 'TargetTemperature',
      system_mode: 'TargetHeatingCoolingState',
      running_state: 'CurrentHeatingCoolingState',
    },
  },
  // Generic exposes (by exposed.name)
  action: { StatelessProgrammableSwitch: 'ProgrammableSwitchEvent' },
  battery: { Battery: 'BatteryLevel' },
  battery_low: { Battery: 'StatusLowBattery' },
  temperature: { TemperatureSensor: 'CurrentTemperature' },
  humidity: { HumiditySensor: 'CurrentRelativeHumidity' },
  illuminance_lux: { LightSensor: 'CurrentAmbientLightLevel' },
  contact: { ContactSensor: 'ContactSensorState' },
  occupancy: { OccupancySensor: 'OccupancyDetected' },
  vibration: { MotionSensor: 'MotionDetected' },
  smoke: { SmokeSensor: 'SmokeDetected' },
  carbon_monoxide: { CarbonMonoxideSensor: 'CarbonMonoxideDetected' },
  water_leak: { LeakSensor: 'LeakDetected' },
  gas: { LeakSensor: 'LeakDetected' },
};

export const ENUMS = {
  action: {
    toggle: 0,
    arrow_left_click: 1,
    arrow_left_hold: 1,
    arrow_left_release: 1,
    arrow_right_click: 2,
    arrow_right_hold: 2,
    arrow_right_release: 2,
    brightness_down_click: 1,
    brightness_down_hold: 1,
    brightness_down_release: 1,
    brightness_up_click: 2,
    brightness_up_hold: 2,
    brightness_up_release: 2,
  },
};

export const NOT_MAPPED_CHARACTERISTICS = [
  'ColorTemperature',
];