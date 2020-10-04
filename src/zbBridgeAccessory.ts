import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

export type ZbBridgeDevice = {
  addr: string,
  type: string,
  name: string
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ZbBridgeAccessory {
  private service: Service;
  private addr: string;
  private power: boolean | undefined;
  private dimmer: number | undefined;
  private hue: number | undefined;
  private saturation: number | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.power = undefined;
    this.dimmer = undefined;
    this.hue = undefined;
    this.saturation = undefined;

    this.addr = this.accessory.context.device.addr;
    const type = this.accessory.context.device.type;

    //Info:   ZbSend {device: '0xC016', cluster: 0, read: [4,5]} // get Manufacturer, Model
    //Power:  ZbSend {device: "0x6769", cluster: 6, read: 0}
    //Dimmer: ZbSend {device: "0x6769", cluster: 6, read: 0}
    //Hue:    ZbSend {device: "0x6769", cluster: 768, read: 0}
    //Sat:    ZbSend {device: "0x6769", cluster: 768, read: 1}
    //both:   ZbSend {device: "0x6769", cluster: 768, read: [0,1]}

    // query accessory information
    this.platform.mqttClient.send({ device: this.addr, cluster: 0, read: [0, 4, 5] });
    this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
    if (type === 'light1' || type === 'light2' || type === 'light3') {
      this.platform.mqttClient.send({ device: this.addr, cluster: 8, read: 0 });
      if (type === 'light3') {
        this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: [0, 1] });
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
      this.addr + ',' + accessory.context.device.name,
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
        if ((responseDevice.toUpperCase() === this.addr.toUpperCase()) && obj.ZbReceived[responseDevice]) {
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
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.addr);
      this.platform.log.debug('%s (%s) Manufacturer: %s, Model: %s',
        this.accessory.context.device.name, this.addr,
        response.Manufacturer,
        response.ModelId,
      );
    } else {
      if (response.Power !== undefined) {
        this.power = (response.Power === 1);
        this.service.updateCharacteristic(this.platform.Characteristic.On, this.power);
      }
      if (response.Dimmer !== undefined) {
        this.dimmer = Math.round(100 * response.Dimmer / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.dimmer);
      }
      if (response.Hue !== undefined) {
        this.hue = Math.round(360 * response.Hue / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.hue);
      }
      if (response.Sat !== undefined) {
        this.saturation = Math.round(100 * response.Sat / 254);
        this.service.updateCharacteristic(this.platform.Characteristic.Saturation, this.saturation);
      }
      this.platform.log.debug('%s (%s) %s%s%s%s',
        this.accessory.context.device.name, this.addr,
        this.power !== undefined ? 'Power: ' + (this.power ? 'On' : 'Off') : '',
        this.dimmer !== undefined ? ', Dimmer: ' + this.dimmer + '%' : '',
        this.hue !== undefined ? ', Hue: ' + this.hue : '',
        this.saturation !== undefined ? ', Saturation: ' + this.saturation : '',
      );
    }
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.power !== value) {
      this.power = value as boolean;
      this.platform.mqttClient.send({ device: this.addr, send: { Power: (value ? 'On' : 'Off') } });
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    callback(null, this.power);
    this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
  }

  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.dimmer !== value) {
      this.dimmer = value as number;
      this.platform.mqttClient.send({ device: this.addr, send: { Dimmer: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getBrightness(callback: CharacteristicGetCallback) {
    callback(null, this.dimmer);
    this.platform.mqttClient.send({ device: this.addr, cluster: 8, read: 0 });
  }

  setHue(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.hue !== value) {
      this.hue = value as number;
      this.platform.mqttClient.send({ device: this.addr, send: { Hue: Math.round(254 * (value as number) / 360) } });
    }
    callback(null);
  }

  getHue(callback: CharacteristicGetCallback) {
    callback(null, this.hue);
    this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 0 });
  }

  setSaturation(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.saturation !== value) {
      this.saturation = value as number;
      this.platform.mqttClient.send({ device: this.addr, send: { Sat: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getSaturation(callback: CharacteristicGetCallback) {
    callback(null, this.saturation);
    this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 1 });
  }

}
