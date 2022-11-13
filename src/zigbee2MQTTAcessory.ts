import {
  PlatformAccessory,
  CharacteristicValue,
  Service,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { Zigbee2MQTTCharacteristic } from './zigbee2MQTTCharacteristic';

const EXPOSES = {
  // Specific exposes
  light: {
    service: 'Lightbulb', features: {
      state: 'On',
      brightness: 'Brightness',
      color_temp: 'ColorTemperature',
      color_hs: { features: { hue: 'Hue', saturation: 'Saturation' } },
    },
  },
  switch: {
    service: 'Switch', features: {
      state: 'On',
    },
  },
  fan: {
    service: 'Fan', features: {
      state: 'On',
      mode: 'RotationSpeed',
    },
  },
  cover: {
    service: 'WindowCovering', features: {
      state: 'PositionState',
      position: 'CurrentPosition',
      tilt: 'CurrentHorizontalTiltAngle',
    },
  },
  lock: {
    service: 'LockMechanism', features: {
      state: 'LockTargetState',
      lock_state: 'LockCurrentState',
    },
  },
  climate: {
    service: 'Thermostat',
    features: {
      local_temperature: 'CurrentTemperature',
      current_heating_setpoint: 'TargetTemperature',
      occupied_heating_setpoint: 'TargetTemperature',
      system_mode: 'TargetHeatingCoolingState',
      running_state: 'CurrentHeatingCoolingState',
    },
  },
  // Generic exposes
  battery: { service: 'Battery', characteristic: 'BatteryLevel' },
  battery_low: { service: 'Battery', characteristic: 'StatusLowBattery' },
  temperature: { service: 'TemperatureSensor', characteristic: 'CurrentTemperature' },
  humidity: { service: 'HumiditySensor', characteristic: 'CurrentRelativeHumidity' },
  illuminance_lux: { service: 'LightSensor', characteristic: 'CurrentAmbientLightLevel' },
  contact: { service: 'ContactSensor', characteristic: 'ContactSensorState' },
  occupancy: { service: 'OccupancySensor', characteristic: 'OccupancyDetected' },
  vibration: { service: 'MotionSensor', characteristic: 'MotionDetected' },
  smoke: { service: 'SmokeSensor', characteristic: 'SmokeDetected' },
  carbon_monoxide: { service: 'CarbonMonoxideSensor', characteristic: 'CarbonMonoxideDetected' },
  water_leak: { service: 'LeakSensor', characteristic: 'LeakDetected' },
  gas: { service: 'LeakSensor', characteristic: 'LeakDetected' },
};

export type Z2MExpose = {
  type?: string;
  name?: string;
  features?: Z2MExpose[];
  endpoint?: string;
  property: string;
  value_max?: number;
  value_min?: number;
  unit?: string;
  value_off?: string;
  value_on?: string;
  value_step?: number;
  values: string[];
  access: number;
};

export type Z2MDeviceDefinition = {
  description: string;
  exposes: Z2MExpose[];
  model: string;
  options: Z2MExpose[];
  supports_ota: boolean;
  vendor: string;
};

export type Zigbee2MQTTDevice = {
  // Zigbee2MQTT
  ieee_address: string;
  friendly_name: string;
  definition: Z2MDeviceDefinition;
  manufacturer: string;
  model_id: string;
  network_address: number;
  power_source: string;
  software_build_id: string;
  supported: boolean;
  // accessory added
  homekit_name: string;
  powerTopic?: string;
};

export class Zigbee2MQTTAcessory {
  private characteristics = {};
  private device: Zigbee2MQTTDevice;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    this.device = this.accessory.context.device;
    //this.log('device: %s', JSON.stringify(device));
    for (const exposed of this.device.definition.exposes) {
      if (exposed.type !== undefined && exposed.features !== undefined) {
        const specificExpose = EXPOSES[exposed.type];
        const service = this.createService(this.device.homekit_name, specificExpose.service);
        for (const feature of exposed.features) {
          const featureCharacteristic = specificExpose.features[feature.name];
          if (featureCharacteristic !== undefined) {
            if (feature.type === 'composite' && feature.features !== undefined) {
              for (const compositeFeature of feature.features) {
                const compositeCharacteristic = specificExpose.features[feature.name].features[compositeFeature.name];
                this.createCharacteristic(service, compositeCharacteristic, compositeFeature, feature.property);
              }
            } else {
              this.createCharacteristic(service, featureCharacteristic, feature);
            }
          }
        }
      } else if (exposed.name !== undefined) {
        const genericExpose = EXPOSES[exposed.name];
        if (genericExpose !== undefined) {
          const service = this.createService(this.device.homekit_name, genericExpose.service);
          this.createCharacteristic(service, genericExpose.characteristic, exposed);
        }
      }
    }

    const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
    if (infoService !== undefined) {
      const serialNumber = this.device.ieee_address.replace('0x', '').toUpperCase();
      infoService
        .setCharacteristic(this.platform.Characteristic.Manufacturer, this.device.manufacturer)
        .setCharacteristic(this.platform.Characteristic.Model, this.device.model_id)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
      if (this.device.software_build_id) {
        infoService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.software_build_id);
      }
      this.log('Manufacturer: %s, Model: %s',
        this.device.manufacturer,
        this.device.model_id,
      );
    }

    // subscribe to device status updates
    this.platform.mqttClient.subscribeTopic(
      this.platform.config.zigbee2mqttTopic + '/' + this.device.friendly_name, message => {
        this.iterateStateMessage(JSON.parse(message));
      });
    //Subscribe for the power topic updates
    if (this.device.powerTopic !== undefined) {
      this.platform.mqttClient.subscribeTopic('stat/' + this.device.powerTopic, message => {
        this.log('power state changed: %s', message);
        //this.characteristics['state']?.update((message === 'ON'));
      });
      // request initial state
      this.platform.mqttClient.publish('cmnd/' + this.device.powerTopic, '');
    }
    // request initial state
    this.get('state');
  }

  iterateStateMessage(msg: object, path?: string) {
    for (const [key, value] of Object.entries(msg)) {
      if (typeof value === 'object') {
        const ignore = (key === 'color' && msg['color_mode'] === 'color_temp');
        if (!ignore) {
          this.iterateStateMessage(value, key);
        }
      } else {
        const fullPath = (path ? path + '.' : '') + key;
        //this.log(`update for: ${fullPath}: ${value} color_mode: ${msg['color_mode']}`);
        const characteristic = this.getObjectByPath(this.characteristics, fullPath);
        const ignore = (key === 'color_temp' && msg['color_mode'] !== 'color_temp');
        if (!ignore) {
          (<Zigbee2MQTTCharacteristic>characteristic)?.update(this.mapGetValue(key, value));
        }
      }
    }
  }

  createService(homekitName: string, serviceName: string): Service {
    const serviceByName = this.platform.Service[serviceName];
    const service = this.accessory.getService(serviceByName) || this.accessory.addService(serviceByName);
    service.setCharacteristic(this.platform.Characteristic.Name, homekitName);
    //this.log('service: %s', serviceName);
    return service;
  }

  createCharacteristic(service: Service, characteristicName: string, exposed: Z2MExpose, propertyPath?: string) {
    const characteristic = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, service, characteristicName);
    const path = (propertyPath !== undefined ? propertyPath + '.' : '') + exposed.property;
    if ((exposed.access & 2) === 2) {
      characteristic.onGet = () => {
        this.get(path);
        return undefined;
      };
    }
    if ((exposed.access & 3) === 3) {
      characteristic.onSet = value => {
        this.set(path, this.mapSetValue(exposed.property, value));
      };
    }
    //this.log('characteristic: %s (%s)', characteristicName, path);
    //this.log('characteristic: %s (%s) exposed: %s', characteristicName, path, JSON.stringify(exposed));
    this.setObjectByPath(this.characteristics, path, characteristic);
  }

  // homebridge -> Zigbee2MQTT
  mapSetValue(property: string, value: CharacteristicValue): CharacteristicValue {
    switch (property) {
      case 'state': return (value ? 'ON' : 'OFF');
      case 'brightness': return Zigbee2MQTTCharacteristic.mapMaxValue(value as number, 100, 254);
      case 'contact': return !value;
    }
    return value;
  }

  // Zigbee2MQTT -> homebridge
  mapGetValue(property: string, value: CharacteristicValue): CharacteristicValue {
    switch (property) {
      case 'state': return (value === 'ON');
      case 'brightness': return Zigbee2MQTTCharacteristic.mapMaxValue(value as number, 254, 100);
      case 'contact': return !value;
    }
    return value;
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug('%s (%s) ' + message,
      this.device.homekit_name, this.device.ieee_address,
      ...parameters,
    );
  }

  /*
  registerStateHandler() {
    const state = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, this.service, 'On', false);
    state.onGet = () => {
      if (this.powerTopic !== undefined) {
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
      } else {
        this.get('state');
      }
      return undefined;
    };
    state.onSet = value => {
      const state = value ? 'ON' : 'OFF';
      if (this.powerTopic !== undefined) {
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, state);
      } else {
        this.set('state', state);
      }
    };
    this.characteristics['state'] = state;
  }
  */

  getObjectByPath(obj: object, path: string): object | undefined {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  setObjectByPath(obj: object, path: string, value: object | CharacteristicValue) {
    const lastKey = path.substring(path.lastIndexOf('.') + 1);
    path.split('.').reduce((a, v) => a[v] = v === lastKey ? value : a[v] ? a[v] : {}, obj);
  }

  get(path: string) {
    const obj = {};
    this.setObjectByPath(obj, path, '');
    this.platform.mqttClient.publish(
      `${this.platform.config.zigbee2mqttTopic}/${this.accessory.context.device.friendly_name}/get`,
      JSON.stringify(obj),
    );
  }

  set(path: string, value: CharacteristicValue) {
    const obj = {};
    this.setObjectByPath(obj, path, value);
    this.platform.mqttClient.publish(
      `${this.platform.config.zigbee2mqttTopic}/${this.accessory.context.device.friendly_name}/set`,
      JSON.stringify(obj),
    );
  }

}
