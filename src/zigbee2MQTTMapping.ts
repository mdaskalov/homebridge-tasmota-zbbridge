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
