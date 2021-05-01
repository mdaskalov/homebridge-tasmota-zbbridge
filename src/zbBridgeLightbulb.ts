import {
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';

export class ZbBridgeLightbulb extends ZbBridgeAccessory {
  private power?: CharacteristicValue;
  private dimmer?: CharacteristicValue;
  private ct?: CharacteristicValue;
  private hue?: CharacteristicValue;
  private saturation?: CharacteristicValue;
  private colorX?: CharacteristicValue;
  private colorY?: CharacteristicValue;

  private supportDimmer?: boolean;
  private supportCT?: boolean;
  private supportHS?: boolean;
  private supportXY?: boolean;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
  }

  getServiceName() {
    return 'Lightbulb';
  }

  configureLightFeatures() {
    if (this.type === 'light1' || this.type === 'light2' || this.type === 'light3' || this.type.includes('_B')) {
      this.supportDimmer = true;
    }
    if (this.type === 'light2' || this.type === 'light5' || this.type.includes('_CT')) {
      this.supportDimmer = true;
      this.supportCT = true;
    }
    if (this.type === 'light3' || this.type === 'light4' || this.type === 'light5' || this.type.includes('_HS')) {
      this.supportDimmer = true;
      this.supportHS = true;
    }
    if (this.type.includes('_XY')) {
      this.supportXY = true;
    }

    this.log('configureLightFeatures: type: %s :- %s%s%s%s',
      this.type,
      this.supportDimmer ? ' Dimmer ' : '',
      this.supportCT ? ' CT ' : '',
      this.supportHS ? ' HS ' : '',
      this.supportXY ? ' XY ' : '',
    );

  }

  registerHandlers() {
    this.configureLightFeatures();

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    if (this.supportDimmer) {
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setBrightness.bind(this))
        .onGet(this.getBrightness.bind(this));
    }
    if (this.supportCT) {
      this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
        .onSet(this.setColorTemperature.bind(this))
        .onGet(this.getColorTemperature.bind(this));
    }
    if (this.supportHS || this.supportXY) {
      this.service.getCharacteristic(this.platform.Characteristic.Hue)
        .onSet(this.setHue.bind(this))
        .onGet(this.getHue.bind(this));
      // register handlers for the Saturation Characteristic
      this.service.getCharacteristic(this.platform.Characteristic.Saturation)
        .onSet(this.setSaturation.bind(this))
        .onGet(this.getSaturation.bind(this));
    }
  }

  //uint8_t               colormode;      // 0x00: Hue/Sat, 0x01: XY, 0x02: CT | 0xFF not set, default 0x01

  //768/7 -> CT
  //768/8 -> colorMode

  //Info:   ZbSend {"Device": '0xC016', "Cluster": 0, "Read": [4,5]} // get Manufacturer, Model
  //Power:  ZbSend {"Device": "0x6769", "Cluster": 6, "Read": 0}
  //Dimmer: ZbSend {"Device": "0x6769", "Cluster": 8, "Read": 0}
  //Hue:    ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 0}
  //Sat:    ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 1}
  //HueSat: ZbSend {"Device": "0x6769", "Cluster": 768, "Read": [0,1]}
  //CT:     ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 7}
  //ColorMode: ZbSend {"Device": "0xE12D", "Cluster": 768, "Read": 8}
  //Color:  ZbSend {"Device": "0xE12D", "Cluster": 768, "Read": [3,4  ]}
  //all:    Backlog ZbSend { "device": "0x6769", "cluster": 0, "read": [4,5] };
  //                ZbSend { "device": "0x6769", "cluster": 6, "read": 0 };
  //                ZbSend { "device": "0x6769", "cluster": 8, "read": 0 };
  //                ZbSend { "device": "0x6769", "cluster": 768, "read": [0, 1, 7] }

  onQueryInnitialState() {
    if (this.powerTopic !== undefined) {
      this.updated = undefined;
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    } else {
      this.mqttSend({ device: this.addr, cluster: 6, read: 0 });
      if (this.supportDimmer) {
        this.mqttSend({ device: this.addr, cluster: 8, read: 0 });
      }
      if (this.supportCT) {
        this.mqttSend({ device: this.addr, cluster: 768, read: [7, 8] });
      }
      if (this.supportHS) {
        this.mqttSend({ device: this.addr, cluster: 768, read: [0, 1, 8] });
      }
      if (this.supportXY) {
        this.mqttSend({ device: this.addr, cluster: 768, read: [3, 4, 8] });
      }
    }
  }

  updatePower(msg): void {
    if (msg.Power !== undefined) {
      this.power = (msg.Power === 1);
    }
  }

  updateDimmer(msg): void {
    if (msg.Dimmer !== undefined) {
      this.dimmer = this.mapValue(msg.Dimmer, 254, 100);
    }
  }

  updateHS(msg): void {
    if (msg.Hue !== undefined) {
      this.hue = this.mapValue(msg.Hue, 254, 360);
    }
    if (msg.Sat !== undefined) {
      this.saturation = this.mapValue(msg.Sat, 254, 100);
    }
  }

  updateXY(msg): void {
    if (msg.X !== undefined) {
      this.colorX = msg.X;
    }
    if (msg.Y !== undefined) {
      this.colorY = msg.Y;
    }
  }

  updateCT(msg): void {
    if (msg.CT !== undefined) {
      this.ct = msg.CT;
    }
  }

  updateColor(msg): number | undefined {
    let colormode = msg.ColorMode;
    if (colormode === undefined) {
      if (this.supportHS) {
        colormode = 0;
      } else if (this.supportXY) {
        colormode = 1;
      } else if (this.supportCT) {
        colormode = 2;
      } else {
        return undefined;
      }
    }
    switch (colormode) {
      case 0:
        this.updateHS(msg);
        break;
      case 1:
        this.updateXY(msg);
        this.convertXYtoHS();
        break;
      case 2:
        this.updateCT(msg);
        if (this.supportHS) {
          this.convertCTtoXY();
          this.convertXYtoHS();
          if (!this.supportXY) {
            this.colorX = undefined;
            this.colorY = undefined;
          }
        }
        break;
    }
    this.log('updateColor: %s%s%s%s%s%s%s%s',
      colormode !== undefined ? 'ColorMode: ' + colormode : '',
      this.power !== undefined ? ', Power: ' + (this.power ? 'On' : 'Off') : '',
      this.dimmer !== undefined ? ', Dimmer: ' + this.dimmer + '%' : '',
      this.hue !== undefined ? ', Hue: ' + this.hue : '',
      this.saturation !== undefined ? ', Saturation: ' + this.saturation : '',
      this.colorX !== undefined ? ', X: ' + this.colorX : '',
      this.colorY !== undefined ? ', Y: ' + this.colorY : '',
      this.ct !== undefined ? ', CT: ' + this.ct : '',
    );

    return colormode;
  }

  onStatusUpdate(msg) {
    if (msg.Power !== undefined) {
      this.updatePower(msg);
      if (this.power !== undefined) {
        this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.power);
      }
    }
    if (this.supportDimmer) {
      this.updateDimmer(msg);
      if (this.dimmer !== undefined) {
        this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(this.dimmer);
      }
    }
    const colormode = this.updateColor(msg);
    if (this.hue !== undefined) {
      this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.hue);
    }
    if (this.saturation !== undefined) {
      this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.saturation);
    }
    if (colormode === 2 && this.ct !== undefined) {
      this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature).updateValue(this.ct);
    }
  }

  async setOn(value: CharacteristicValue) {
    const power = value as boolean;
    if (this.power !== power) {
      if (this.powerTopic !== undefined) {
        this.updated = Date.now();
        this.power = power;
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, power ? 'ON' : 'OFF');
      } else {
        try {
          const msg = await this.mqttSubmit({ device: this.addr, send: { Power: (power ? 'On' : 'Off') } });
          this.updatePower(msg);
        } catch (err) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    if (this.power === undefined) {
      if (this.powerTopic !== undefined) {
        this.updated = undefined;
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
      } else {
        try {
          const msg = await this.mqttSubmit({ device: this.addr, cluster: 6, read: 0 });
          this.updatePower(msg);
          if (this.power) {
            return this.power;
          }
        } catch (err) {
          this.log(err);
        }
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.power;
  }

  async setBrightness(value: CharacteristicValue) {
    const dimmer = value as number;
    if (this.dimmer !== dimmer) {
      try {
        const msg = await this.mqttSubmit({ device: this.addr, send: { Dimmer: this.mapValue(dimmer, 100, 254) } });
        this.updateDimmer(msg);
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getBrightness(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined && this.power === false) {
      if (this.dimmer === undefined) {
        this.dimmer = 0;
      }
      return this.dimmer;
    }
    try {
      const msg = await this.mqttSubmit({ device: this.addr, cluster: 8, read: 0 });
      this.updateDimmer(msg);
      if (this.dimmer) {
        return this.dimmer;
      }
    } catch (err) {
      this.log(err);
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async setColorTemperature(value: CharacteristicValue) {
    const ct = value as number;
    if (this.ct !== ct) {
      try {
        const msg = await this.mqttSubmit({ device: this.addr, send: { CT: ct } });
        this.updateColor(msg);
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined && this.power === false) {
      if (this.ct === undefined) {
        this.ct = 140;
      }
      return this.ct;
    }
    try {
      const msg = await this.mqttSubmit({ device: this.addr, cluster: 768, read: 0 });
      this.updateColor(msg);
      if (this.ct) {
        return this.ct;
      }
    } catch (err) {
      this.log(err);
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async setHue(value: CharacteristicValue) {
    const hue = value as number;
    if (this.hue !== hue) {
      try {
        let msg;
        if (this.supportHS) {
          msg = await this.mqttSubmit({ device: this.addr, send: { Hue: this.mapValue(hue, 360, 254) } });
        } else if (this.supportXY) {
          this.hue = hue;
          this.convertHStoXY();
          msg = await this.mqttSubmit({ device: this.addr, send: { color: `${this.colorX},${this.colorY}` } });
        }
        this.updateColor(msg);
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getHue(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined && this.power === false) {
      if (this.hue === undefined) {
        this.hue = 0;
      }
      return this.hue;
    }
    try {
      let msg;
      if (this.supportHS) {
        msg = await this.mqttSubmit({ device: this.addr, cluster: 768, read: 0 });
      } else if (this.supportXY) {
        msg = await this.mqttSubmit({ device: this.addr, cluster: 768, read: [3, 4] });
      }
      this.updateColor(msg);
      if (this.hue) {
        return this.hue;
      }
    } catch (err) {
      this.log(err);
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async setSaturation(value: CharacteristicValue) {
    const saturation = value as number;
    if (this.saturation !== saturation) {
      try {
        let msg;
        if (this.supportHS) {
          msg = await this.mqttSubmit({ device: this.addr, send: { Sat: this.mapValue(saturation, 100, 254) } });
        } else if (this.supportXY) {
          this.saturation = saturation;
          this.convertHStoXY();
          msg = await this.mqttSubmit({ device: this.addr, send: { color: `${this.colorX},${this.colorY}` } });
        }
        this.updateColor(msg);
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getSaturation(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined && this.power === false) {
      if (this.saturation === undefined) {
        this.saturation = 0;
      }
      return this.saturation;
    }
    try {
      let msg;
      if (this.supportHS) {
        msg = await this.mqttSubmit({ device: this.addr, cluster: 768, read: 1 });
      } else if (this.supportXY) {
        msg = await this.mqttSubmit({ device: this.addr, cluster: 768, read: [3, 4] });
      }
      this.updateColor(msg);
      if (this.saturation) {
        return this.saturation;
      }
    } catch (err) {
      this.log(err);
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  convertHStoXY() {
    if (this.hue === undefined || this.saturation === undefined) {
      return;
    }

    const h = (this.hue as number) / 360;
    const s = (this.saturation as number) / 100;

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

      this.colorX = Math.round(65535.0 * X / (X + Y + Z));
      this.colorY = Math.round(65535.0 * Y / (X + Y + Z));
      //this.log(`HStoXY: ${this.hue},${this.saturation} -> ${this.colorX},${this.colorY}`);
    }
  }

  convertXYtoHS() {
    if (this.colorX === undefined || this.colorY === undefined) {
      return;
    }

    const x = (this.colorX as number) / 65535.0;
    const y = (this.colorY as number) / 65535.0;
    const z = 1.0 - x - y;

    const Y = this.dimmer === undefined ? 1 : (this.dimmer as number) / 100;
    const X = (Y / y) * x;
    const Z = (Y / y) * z;

    let r = X * 1.4628067 - Y * 0.1840623 - Z * 0.2743606;
    let g = -X * 0.5217933 + Y * 1.4472381 + Z * 0.0677227;
    let b = X * 0.0349342 - Y * 0.0968930 + Z * 1.2884099;
    // apply gamma correction
    r = r <= 0.0031308 ? 12.92 * r : (1.0 + 0.055) * Math.pow(r, (1.0 / 2.4)) - 0.055;
    g = g <= 0.0031308 ? 12.92 * g : (1.0 + 0.055) * Math.pow(g, (1.0 / 2.4)) - 0.055;
    b = b <= 0.0031308 ? 12.92 * b : (1.0 + 0.055) * Math.pow(b, (1.0 / 2.4)) - 0.055;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = (max === 0 ? 0 : d / max);

    switch (max) {
      case min: h = 0; break;
      case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
      case g: h = (b - r) + d * 2; h /= 6 * d; break;
      case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    this.hue = Math.round(h * 360);
    this.saturation = Math.round(s * 100);

    if (isNaN(this.hue)) {
      this.hue = undefined;
    }
    if (isNaN(this.saturation)) {
      this.saturation = undefined;
    }
    //this.log(`XYtoHS: ${this.colorX},${this.colorY} -> ${this.hue},${this.saturation}`);
  }

  convertCTtoXY() {
    if (this.ct === undefined) {
      return;
    }
    const kelvin = 1000000 / (this.ct as number);
    let x, y;

    if (kelvin < 4000) {
      x = 11790 +
        57520658 / kelvin +
        -15358885888 / kelvin / kelvin +
        -17440695910400 / kelvin / kelvin / kelvin;
    } else {
      x = 15754 +
        14590587 / kelvin +
        138086835814 / kelvin / kelvin +
        -198301902438400 / kelvin / kelvin / kelvin;
    }
    if (kelvin < 2222) {
      y = -3312 +
        35808 * x / 0x10000 +
        -22087 * x * x / 0x100000000 +
        -18126 * x * x * x / 0x1000000000000;
    } else if (kelvin < 4000) {
      y = -2744 +
        34265 * x / 0x10000 +
        -22514 * x * x / 0x100000000 +
        -15645 * x * x * x / 0x1000000000000;
    } else {
      y = -6062 +
        61458 * x / 0x10000 +
        -96229 * x * x / 0x100000000 +
        50491 * x * x * x / 0x1000000000000;
    }
    y *= 4;
    x /= 0xFFFF;
    y /= 0xFFFF;

    this.colorX = Math.round(x * 65535.0);
    this.colorY = Math.round(y * 65535.0);
    this.log(`CTtoXY: ${this.ct} -> ${this.colorX},${this.colorY}`);
  }

  HSVtoRGB(hue: number, saturation: number, brightness: number) {
    const h = hue / 360;
    const s = saturation / 100;
    const v = brightness / 100;
    let r = 1;
    let g = 1;
    let b = 1;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    return {
      r,
      g,
      b,
    };
  }

  RGBtoHSV(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = (max === 0 ? 0 : d / max);
    const v = max / 255;

    switch (max) {
      case min: h = 0; break;
      case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
      case g: h = (b - r) + d * 2; h /= 6 * d; break;
      case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return {
      hue: Math.round(h * 360),
      saturation: Math.round(s * 100),
      brightness: Math.round(v * 100),
    };
  }

}
