import {
  Service,
  PlatformAccessory,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
// import { ZbBridgeLightbulb } from './zbBridgeLightbulb';
// import { ZbBridgeSwitch } from './zbBridgeSwitch';

export type ZbBridgeDevice = {
  addr: string,
  type: string,
  name: string
}

export class ZbBridgeAccessory {
  //protected service: Service;

  protected platform: TasmotaZbBridgePlatform;
  protected accessory: PlatformAccessory;
  protected powerTopic?: string;
  protected addr: string;
  protected type: string;


  protected constructor(platform: TasmotaZbBridgePlatform, accessory: PlatformAccessory) {
    this.platform = platform;
    this.accessory = accessory;
    this.addr = this.accessory.context.device.addr;
    this.type = this.accessory.context.device.type;
    //this.service = this.getService();

  }

  //abstract getService(): Service;

  // static getInstance(platform: TasmotaZbBridgePlatform, accessory: PlatformAccessory) {
  //   const type = accessory.context.device.type;
  //   if (type.startsWith('ligth')) {
  //     return new ZbBridgeLightbulb(platform, accessory);
  //   }
  //   return new ZbBridgeSwitch(platform, accessory);
  // }
}
