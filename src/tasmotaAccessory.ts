import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TasmotaAccessory {
  private service: Service;
  private cmndTopic: string;
  private power: boolean | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic;
    this.power = undefined;

    let service;
    const type = this.accessory.context.device.type;
    switch (type) {
      case 'AM2301-Temperature':
        service = this.platform.Service.TemperatureSensor;
        break;
      case 'AM2301-Humidity':
        service = this.platform.Service.HumiditySensor;
        break;
      default:
        service = this.platform.Service.Switch;
        break;
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    if (type.includes('switch')) {
      this.service.getCharacteristic(this.platform.Characteristic.On)
        .on('set', this.setOn.bind(this))
        .on('get', this.getOn.bind(this));
    }

    // Update on all stat topics
    this.platform.mqttClient.subscribe('stat/' + this.accessory.context.device.topic + '/+', (message) => {
      try {
        const obj = JSON.parse(message);
        if (obj) {
          this.updateStatus(obj);
        }
      } catch (err) {
        this.platform.log.debug('Ignored message: ', message);
      }
    });

    // Request status to update manufacturer model and serial
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '');
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '5');
  }

  updateStatus(response) {
    if (response.Status && response.Status.DeviceName) {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tasmota')
        .setCharacteristic(this.platform.Characteristic.Model, response.Status.DeviceName);
      this.platform.log.info('%s (%s) Manufacturer: Tasmota, Model: %s',
        this.accessory.context.device.name, this.accessory.context.device.topic,
        response.Status.DeviceName,
      );
    }
    if (response.StatusNET && response.StatusNET.Mac) {
      this.platform.log.info('%s (%s) Mac: %s',
        this.accessory.context.device.name, this.accessory.context.device.topic,
        response.StatusNET.Mac,
      );
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.SerialNumber, response.StatusNET.Mac);
    }
    if (response.POWER !== undefined) {
      this.power = (response.POWER === 'ON');
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.power);
      this.platform.log.info('%s (%s) Power: %s',
        this.accessory.context.device.name, this.accessory.context.device.topic,
        this.power ? 'On' : 'Off',
      );
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.power !== value) {
      this.platform.mqttClient.publish(this.cmndTopic + '/POWER', value ? 'ON' : 'OFF');
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    this.platform.mqttClient.publish(this.cmndTopic + '/POWER', '');
    callback(null, this.power);
  }

}
