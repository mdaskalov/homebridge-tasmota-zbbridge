import {
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeValue } from './zbBridgeValue';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private power: ZbBridgeValue;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    this.power = new ZbBridgeValue(false);
  }

  getServiceName() {
    return 'Switch';
  }

  registerHandlers() {
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  onStatusUpdate(msg): string {
    let statusText = '';
    if (msg.Power !== undefined) {
      const power = (msg.Power === 1);
      const ignored = this.power.update(power);
      if (!ignored) {
        this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
        statusText = ` Power: ${power ? 'On' : 'Off'}`;
      }
    }
    return statusText;
  }

  async externalPower(cmd = ''): Promise<boolean> {
    const topic = 'cmnd/' + this.powerTopic;
    const responseTopic = 'stat/' + this.powerTopic;
    const msg = await this.platform.mqttClient.submit(topic, cmd, responseTopic);
    return (msg === 'ON');
  }

  async setOn(value: CharacteristicValue) {
    const power = value as boolean;
    if (this.powerTopic !== undefined) {
      await this.externalPower(power ? 'ON' : 'OFF');
    } else {
      this.power.set(power);
      await this.zbSend({ device: this.addr, endpoint: this.endpoint, send: { Power: (power ? 'On' : 'Off') } });
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined) {
      return await this.externalPower();
    } else {
      const power = this.power.get();
      if (power === undefined) {
        await this.zbSend({ device: this.addr, endpoint: this.endpoint, cluster: 6, read: 0 });
        throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
      }
      return power;
    }
  }

}
