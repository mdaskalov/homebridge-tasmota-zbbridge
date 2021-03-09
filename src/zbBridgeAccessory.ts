import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

export type ZbBridgeDevice = {
  addr: string,
  type: string,
  name: string
}

const UPDATE_DELAY = 2000;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ZbBridgeAccessory {
  private service: Service;
  private powerTopic: string | undefined;
  private addr: string;
  private type: string;
  private power: boolean;
  private dimmer: number;
  private ct: number;
  private hue: number;
  private saturation: number;
  private updated: number | undefined;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.powerTopic = undefined;
    this.power = false;
    this.dimmer = 0;
    this.ct = 140;
    this.hue = 0;
    this.saturation = 0;
    this.updated = undefined;

    this.addr = this.accessory.context.device.addr;
    this.type = this.accessory.context.device.type;

    //Info:   ZbSend {device: '0xC016', cluster: 0, read: [4,5]} // get Manufacturer, Model
    //Power:  ZbSend {device: "0x6769", cluster: 6, read: 0}
    //Dimmer: ZbSend {device: "0x6769", cluster: 8, read: 0}
    //CT:     ZbSend {device: "0x6769", cluster: 768, read: 7}
    //Hue:    ZbSend {device: "0x6769", cluster: 768, read: 0}
    //Sat:    ZbSend {device: "0x6769", cluster: 768, read: 1}
    //both:   ZbSend {device: "0x6769", cluster: 768, read: [0,1]}
    //all:    Backlog ZbSend { "device": "0x6769", "cluster": 0, "read": [4,5] };
    //                ZbSend { "device": "0x6769", "cluster": 6, "read": 0 };
    //                ZbSend { "device": "0x6769", "cluster": 8, "read": 0 };
    //                ZbSend { "device": "0x6769", "cluster": 768, "read": [0, 1, 7] }

    // query accessory information
    this.platform.mqttClient.send({ device: this.addr, cluster: 0, read: [0, 4, 5] });
    this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
    if (this.type === 'light1' || this.type === 'light2' || this.type === 'light3') {
      this.platform.mqttClient.send({ device: this.addr, cluster: 8, read: 0 });
      if (this.type === 'light2') {
        this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 7 });
      }
      if (this.type === 'light3') {
        this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: [0, 1] });
      }
    }

    // get the service if it exists, otherwise create a new service
    const service = this.type === 'switch' ? this.platform.Service.Switch : this.platform.Service.Lightbulb;
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

    if (this.type === 'light1' || this.type === 'light2' || this.type === 'light3') {
      // register handlers for the Brightness Characteristic
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .on('set', this.setBrightness.bind(this))
        .on('get', this.getBrightness.bind(this));
      if (this.type === 'light2') {
        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
          .on('set', this.setColorTemperature.bind(this))
          .on('get', this.getColorTemperature.bind(this));
      }
      if (this.type === 'light3') {
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

    // Use separated topic for power
    if (this.accessory.context.device.powerTopic !== undefined) {
      this.powerTopic = this.accessory.context.device.powerTopic + '/' + (this.accessory.context.device.powerType || 'POWER');
      this.platform.mqttClient.subscribe('stat/' + this.powerTopic, (message) => {
        this.updateStatus({ Power: (message === 'ON') ? 1 : 0 });
      });
    }

    // Update
    this.platform.mqttClient.subscribe('tele/' + this.platform.mqttClient.topic + '/SENSOR', (message, topic) => {
      const obj = JSON.parse(message);
      if (obj && obj.ZbReceived) {
        const responseDevice: string = Object.keys(obj.ZbReceived)[0];
        if ((responseDevice.toUpperCase() === this.addr.toUpperCase()) && obj.ZbReceived[responseDevice]) {
          this.platform.log.debug('%s (%s) MQTT: Received %s :- %s',
            this.accessory.context.device.name, this.addr,
            topic, message);
          const response = obj.ZbReceived[responseDevice];
          this.updateStatus(response);
        }
      }
    });
  }

  updateStatus(response) {
    if ((this.updated !== undefined) && (Date.now() - this.updated < UPDATE_DELAY)) {
      this.platform.log.debug('%s (%s) updateStatus ignored...', this.accessory.context.device.name, this.addr);
      return;
    }
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
        this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.power);
      }
      if (response.Dimmer !== undefined) {
        this.dimmer = Math.round(100 * response.Dimmer / 254);
        this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(this.dimmer);
      }
      if (this.type === 'light2' && response.CT !== undefined) {
        this.ct = response.CT;
        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature).updateValue(this.ct as number);
      }
      if (this.type === 'light3' && response.Hue !== undefined) {
        this.hue = Math.round(360 * response.Hue / 254);
        this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.hue);
      }
      if (this.type === 'light3' && response.Sat !== undefined) {
        this.saturation = Math.round(100 * response.Sat / 254);
        this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.saturation);
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
      this.updated = Date.now();
      if (this.powerTopic !== undefined) {
        if (value) {
          this.platform.mqttClient.publish('cmnd/' + this.powerTopic, 'ON');
          setTimeout(() => {
            this.platform.mqttClient.send({ device: this.addr, send: { Power: 'On' } });
          }, 1000);
        } else {
          this.platform.mqttClient.send({ device: this.addr, send: { Power: 'Off' } });
          setTimeout(() => {
            this.platform.mqttClient.publish('cmnd/' + this.powerTopic, 'OFF');
          }, 1000);
        }
      } else {
        this.platform.mqttClient.send({ device: this.addr, send: { Power: (value ? 'On' : 'Off') } });
      }
    }
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    callback(null, this.power);
    this.updated = undefined;
    if (this.powerTopic !== undefined) {
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    } else {
      this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
    }
  }

  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.dimmer !== value) {
      this.dimmer = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.send({ device: this.addr, send: { Dimmer: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getBrightness(callback: CharacteristicGetCallback) {
    callback(null, this.dimmer);
    this.updated = undefined;
    this.platform.mqttClient.send({ device: this.addr, cluster: 8, read: 0 });
  }

  setColorTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.ct !== value) {
      this.ct = value as number;
      this.platform.mqttClient.send({ device: this.addr, send: { CT: this.ct } });
    }
    callback(null);
  }

  getColorTemperature(callback: CharacteristicGetCallback) {
    callback(null, this.ct);
    this.updated = undefined;
    this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 0 });
  }

  setHue(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.hue !== value) {
      this.hue = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.send({ device: this.addr, send: { Hue: Math.round(254 * (value as number) / 360) } });
    }
    callback(null);
  }

  getHue(callback: CharacteristicGetCallback) {
    callback(null, this.hue);
    this.updated = undefined;
    this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 0 });
  }

  setSaturation(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.saturation !== value) {
      this.saturation = value as number;
      this.updated = Date.now();
      this.platform.mqttClient.send({ device: this.addr, send: { Sat: Math.round(254 * (value as number) / 100) } });
    }
    callback(null);
  }

  getSaturation(callback: CharacteristicGetCallback) {
    callback(null, this.saturation);
    this.updated = undefined;
    this.platform.mqttClient.send({ device: this.addr, cluster: 768, read: 1 });
  }

  setXYColor() {
    const h = this.hue / 360;
    const s = this.saturation / 100;

    let r = 1;
    let g = 1;
    let b = 1;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = 1 - s;
    const q = 1 - f * s;
    const t = 1 - (1 - f) * s;
    switch (i % 6) {
      case 0: g = t, b = p; break;
      case 1: r = q, b = p; break;
      case 2: r = p, b = t; break;
      case 3: r = p, g = q; break;
      case 4: r = t, g = p; break;
      case 5: g = p, b = q; break;
    }

    if (r + g + b > 0) {
      // apply gamma correction
      r = (r > 0.04045) ? Math.pow((r + 0.055) / (1.0 + 0.055), 2.4) : (r / 12.92);
      g = (g > 0.04045) ? Math.pow((g + 0.055) / (1.0 + 0.055), 2.4) : (g / 12.92);
      b = (b > 0.04045) ? Math.pow((b + 0.055) / (1.0 + 0.055), 2.4) : (b / 12.92);

      // Convert the RGB values to XYZ using the Wide RGB D65
      const X = r * 0.649926 + g * 0.103455 + b * 0.197109;
      const Y = r * 0.234327 + g * 0.743075 + b * 0.022598;
      const Z = r * 0.000000 + g * 0.053077 + b * 1.035763;

      const x = Math.round(65534 * X / (X + Y + Z));
      const y = Math.round(65534 * Y / (X + Y + Z));

      this.platform.mqttClient.send({ device: this.addr, send: { color: `${x},${y}` } });
    }
  }

}
