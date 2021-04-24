import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private power?: CharacteristicValue;

  constructor(platform: TasmotaZbBridgePlatform, accessory: PlatformAccessory) {
    super(platform, accessory);
  }

  getService(): Service {
    const service = this.platform.Service.Switch;
    // get the service if it exists, otherwise create a new service
    return this.accessory.getService(service) || this.accessory.addService(service);
  }

  registerHandlers() {
    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  onQueryInnitialState() {
    this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
  }

  onStatusUpdate(response) {
    if (response.Power !== undefined) {
      this.power = (response.Power === 1);
      this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.power);
    }
    this.log('%s',
      this.power !== undefined ? 'Power: ' + (this.power ? 'On' : 'Off') : '',
    );
  }

  async setOn(value: CharacteristicValue) {
    if (this.power !== value) {
      this.power = value as boolean;
      this.platform.mqttClient.send({ device: this.addr, send: { Power: (this.power ? 'On' : 'Off') } });
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    if (this.power === undefined) {
      this.platform.mqttClient.send({ device: this.addr, cluster: 6, read: 0 });
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.power;
  }
}