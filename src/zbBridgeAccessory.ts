import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

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
  private Saturation: number | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.Power = undefined;
    this.Dimmer = undefined;
    this.Hue = undefined;
    this.Saturation = undefined;

    this.device = this.accessory.context.device.id;
    const type = this.accessory.context.device.type;

    //Info:   ZbSend {device: '0xC016', cluster: 0, read: [4,5]} // get Manufacturer, Model
    //Power:  ZbSend {device: "0x6769", cluster: 6, read: 0}
    //Dimmer: ZbSend {device: "0x6769", cluster: 6, read: 0}
    //Hue:    ZbSend {device: "0x6769", cluster: 768, read: 0}
    //Sat:    ZbSend {device: "0x6769", cluster: 768, read: 1}
    //both:   ZbSend {device: "0x6769", cluster: 768, read: [0,1]}

    // query accessory information
    this.platform.mqttClient.send({ device: this.device, cluster: 0, read: [0, 4, 5] });
    this.platform.mqttClient.send({ device: this.device, cluster: 6, read: 0 });
    if (type === 'light1' || type === 'light2' || type === 'light3') {
      this.platform.mqttClient.send({ device: this.device, cluster: 8, read: 0 });
      if (type === 'light3') {
        this.platform.mqttClient.send({ device: this.device, cluster: 768, read: [0, 1] });
      }
    }

    // get the service if it exists, otherwise create a new service
    const service = type === 'switch' ? this.platform.Service.Switch : this.platform.Service.Lightbulb;
    this.service = this.accessory.getService(service) || this.accessory.addService(service);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // update device name
    this.platform.mqttClient.publish(
      'cmnd/' + this.platform.mqttClient.topic + '/zbname',
      accessory.context.device.id + ',' + accessory.context.device.name,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));

    if (type === 'light1' || type === 'light2' || type === 'light3') {
      // register handlers for the Brightness Characteristic
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .on('set', this.setBrightness.bind(this))
        .on('get', this.getBrightness.bind(this));
      if (type === 'light3') {
        // register handlers for the Hue Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.Hue)
          .on('set', this.setHue.bind(this))
          .on('get', this.getHue.bind(this));
        // register handlers for the Saturation Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.Saturation)
          .on('set', this.setSaturation.bind(this))
          .on('get', this.getSaturation.bind(this));
      }
    }

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
      this.platform.log.info('%s (%s) Manufacturer: %s, Model: %s',
        this.accessory.context.device.name, this.device,
        response.Manufacturer,
        response.ModelId,
      );
    } else {
      if (response.Power !== undefined) {
        this.Power = (response.Power === 1);
        this.service.updateCharacteristic(this.platform.Characteristic.On, this.Power);
      }
      if (response.Dimmer !== undefined) {
        this.Dimmer = Math.round(100 * response.Dimmer / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.Dimmer);
      }
      if (response.Hue !== undefined) {
        this.Hue = Math.round(360 * response.Hue / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
      }
      if (response.Sat !== undefined) {
        this.Saturation = Math.round(100 * response.Sat / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
      }
      this.platform.log.info('%s (%s) %s%s%s%s',
        this.accessory.context.device.name, this.device,
        this.Power !== undefined ? 'Power: ' + (this.Power ? 'On' : 'Off') : '',
        this.Dimmer !== undefined ? ', Dimmer: ' + this.Dimmer + '%' : '',
        this.Hue !== undefined ? ', Hue: ' + this.Hue : '',
        this.Saturation !== undefined ? ', Saturation: ' + this.Saturation : '',
      );
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.Power !== value) {
      this.platform.mqttClient.send({ device: this.device, send: { Power: (value ? 'On' : 'Off') } });
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    this.platform.mqttClient.send({ device: this.device, cluster: 6, read: 0 });
    callback(null, this.Power);
  }

  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.Dimmer !== value) {
      this.platform.mqttClient.send({ device: this.device, send: { Dimmer: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getBrightness(callback: CharacteristicGetCallback) {
    callback(null, this.Dimmer);
    this.platform.mqttClient.send({ device: this.device, cluster: 8, read: 0 });
  }

  setHue(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.Hue !== value) {
      this.platform.mqttClient.send({ device: this.device, send: { Hue: Math.round(254 * (value as number) / 360) } });
    }
    callback(null);
  }

  getHue(callback: CharacteristicGetCallback) {
    callback(null, this.Hue);
    this.platform.mqttClient.send({ device: this.device, cluster: 768, read: 0 });
  }

  setSaturation(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.Saturation !== value) {
      this.platform.mqttClient.send({ device: this.device, send: { Sat: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getSaturation(callback: CharacteristicGetCallback) {
    callback(null, this.Saturation);
    this.platform.mqttClient.send({ device: this.device, cluster: 768, read: 1 });
  }

}
