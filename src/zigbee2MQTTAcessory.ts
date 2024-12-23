import {
  PlatformAccessory,
  CharacteristicValue,
  Service,
  AdaptiveLightingController,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { Zigbee2MQTTCharacteristic } from './zigbee2MQTTCharacteristic';
import { EXPOSES } from './zigbee2MQTTMapping';

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
};

export class Zigbee2MQTTAcessory {
  private characteristics = {};
  private device: Zigbee2MQTTDevice;
  private adaptiveLightingController?: AdaptiveLightingController;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly usePowerManager: boolean,
  ) {
    this.device = this.accessory.context.device;
    //this.log('device: %s', JSON.stringify(device));

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

    for (const expose of this.device.definition.exposes) {
      //this.log('exposed: %s', JSON.stringify(expose));
      const mapped = this.mapExpose(expose, EXPOSES);
      if (!mapped) {
        this.log('Ignore: %s', expose.name || expose.property);
      }
    }

    // subscribe to device status updates
    this.platform.mqttClient.subscribe(
      this.platform.config.zigbee2mqttTopic + '/' + this.device.friendly_name, message => {
        if (this.usePowerManager && !this.platform.powerManager.isOn(this.device.ieee_address)) {
          this.log('Ingored Zigbee2MQTT status update (device powered off)');
          return;
        }
        this.iterateStateMessage(JSON.parse(message));
      });
    // request initial state of all characteristics
    const obj = this.getAllCharacteristics(this.characteristics);
    this.platform.mqttClient.publish(
      `${this.platform.config.zigbee2mqttTopic}/${this.device.friendly_name}/get`,
      JSON.stringify(obj),
    );
  }

  disableAdaptiveLighting() {
    if (this.adaptiveLightingController) {
      this.adaptiveLightingController.disableAdaptiveLighting();
    }
  }

  mapExpose(expose: Z2MExpose, mapDefinition: object): boolean {
    let mapped = false;
    const definitionProperty = expose.name ? expose.name : expose.type;
    if (definitionProperty !== undefined) {
      const exposeMapDefinition = mapDefinition[definitionProperty];
      if (exposeMapDefinition !== undefined) {
        for (const [serviceName, characteristic] of Object.entries(exposeMapDefinition)) {
          const service = this.createService(serviceName);
          if (this.mapCharacteristic(service, characteristic, expose)) {
            mapped = true;
          }
        }
      }
    }
    return mapped;
  }

  mapCharacteristic(service: Service, characteristic: unknown, expose: Z2MExpose, propertyPath?: string): boolean {
    let mapped = false;
    if (typeof characteristic === 'string') {
      this.createCharacteristic(service, characteristic, expose, propertyPath);
      mapped = true;
    } else if (characteristic !== null && typeof characteristic === 'object' && expose.features !== undefined) {
      for (const feature of expose.features) {
        if (feature.name !== undefined && characteristic[feature.name] !== undefined) {
          if (feature.type === 'composite' && feature.features !== undefined) {
            const path = (propertyPath !== undefined ? propertyPath + '.' : '') + feature.property;
            if (this.mapCharacteristic(service, characteristic[feature.name], feature, path)) {
              mapped = true;
            }
          } else {
            this.createCharacteristic(service, characteristic[feature.name], feature, propertyPath);
            mapped = true;
          }
        } else {
          this.log('Ignore: %s', feature.name || feature.property);
        }
      }
    }
    return mapped;
  }

  getAllCharacteristics(src: object, path?: string): object {
    const obj = {};
    for (const [key, value] of Object.entries(src)) {
      const fullPath = (path ? path + '.' : '') + key;
      const valueIsCharacteristic = (value instanceof Zigbee2MQTTCharacteristic);
      this.setObjectByPath(obj, fullPath, valueIsCharacteristic ? '' : this.getAllCharacteristics(value));
    }
    return obj;
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
        const characteristic = <Zigbee2MQTTCharacteristic>this.getObjectByPath(this.characteristics, fullPath);
        const ignore = (key === 'color_temp' && msg['color_mode'] !== 'color_temp');
        if (characteristic && !ignore) {
          if (fullPath === 'state' && this.usePowerManager) {
            this.platform.powerManager.setState(this.device.ieee_address, (value === 'ON'));
          } else {
            const updated = characteristic.update(value);
            if (updated && ['color_temp', 'color.hue', 'color.saturation'].indexOf(fullPath) >= 0) {
              this.log('updated %s - disableAdaptiveLighting...', fullPath);
              this.disableAdaptiveLighting();
            }
          }
        }
      }
    }
  }

  createService(serviceName: string, customName?: string): Service {
    const serviceByName = this.platform.Service[serviceName];
    const service = this.accessory.getService(serviceByName) || this.accessory.addService(serviceByName);
    const homekitName = this.device.homekit_name + (customName ? ':' + customName : '');
    service.setCharacteristic(this.platform.Characteristic.Name, homekitName);
    return service;
  }

  createCharacteristic(service: Service, characteristicName: string, exposed: Z2MExpose, propertyPath?: string) {
    const characteristic = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, service, characteristicName, exposed);
    const path = (propertyPath !== undefined ? propertyPath + '.' : '') + exposed.property;
    const hasReadAccess = (exposed.access & 2) === 2;
    const hasWriteAccess = (exposed.access & 3) === 3;
    if (hasReadAccess) {
      characteristic.onGet = () => {
        if (path === 'state' && this.usePowerManager) {
          const state = this.platform.powerManager.getState(this.device.ieee_address);
          if (state === false || (path === 'state' && state !== undefined)) {
            return undefined;
          }
        }
        this.get(path);
        return undefined;
      };
    }
    if (hasWriteAccess) {
      characteristic.onSet = value => {
        if (path === 'state' && this.usePowerManager) {
          const state = value === 'ON';
          // power off on update
          if (state === true && this.platform.powerManager.setState(this.device.ieee_address, state)) {
            return;
          }
        }
        this.set(path, value);
      };
    }

    if (exposed.property === 'color_temp' && hasReadAccess && hasWriteAccess) {
      this.adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(service, {
        controllerMode: this.platform.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
      });
      if (this.adaptiveLightingController) {
        this.accessory.configureController(this.adaptiveLightingController);
      }
    }

    const permissions = (hasReadAccess ? 'R' : '') + (hasWriteAccess ? 'W' : '');
    this.log('Map: %s(%s) -> %s:%s(%s)', exposed.name, permissions, service.constructor.name, characteristicName, path);
    this.setObjectByPath(this.characteristics, path, characteristic);
    if (path === 'state' && this.usePowerManager) {
      this.platform.powerManager.addStateCallback(this.device.ieee_address, state => {
        characteristic.update(state ? 'ON' : 'OFF');
      });
    }
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug('%s (%s) ' + message,
      this.device.homekit_name, this.device.ieee_address,
      ...parameters,
    );
  }

  getObjectByPath(obj: object, path: string): object | undefined {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  setObjectByPath(obj: object, path: string, value: object | CharacteristicValue) {
    const lastKey = path.substring(path.lastIndexOf('.') + 1);
    path.split('.').reduce((a, v) => a[v] = v === lastKey ? value : a[v] ? a[v] : {}, obj);
  }

  publish(cmd: string, payload: string) {
    const topic = `${this.platform.config.zigbee2mqttTopic}/${this.device.friendly_name}/${cmd}`;
    this.platform.mqttClient.publish(topic, payload);
  }

  get(path: string) {
    const obj = {};
    this.setObjectByPath(obj, path, '');
    this.publish('get', JSON.stringify(obj));
  }

  set(path: string, value: CharacteristicValue) {
    const obj = {};
    this.setObjectByPath(obj, path, value);
    this.publish('set', JSON.stringify(obj));
  }

}
