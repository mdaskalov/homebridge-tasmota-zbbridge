import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { ZbBridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ZbBridgeAccessory {
  private service: Service;
  private device: string;
  private Power: boolean | undefined;
  private Dimmer: number | undefined;
  private Hue: number | undefined;
  private Sat: number | undefined;

  constructor(
    private readonly platform: ZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.Power = false;
    this.Dimmer = 0;
    this.Hue = 0;
    this.Sat = 0;

    this.device = this.accessory.context.device.id;

    // query accessory information
    this.platform.mqttClient.send({ device: this.device, cluster: 0, read: [4, 5] });

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('set', this.setBrightness.bind(this))
      .on('get', this.getBrightness.bind(this));

    // Update 
    this.platform.mqttClient.subscribe('tele/' + this.platform.mqttClient.topic + '/SENSOR', (message) => {
      const obj = JSON.parse(message);
      if (obj && obj.ZbReceived) {
        const responseDevice: string = Object.keys(obj.ZbReceived)[0];
        if ((responseDevice.toUpperCase() === this.device.toUpperCase()) && obj.ZbReceived[responseDevice]) {
          const response = obj.ZbReceived[responseDevice];
          this.updateStatus(response);
        }
      }
    });
  }

  updateStatus(response) {
    if (response.Manufacturer && response.ModelId) {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, response.Manufacturer)
        .setCharacteristic(this.platform.Characteristic.Model, response.ModelId)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device);
      this.platform.log.info('%s (%s) Manufacturer: %s, Model: %s', this.accessory.context.device.name,
        this.device, response.Manufacturer, response.ModelId);
    }
    if (response.Power) {
      this.Power = (response.Power === 1);
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.Power);
      this.platform.log.info('%s (%s) Power: %s', this.accessory.context.device.name, this.device, (this.Power ? 'On' : 'Off'));
    }
    if (response.Dimmer) {
      this.Dimmer = Math.round(100 * response.Dimmer / 254);
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.Dimmer);
      this.platform.log.info('%s(%s) Dimmer: %d', this.accessory.context.device.name, this.device, this.Dimmer);
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.mqttClient.send({ device: this.device, send: { Power: (value ? 'On' : 'Off') } });
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    this.platform.mqttClient.send({ device: this.device, cluster: 6, read: 0 });
    callback(null, this.Power);
    this.platform.log.info('getOn %s (%s):', this.accessory.context.device.name, this.device, this.Power);
  }

  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.mqttClient.send({ device: this.device, send: { Dimmer: Math.round(254 * (value as number) / 100) } });
    callback(null);
  }

  getBrightness(callback: CharacteristicGetCallback) {
    callback(null, this.Dimmer);
    this.platform.mqttClient.send({ device: this.device, cluster: 8, read: 0 });
    this.platform.log.info('getBrightness %s (%s):', this.accessory.context.device.name, this.device, this.Dimmer);
  }

  //Info:   ZbSend {device: '0xC016', cluster: 0, read: [4,5]} // get Manufacturer, Model
  //Power:  ZbSend {device: "0x6769", cluster: 6, read: 0}
  //Dimmer: ZbSend {device: "0x6769", cluster: 6, read: 0}
  //Hue:    ZbSend {device: "0x6769", cluster: 768, read: 0}
  //Sat:    ZbSend {device: "0x6769", cluster: 768, read: 1}
  //both:   ZbSend {device: "0x6769", cluster: 768, read: [0,1]}
}
