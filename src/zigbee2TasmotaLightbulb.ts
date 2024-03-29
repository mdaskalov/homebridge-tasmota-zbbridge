import {
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
  AdaptiveLightingController,
} from 'homebridge';

import { Color } from './color';
import { Zigbee2TasmotaSwitch } from './zigbee2TasmotaSwitch';
import { TasmotaZbBridgePlatform } from './platform';
import { Zigbee2TasmotaValue } from './zigbee2TasmotaValue';

export class Zigbee2TasmotaLightbulb extends Zigbee2TasmotaSwitch {
  private color: Color = new Color(this.platform);
  private dimmer: Zigbee2TasmotaValue;
  private ct: Zigbee2TasmotaValue;
  private hue: Zigbee2TasmotaValue;
  private saturation: Zigbee2TasmotaValue;
  private colorX: Zigbee2TasmotaValue;
  private colorY: Zigbee2TasmotaValue;

  private supportDimmer?: boolean;
  private supportCT?: boolean;
  private supportHS?: boolean;
  private supportXY?: boolean;

  private adaptiveLightingController?: AdaptiveLightingController;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly serviceName: string,
  ) {
    super(platform, accessory, serviceName);
    this.dimmer = new Zigbee2TasmotaValue(platform, accessory, 'dimmer', 100);
    this.ct = new Zigbee2TasmotaValue(platform, accessory, 'ct', 370);
    this.hue = new Zigbee2TasmotaValue(platform, accessory, 'hue', 20);
    this.saturation = new Zigbee2TasmotaValue(platform, accessory, 'saturation', 100);
    this.colorX = new Zigbee2TasmotaValue(platform, accessory, 'colorX', 30265);
    this.colorY = new Zigbee2TasmotaValue(platform, accessory, 'colorY', 24947);
  }

  configureLightFeatures() {
    if (this.type === 'light1' || this.type.includes('_B')) {
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

    this.log('configureLightFeatures (type: %s):%s',
      this.type,
      (this.supportDimmer ? ' B' : '') +
      (this.supportCT ? ' CT' : '') +
      (this.supportHS ? ' HS' : '') +
      (this.supportXY ? ' XY' : ''),
    );
  }

  registerHandlers() {
    super.registerHandlers();
    this.configureLightFeatures();
    if (this.supportDimmer) {
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setBrightness.bind(this))
        .onGet(this.getBrightness.bind(this));
    }
    if (this.supportCT) {
      this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
        .onSet(this.setColorTemperature.bind(this))
        .onGet(this.getColorTemperature.bind(this));

      this.adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(this.service, {
        controllerMode: this.platform.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
      });
      if (this.adaptiveLightingController) {
        this.accessory.configureController(this.adaptiveLightingController);
      }
    }
    if (this.supportHS || this.supportXY) {
      this.service.getCharacteristic(this.platform.Characteristic.Hue)
        .onSet(this.setHue.bind(this))
        .onGet(this.getHue.bind(this));
      this.service.getCharacteristic(this.platform.Characteristic.Saturation)
        .onSet(this.setSaturation.bind(this))
        .onGet(this.getSaturation.bind(this));
    }
  }

  disableAdaptiveLighting() {
    if (this.adaptiveLightingController) {
      this.adaptiveLightingController.disableAdaptiveLighting();
    }
  }

  //uint8_t               colormode;      // 0x00: Hue/Sat, 0x01: XY, 0x02: CT | 0xFF not set, default 0x01

  //768/7 -> CT
  //768/8 -> colorMode

  // Unreachable
  // tele/zbbridge/SENSOR {"Device":"0x4275","Name":"Lamp","Reachable":false}
  // tele/zbbridge/RESULT {"ZbRouteError":{"ShortAddr":"0x4275","Status":170,"StatusMessage":"MANY_TO_ONE_ROUTE_FAILURE"}}
  // tele/zbbridge/RESULT {"ZbRouteError":{"ShortAddr":"0x4275","Status":169,"StatusMessage":"SOURCE_ROUTE_FAILURE"}}

  //Info:      ZbSend {"Device": '0xC016', "Cluster": 0, "Read": [4,5]} // get Manufacturer, Model
  //Scene      ZbSend {"Device": "0x9E82", "Cluster": 5, "Read": [0, 1, 2, 3] }
  //Power:     ZbSend {"Device": "0x6769", "Cluster": 6, "Read": 0}
  //Dimmer:    ZbSend {"Device": "0x6769", "Cluster": 8, "Read": 0}
  //Hue:       ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 0}
  //Sat:       ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 1}
  //HueSat:    ZbSend {"Device": "0x6769", "Cluster": 768, "Read": [0, 1]}
  //CT:        ZbSend {"Device": "0x6769", "Cluster": 768, "Read": 7}
  //ColorMode: ZbSend {"Device": "0xE12D", "Cluster": 768, "Read": 8}
  //Color:     ZbSend {"Device": "0xE12D", "Cluster": 768, "Read": [3, 4]}

  //all:    Backlog ZbSend { "Device": "0x6769", "Cluster": 0, "Read": [4,5] };
  //                ZbSend { "Device": "0x6769", "Cluster": 6, "Read": 0 };
  //                ZbSend { "Device": "0x6769", "Cluster": 8, "Read": 0 };
  //                ZbSend { "Device": "0x6769", "Cluster": 768, "Read": [0, 1, 3, 4, 7, 8] }

  updateDimmer(msg) {
    let statusText = '';
    if (msg.Dimmer !== undefined) {
      const dimmer = this.mapValue(msg.Dimmer, 254, 100);
      this.color.brightness = dimmer;
      const ignoreDimmer = this.dimmer.update(dimmer);
      if (!ignoreDimmer) {
        this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(dimmer);
        statusText += ` Dimmer: ${msg.Dimmer} (${dimmer})`;
      }
    }
    return statusText;
  }

  updateHS(msg) {
    let statusText = '';
    if (msg.Hue !== undefined) {
      const hue = this.mapValue(msg.Hue, 254, 360);
      this.color.hue = hue;
      const ignoreHue = this.hue.update(hue);
      if (!ignoreHue) {
        this.disableAdaptiveLighting();
        this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(hue);
        statusText += ` Hue: ${msg.Hue} (${hue})`;
      }
    }
    if (msg.Sat !== undefined) {
      const sat = this.mapValue(msg.Sat, 254, 100);
      this.color.saturation = sat;
      const ignoreSat = this.saturation.update(sat);
      if (!ignoreSat) {
        statusText += ` Sat: ${msg.Sat} (${sat})`;
        this.disableAdaptiveLighting();
        this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(sat);
      }
    }
    return statusText;
  }

  updateXY(msg) {
    let ignoreX = true;
    let ignoreY = true;
    let statusText = '';
    if (msg.X !== undefined) {
      const x = msg.X;
      this.color.colorX = x;
      ignoreX = this.colorX.update(x);
      if (!ignoreX) {
        statusText += ` X: ${x}`;
      }
    }
    if (msg.Y !== undefined) {
      const y = msg.Y;
      this.color.colorY = y;
      ignoreY = this.colorY.update(y);
      if (!ignoreY) {
        statusText += ` Y: ${y}`;
      }
    }
    if (!ignoreX || !ignoreY) {
      this.hue.update(this.color.hue);
      this.saturation.update(this.color.saturation);
      this.disableAdaptiveLighting();
      this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.color.hue);
      this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.color.saturation);
      statusText += ` (Hue: ${this.color.hue}, Sat:${this.color.saturation})`;
    }
    return statusText;
  }

  updateCT(msg) {
    let statusText = '';
    if (msg.CT !== undefined) {
      const ct = msg.CT;
      this.color.ct = ct;
      const ignoreCT = this.ct.update(ct);
      if (!ignoreCT) {
        this.hue.update(this.color.hue);
        this.saturation.update(this.color.saturation);
        this.disableAdaptiveLighting();
        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature).updateValue(ct);
        this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.color.hue);
        this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.color.saturation);
        statusText += ` CT: ${ct}`;
      }
    }
    return statusText;
  }

  onStatusUpdate(msg): string {
    let statusText = super.onStatusUpdate(msg); // switch

    if (this.supportDimmer) {
      statusText += this.updateDimmer(msg);
    }

    let colormode = msg.ColorMode;
    if (colormode === undefined) {
      if (this.supportHS && msg.Hue !== undefined) {
        colormode = 0;
      } else if (this.supportXY && msg.X !== undefined) {
        colormode = 1;
      } else if (this.supportCT && msg.CT !== undefined) {
        colormode = 2;
      }
    }
    switch (colormode) {
      case 0:
        statusText += this.updateHS(msg);
        break;
      case 1:
        statusText += this.updateXY(msg);
        break;
      case 2:
        statusText += this.updateCT(msg);
        break;
    }

    if (colormode !== undefined && statusText !== '') {
      statusText = ` ColorMode: ${colormode}` + statusText;
    }

    return statusText;
  }

  async setBrightness(value: CharacteristicValue) {
    const dimmer = value as number;
    this.color.brightness = dimmer;
    this.dimmer.set(dimmer);
    this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Dimmer: this.mapValue(dimmer, 100, 254) } });
  }

  async getBrightness(): Promise<CharacteristicValue> {
    const dimmer = this.dimmer.get();
    if (this.dimmer.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return dimmer;
  }

  async setColorTemperature(value: CharacteristicValue) {
    const ct = value as number;
    this.color.ct = ct;
    this.ct.set(ct);
    this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { CT: ct } });
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    const ct = this.ct.get();
    if (this.ct.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return ct;
  }

  async setHue(value: CharacteristicValue) {
    const hue = value as number;
    this.color.hue = hue;
    if (this.supportHS) {
      this.hue.set(hue);
      this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Hue: this.mapValue(hue, 360, 254) } });
    } else if (this.supportXY) {
      this.colorX.set(this.color.colorX);
      this.colorY.set(this.color.colorY);
      this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Color: `${this.color.colorX},${this.color.colorY}` } });
    }
  }

  async getHue(): Promise<CharacteristicValue> {
    const hue = this.hue.get();
    if (this.hue.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return hue;
  }

  async setSaturation(value: CharacteristicValue) {
    const saturation = value as number;
    this.color.saturation = saturation;
    if (this.supportHS) {
      this.saturation.set(saturation);
      this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Sat: this.mapValue(saturation, 100, 254) } });
    } else if (this.supportXY) {
      this.colorX.set(this.color.colorX);
      this.colorY.set(this.color.colorY);
      this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Color: `${this.color.colorX},${this.color.colorY}` } });
    }
  }

  async getSaturation(): Promise<CharacteristicValue> {
    const saturation = this.saturation.get();
    if (this.saturation.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return saturation;
  }

}
