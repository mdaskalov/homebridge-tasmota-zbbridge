import {
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeValue } from './zbBridgeValue';

export class ZbBridgeThermostat extends ZbBridgeAccessory {
  private currentTemperature: ZbBridgeValue;
  private targetTemperature: ZbBridgeValue;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    this.currentTemperature = new ZbBridgeValue(platform, accessory, 'currentTemperature', 20);
    this.targetTemperature = new ZbBridgeValue(platform, accessory, 'targetTemperature', 22);
  }

  getServiceName() {
    return 'Thermostat';
  }

  registerHandlers() {
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemperature.bind(this))
      .onGet(this.getTargetTemperature.bind(this));
  }

  updateCurrentTemperature(msg) {
    let statusText = '';
    if (msg.LocalTemperature !== undefined) {
      const localTemperature = msg.LocalTemperature;
      const ignoreCurrentTemperature = this.currentTemperature.update(localTemperature);
      if (!ignoreCurrentTemperature) {
        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(localTemperature);
        statusText += ` CurrentTemperature: ${localTemperature}`;
      }
    }
    return statusText;
  }

  updateTargetTemperature(msg) {
    let statusText = '';
    if (msg.TuyaTempTarget !== undefined) {
      const tempTarget = msg.TuyaTempTarget;
      const ignoreTempTarget = this.targetTemperature.update(tempTarget);
      if (!ignoreTempTarget) {
        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(tempTarget);
        statusText += ` TargetTemperature: ${tempTarget}`;
      }
    }
    return statusText;
  }

  onStatusUpdate(msg): string {
    let statusText = '';
    statusText += this.updateTargetTemperature(msg);
    statusText += this.updateCurrentTemperature(msg);
    return statusText;
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const currentTemperature = this.currentTemperature.get();
    if (this.currentTemperature.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return currentTemperature;
  }

  async setTargetTemperature(value: CharacteristicValue) {
    const targetTemperature = value as number;
    this.targetTemperature.set(targetTemperature);
    //this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { ? } });
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    const targetTemperature = this.targetTemperature.get();
    if (this.targetTemperature.needsUpdate()) {
      this.zbInfo();
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return targetTemperature;
  }

}
