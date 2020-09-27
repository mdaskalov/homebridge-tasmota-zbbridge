import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

enum DeviceType {
  Switch,
  TemperatureSensor,
  HumiditySensor
}

export class TasmotaAccessory {
  private type: DeviceType;
  private service: Service;
  private cmndTopic: string;
  private value: CharacteristicValue | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic;
    this.value = undefined;

    let service;
    const type = this.accessory.context.device.type;
    if (type.includes('Temperature')) {
      service = this.platform.Service.TemperatureSensor;
      this.type = DeviceType.TemperatureSensor;
    } else if (type.includes('Humidity')) {
      service = this.platform.Service.HumiditySensor;
      this.type = DeviceType.HumiditySensor;
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
      this.platform.log.info('%s (%s) Manufacturer: Tasmota, Model: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        deviceName,
      );
    }

    const serialNumber = this.getObjectByPath(response, 'StatusNET.Mac');
    if (response.StatusNET && response.StatusNET.Mac) {
      this.platform.log.info('%s (%s) Mac: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        response.StatusNET.Mac,
      );
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
    }

    const sensorValue = this.getObjectByPath(response, this.accessory.context.device.type);
    if (sensorValue !== undefined) {
      switch (this.type) {
        case DeviceType.TemperatureSensor:
          this.value = sensorValue as number;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.value);
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
      this.platform.log.info('%s (%s) %s: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        this.accessory.context.device.type,
        sensorValue,
      );
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.value !== value) {
      this.platform.mqttClient.publish(this.cmndTopic + '/' + this.accessory.context.device.type, value ? 'ON' : 'OFF');
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    this.platform.mqttClient.publish(this.cmndTopic + '/' + this.accessory.context.device.type, '');
    callback(null, this.value);
  }

  getSensor(callback: CharacteristicGetCallback) {
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
    callback(null, this.value);
  }
}
