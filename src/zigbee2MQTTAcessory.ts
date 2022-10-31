import {
  PlatformAccessory,
  CharacteristicValue,
  Service,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { Zigbee2MQTTCharacteristic } from './zigbee2MQTTCharacteristic';

const FEATURES = [
  { service: 'Lightbulb', features: ['brightness', 'color_temp', 'color_xy', 'color_hs'] },
  { service: 'Switch', features: ['state'] },
];

export type Z2MExposeFeature = {
  name: string;
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

export type Z2MExpose = {
  type: string;
  name?: string;
  features?: Z2MExposeFeature[];
  endpoint?: string;
  values?: string[];
  value_off?: string;
  value_on?: string;
  access: number;
  property: string;
  unit?: string;
  value_min?: number;
  value_max?: number;
};

export type Z2MDeviceDefinition = {
  description: string;
  exposes: Z2MExpose[];
  model: string;
  options: Z2MExpose[];
  supports_ota: boolean;
  vendor: string;
};

export type Z2MDevice = {
  ieee_address: string;
  friendly_name: string;
  definition: Z2MDeviceDefinition;
  manufacturer: string;
  model_id: string;
  network_address: number;
  power_source: string;
  software_build_id: string;
  supported: boolean;
};

export type Zigbee2MQTTDevice = {
  ieee_address: string;
  name: string;
  powerTopic?: string;
  powerType?: string;
};

export class Zigbee2MQTTAcessory {
  private service: Service;
  private powerTopic?: string;
  private ieee_address: string;
  private deviceFriendlyName = 'Unknown';
  private characteristics: { [key: string]: Zigbee2MQTTCharacteristic } = {};

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    if (this.accessory.context.device.powerTopic !== undefined) {
      this.powerTopic = this.accessory.context.device.powerTopic + '/' + (this.accessory.context.device.powerType || 'POWER');
    }
    this.ieee_address = this.accessory.context.device.ieee_address;

    const service = this.accessory.context.service;
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    const device = this.accessory.context.z2m_device;
    //this.log('device: %s', JSON.stringify(device, null, '  '));
    this.deviceFriendlyName = device.friendly_name;
    const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
    if (infoService !== undefined) {
      infoService
        .setCharacteristic(this.platform.Characteristic.Manufacturer, device.manufacturer)
        .setCharacteristic(this.platform.Characteristic.Model, device.model_id)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.ieee_address);
      if (device.software_build_id) {
        infoService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.software_build_id);
      }
      this.log('Manufacturer: %s, Model: %s',
        this.accessory.context.z2m_device.manufacturer,
        this.accessory.context.z2m_device.model_id,
      );
    }

    //this.log('Exposes: %s', JSON.stringify(this.accessory.context.exposes, null, '  '));
    const features = this.accessory.context.exposes.features.map(f => f.name);
    this.log('Exposes features: %s', JSON.stringify(features));
    if (features.includes('state')) {
      this.registerStateHandler();
    }
    if (features.includes('brightness')) {
      this.registerBrightnessHandler();
    }
    if (features.includes('color_temp')) {
      this.registerColorTempHandler();
    }
    if (features.includes('color_hs')) {
      this.registerHueHandler();
      this.registerSaturationHandler();
    }

    // subscribe to device status updates
    this.platform.mqttClient.subscribeTopic(
      this.platform.config.zigbee2mqttTopic + '/' + device.friendly_name, message => {
        const msg = JSON.parse(message);
        //this.log('state changed: %s', JSON.stringify(msg, null, '  '));
        if (msg.state !== undefined && this.powerTopic === undefined) {
          this.characteristics['state']?.update(msg.state === 'ON');
        }
        if (msg.brightness !== undefined) {
          this.characteristics['brightness']?.update(Zigbee2MQTTCharacteristic.mapMaxValue(msg.brightness, 254, 100));
        }
        if (msg.color_temp !== undefined && msg.color_mode === 'color_temp') {
          this.characteristics['color_temp']?.update(msg.color_temp);
        }
        if (msg.color !== undefined && msg.color_mode === 'hs') {
          if (msg.color.hue) {
            this.characteristics['hue']?.update(msg.color.hue);
          }
          if (msg.color.saturation) {
            this.characteristics['saturation']?.update(msg.color.saturation);
          }
        }
      });
    //Subscribe for the power topic updates
    if (this.powerTopic !== undefined) {
      this.platform.mqttClient.subscribeTopic('stat/' + this.powerTopic, message => {
        //this.log('power state changed: %s', message);
        this.characteristics['state']?.update((message === 'ON'));
      });
      // request initial state
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    }
    // request initial state
    this.get('state');
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug('%s (%s) ' + message,
      this.accessory.context.device.name, this.ieee_address,
      ...parameters,
    );
  }

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

  registerBrightnessHandler() {
    const brightness = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, this.service, 'Brightness', 100);
    brightness.onGet = () => {
      this.get('brightness');
      return undefined;
    };
    brightness.onSet = value => {
      this.set('brightness', Zigbee2MQTTCharacteristic.mapMaxValue(value as number, 100, 254));
    };
    this.characteristics['brightness'] = brightness;
  }

  registerColorTempHandler() {
    const colorTemp = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, this.service, 'ColorTemperature', 370);
    colorTemp.onGet = () => {
      this.get('color_temp');
      return undefined;
    };
    colorTemp.onSet = value => {
      this.set('color_temp', value);
    };
    this.characteristics['color_temp'] = colorTemp;
  }

  registerHueHandler() {
    const hue = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, this.service, 'Hue', 20);
    hue.onGet = () => {
      this.get('color/hue');
      return undefined;
    };
    hue.onSet = value => {
      this.set('color/hue', value);
    };
    this.characteristics['hue'] = hue;
  }

  registerSaturationHandler() {
    const saturation = new Zigbee2MQTTCharacteristic(this.platform, this.accessory, this.service, 'Saturation', 20);
    saturation.onGet = () => {
      this.get('color/saturation');
      return undefined;
    };
    saturation.onSet = value => {
      this.set('color/saturation', value);
    };
    this.characteristics['saturation'] = saturation;
  }

  getObjectByPath(obj: object, path: string): object | undefined {
    return path.split('/').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  setObjectByPath(obj: object, path: string, value: CharacteristicValue) {
    const lastKey = path.substring(path.lastIndexOf('/') + 1);
    path.split('/').reduce((a, v) => a[v] = v === lastKey ? value : a[v] ? a[v] : {}, obj);
  }

  get(feature: string) {
    const obj = {};
    this.setObjectByPath(obj, feature, '');
    this.platform.mqttClient.publish(
      `${this.platform.config.zigbee2mqttTopic}/${this.deviceFriendlyName}/get`,
      JSON.stringify(obj),
    );
  }

  set(feature: string, value: CharacteristicValue) {
    const obj = {};
    this.setObjectByPath(obj, feature, value);
    this.platform.mqttClient.publish(
      `${this.platform.config.zigbee2mqttTopic}/${this.deviceFriendlyName}/set`,
      JSON.stringify(obj),
    );
  }

  static getServiceName(device: Z2MDevice): { serviceName: string; exposes: Z2MExpose } {
    const exposesLight = device.definition.exposes.find(f => f.type === 'light');
    if (exposesLight !== undefined) {
      return { serviceName: 'Lightbulb', exposes: exposesLight };
    }
    const exposesSwitch = device.definition.exposes.find(f => f.type === 'switch');
    if (exposesSwitch !== undefined) {
      return { serviceName: 'Lightbulb', exposes: exposesSwitch };
    }
    return { serviceName: 'Unknown', exposes: device.definition.exposes[0] };
  }

}
