import {
  PlatformAccessory,
  CharacteristicValue,
  Service,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private service: Service;
  private power?: CharacteristicValue;
  constructor(platform: TasmotaZbBridgePlatform, accessory: PlatformAccessory) {
    super(platform, accessory);

    // get the service if it exists, otherwise create a new service
    const service = this.type === 'switch' ? this.platform.Service.Switch : this.platform.Service.Lightbulb;
    this.service = this.accessory.getService(service) || this.accessory.addService(service);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

  }

  // getService() : Service {
  //   return Service.Switch;
  // }
}