import {
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeCharacteristic } from './zbBridgeCharacteristic';


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

export class ZbBridgeZ2M extends ZbBridgeAccessory {
  private deviceFriendlyName = 'Unknown';
  private characteristics: { [key: string]: ZbBridgeCharacteristic } = {};
  private reachable: boolean;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly serviceName: string,
  ) {
    super(platform, accessory, serviceName);
    this.reachable = true;

    const device = platform.z2mDevices.find(d => d.ieee_address === this.addr);
    if (device !== undefined) {
      //this.log('device: %s', JSON.stringify(device, null, '  '));
      this.deviceFriendlyName = device.friendly_name;
      const service = this.accessory.getService(this.platform.Service.AccessoryInformation);
      if (service !== undefined) {
        service
          .setCharacteristic(this.platform.Characteristic.Manufacturer, device.manufacturer)
          .setCharacteristic(this.platform.Characteristic.Model, device.model_id)
          .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.software_build_id)
          .setCharacteristic(this.platform.Characteristic.SerialNumber, this.addr);
        this.log('Manufacturer: %s, Model: %s',
          device.manufacturer,
          device.model_id,
        );
      }

      const features = ZbBridgeZ2M.getFeatures(device);
      this.log('Exposes: ' + JSON.stringify(features));
      if (features.includes('state')) {
        this.registerStateHandler();
      }
      if (features.includes('brightness')) {
        this.registerBrightnessHandler();
      }
      if (features.includes('color_temp')) {
        this.registerColorTempHandler();
      }

      // subscribe to device status updates
      this.platform.mqttClient.subscribeTopic('zigbee2mqtt/' + device.friendly_name, message => {
        const msg = JSON.parse(message);
        //this.log('state changed: %s', JSON.stringify(msg, null, '  '));
        if (msg.state !== undefined) {
          this.characteristics['state']?.update(msg.state === 'ON');
        }
        if (msg.brightness !== undefined) {
          this.characteristics['brightness']?.update(ZbBridgeCharacteristic.mapMaxValue(msg.brightness, 254, 100));
        }
        if (msg.color_temp !== undefined) {
          this.characteristics['color_temp']?.update(msg.color_temp);
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
  }

  registerStateHandler() {
    const state = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service, 'On', false);
    state.willGet = () => {
      if (this.powerTopic !== undefined) {
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
      } else {
        this.get('state');
      }
      return undefined;
    };
    state.willSet = value => {
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
    const brightness = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service, 'Brightness', 100);
    brightness.willGet = () => {
      this.get('brightness');
      return undefined;
    };
    brightness.willSet = value => {
      this.set('brightness', ZbBridgeCharacteristic.mapMaxValue(value as number, 100, 254));
    };
    this.characteristics['brightness'] = brightness;
  }

  registerColorTempHandler() {
    const colorTemp = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service, 'ColorTemperature', 370);
    colorTemp.willGet = () => {
      this.get('color_temp');
      return undefined;
    };
    colorTemp.willSet = value => {
      this.set('color_temp', value);
    };
    this.characteristics['color_temp'] = colorTemp;
  }

  get(feature: string) {
    this.log('get %s', feature);
    this.platform.mqttClient.publish(
      `zigbee2mqtt/${this.deviceFriendlyName}/get`,
      `{"${feature}":""}`,
    );
  }

  set(feature: string, value: CharacteristicValue) {
    this.platform.mqttClient.publish(
      `zigbee2mqtt/${this.deviceFriendlyName}/set`,
      `{"${feature}": "${value}"}`,
    );
  }

  // Abstract methods

  registerHandlers() {
    return;
  }

  onStatusUpdate(msg): string {
    return '';
  }

  static getFeatures(device: Z2MDevice): string[] {
    const exposes = device.definition.exposes.find(e => e.features);
    if (exposes !== undefined && exposes.features !== undefined) {
      return exposes.features.map(f => f.name);
    }
    return [];
  }

  static getServiceName(device: Z2MDevice): string | undefined {
    const lightbulbFeatures = ['brightness', 'color_temp', 'color_xy', 'color_hs'];
    const features = ZbBridgeZ2M.getFeatures(device);
    if (features !== undefined) {
      if (features.some(f => lightbulbFeatures.includes(f)) && features.includes('state')) {
        return 'Lightbulb';
      } else if (features.includes('state')) {
        return 'Switch';
      }
    }
  }

}
