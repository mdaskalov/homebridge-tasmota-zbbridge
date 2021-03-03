import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

enum DeviceType {
  Switch,
  HSBLight,
  TemperatureSensor,
  HumiditySensor
}

export type TasmotaDevice = {
  topic: string,
  type: string,
  name: string
}

export class TasmotaAccessory {
  private type: DeviceType;
  private service: Service;
  private cmndTopic: string;
  private value: CharacteristicValue;
  private hue: number;
  private saturation: number;
  private brightness: number;
  private updated: number | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic;
    this.value = 0;
    this.hue = 0;
    this.saturation = 0;
    this.brightness = 0;
    this.updated = undefined;

    let service;
    const type = this.accessory.context.device.type;
    if (type.includes('Temperature')) {
      service = this.platform.Service.TemperatureSensor;
      this.type = DeviceType.TemperatureSensor;
    } else if (type.includes('Humidity')) {
      service = this.platform.Service.HumiditySensor;
      this.type = DeviceType.HumiditySensor;
    } else if (type.includes('HSBColor')) {
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.HSBLight;
    } else {
      service = this.platform.Service.Switch;
      this.type = DeviceType.Switch;
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    switch (this.type) {
      case DeviceType.TemperatureSensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .on('get', this.getSensor.bind(this));
        break;
      case DeviceType.HumiditySensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
          .on('get', this.getSensor.bind(this));
        break;
      case DeviceType.HSBLight:
        this.service.getCharacteristic(this.platform.Characteristic.On)
          .on('set', this.setLightbulbOn.bind(this))
          .on('get', this.getLightbulbOn.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Hue)
          .on('set', this.setHue.bind(this))
          .on('get', this.getHue.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Saturation)
          .on('set', this.setSaturation.bind(this))
          .on('get', this.getSaturation.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
          .on('set', this.setBrightness.bind(this))
          .on('get', this.getBrightness.bind(this));
        break;
      default:
        this.service.getCharacteristic(this.platform.Characteristic.On)
          .on('set', this.setOn.bind(this))
          .on('get', this.getOn.bind(this));
        break;
    }

    // Update status on all stat topics
    this.platform.mqttClient.subscribe('stat/' + this.accessory.context.device.topic + '/+', (message) => {
      let obj = undefined;
      try {
        obj = JSON.parse(message);
        this.updateStatus(obj);
      } catch (err) {
        this.updateStatus({ message });
      }
    });

    // Request general, serial and sensor status
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '');
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '5');
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
  }

  getObjectByPath(obj, path: string) {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  updateStatus(response) {
    const deviceName = this.getObjectByPath(response, 'Status.DeviceName');
    if (deviceName) {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tasmota')
        .setCharacteristic(this.platform.Characteristic.Model, deviceName);
      this.platform.log.debug('%s (%s) Manufacturer: Tasmota, Model: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        deviceName,
      );
    }

    const serialNumber = this.getObjectByPath(response, 'StatusNET.Mac');
    if (response.StatusNET && response.StatusNET.Mac) {
      this.platform.log.debug('%s (%s) Mac: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        response.StatusNET.Mac,
      );
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
    }

    if (this.type === DeviceType.HSBLight && response.POWER) {
      this.value = (response.POWER === 'ON');
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.value);
    }

    const sensorValue = this.getObjectByPath(response, this.accessory.context.device.type);
    if (sensorValue !== undefined) {
      switch (this.type) {
        case DeviceType.HSBLight:
          this.updateHSBColor(sensorValue);
          break;
        case DeviceType.TemperatureSensor:
          this.value = sensorValue as number;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.value);
          this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).props.minValue = -50;
          break;
        case DeviceType.HumiditySensor:
          this.value = sensorValue as number;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.value);
          break;
        default:
          this.value = (sensorValue === 'ON');
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.value);
          break;
      }
      this.platform.log.debug('%s (%s) %s: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        this.accessory.context.device.type,
        sensorValue,
      );
    }
  }

  updateHSBColor(value: string) {
    const data = value.split(',');
    if (data.length === 3) {
      this.hue = Number(data[0]);
      this.saturation = Number(data[1]);
      this.brightness = Number(data[2]);
      this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.hue);
      this.service.updateCharacteristic(this.platform.Characteristic.Saturation, this.saturation);
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.brightness);
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/' + this.accessory.context.device.type, value ? 'ON' : 'OFF');
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    callback(null, this.value);
    this.platform.mqttClient.publish(this.cmndTopic + '/' + this.accessory.context.device.type, '');
  }

  setLightbulbOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/POWER', value ? 'ON' : 'OFF');
    }
    callback(null);
  }

  getLightbulbOn(callback: CharacteristicGetCallback) {
    callback(null, this.value);
    this.platform.mqttClient.publish(this.cmndTopic + '/POWER', '');
  }

  setHue(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.hue !== value) {
      this.hue = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor1', String(value as number));
    }
    callback(null);
  }

  getHue(callback: CharacteristicGetCallback) {
    callback(null, this.hue);
    this.updated = undefined;
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
  }

  setSaturation(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.saturation !== value) {
      this.saturation = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor2', String(value as number));
    }
    callback(null);
  }

  getSaturation(callback: CharacteristicGetCallback) {
    callback(null, this.saturation);
    this.updated = undefined;
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
  }

  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.brightness !== value) {
      this.brightness = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor3', String(value as number));
    }
    callback(null);
  }

  getBrightness(callback: CharacteristicGetCallback) {
    callback(null, this.brightness);
    this.updated = undefined;
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
  }

  getSensor(callback: CharacteristicGetCallback) {
    callback(null, this.value);
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
  }
}
