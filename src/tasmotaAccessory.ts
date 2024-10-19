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
  Light,
  HSBLight,
  TemperatureSensor,
  HumiditySensor
}

export type TasmotaDevice = {
  topic: string;
  type: string;
  name: string;
};

export class TasmotaAccessory {
  private type: DeviceType;
  private service: Service;
  private cmndTopic: string;
  private deviceType: string;
  private value: CharacteristicValue;
  private hue: number;
  private saturation: number;
  private brightness: number;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic;
    this.deviceType = this.accessory.context.device.type;
    this.value = 0;
    this.hue = 0;
    this.saturation = 0;
    this.brightness = 0;

    let service;
    if (this.deviceType.includes('Temperature')) {
      service = this.platform.Service.TemperatureSensor;
      this.type = DeviceType.TemperatureSensor;
    } else if (this.deviceType.includes('Humidity')) {
      service = this.platform.Service.HumiditySensor;
      this.type = DeviceType.HumiditySensor;
    } else if (this.deviceType.includes('HSBColor')) {
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.HSBLight;
    } else if (this.deviceType.includes('LIGHT')) {
      this.deviceType = this.deviceType.replace('LIGHT', 'POWER');
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Light;
    } else {
      service = this.platform.Service.Switch;
      this.type = DeviceType.Switch;
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    switch (this.type) {
      case DeviceType.TemperatureSensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.getSensor.bind(this));
        break;
      case DeviceType.HumiditySensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
          .onGet(this.getSensor.bind(this));
        break;
      case DeviceType.HSBLight:
        this.service.getCharacteristic(this.platform.Characteristic.On)
          .onSet(this.setLightbulbOn.bind(this))
          .onGet(this.getLightbulbOn.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Hue)
          .onSet(this.setHue.bind(this))
          .onGet(this.getHue.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Saturation)
          .onSet(this.setSaturation.bind(this))
          .onGet(this.getSaturation.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
          .onSet(this.setBrightness.bind(this))
          .onGet(this.getBrightness.bind(this));
        break;
      default:
        this.service.getCharacteristic(this.platform.Characteristic.On)
          .onSet(this.setOn.bind(this))
          .onGet(this.getOn.bind(this));
        break;
    }

    // Update status on all stat topics
    this.platform.mqttClient.subscribeTopic('stat/' + this.accessory.context.device.topic + '/+', (message, topic) => {
      this.platform.log.debug('MQTT: Received: %s %s', topic, message);
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
    const service = this.accessory.getService(this.platform.Service.AccessoryInformation);
    if (service !== undefined) {
      const deviceName = this.getObjectByPath(response, 'Status.DeviceName');
      if (deviceName) {
        service
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tasmota')
          .setCharacteristic(this.platform.Characteristic.Model, deviceName);
        this.platform.log.debug('%s (%s) Manufacturer: Tasmota, Model: %s',
          this.accessory.context.device.name,
          this.accessory.context.device.topic,
          deviceName,
        );
      }

      const serialNumber = this.getObjectByPath(response, 'StatusNET.Mac');
      if (serialNumber !== undefined) {
        service
          .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
        this.platform.log.debug('%s (%s) Mac: %s',
          this.accessory.context.device.name,
          this.accessory.context.device.topic,
          serialNumber,
        );
      }
    }

    if (this.type === DeviceType.HSBLight && response.POWER) {
      this.value = (response.POWER === 'ON');
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.value);
    }

    const sensorValue = this.getObjectByPath(response, this.deviceType);
    if (sensorValue !== undefined) {
      switch (this.type) {
        case DeviceType.HSBLight:
          this.updateHSBColor(sensorValue as string);
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
          this.value = (sensorValue as string === 'ON');
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.value);
          break;
      }
      this.platform.log.debug('%s (%s) %s: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        this.deviceType,
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

  setOn(value: CharacteristicValue) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/' + this.deviceType, value ? 'ON' : 'OFF');
    }
  }

  getOn(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/' + this.deviceType, '');
    return this.value;
  }

  setLightbulbOn(value: CharacteristicValue) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/POWER', value ? 'ON' : 'OFF');
    }
  }

  getLightbulbOn(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/POWER', '');
    return this.value;
  }

  setHue(value: CharacteristicValue) {
    if (this.hue !== value) {
      this.hue = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor1', String(value as number));
    }
  }

  getHue(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    return this.hue;
  }

  setSaturation(value: CharacteristicValue) {
    if (this.saturation !== value) {
      this.saturation = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor2', String(value as number));
    }
  }

  getSaturation(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    return this.saturation;
  }

  setBrightness(value: CharacteristicValue) {
    if (this.brightness !== value) {
      this.brightness = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor3', String(value as number));
    }
  }

  getBrightness(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    return this.brightness;
  }

  getSensor(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
    return this.value;
  }
}
