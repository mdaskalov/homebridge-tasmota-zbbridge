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
  private reachable: boolean;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    this.power = new ZbBridgeValue(platform, accessory, 'power', false);

    this.reachable = true;

    // Subscribe for the power topic updates
    if (this.powerTopic !== undefined) {
      this.platform.mqttClient.subscribeTopic('stat/' + this.powerTopic, message => {
        const power = (message === 'ON');
        const ignored = this.power.update(power);
        if (!ignored) {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
        }
        this.log('onPowerTopicUpdate: Power: %s, ignored: %s', power ? 'On' : 'Off', ignored);
      });
    }

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
    if (this.powerTopic === undefined) {
      if (msg.Reachable !== undefined) {
        this.reachable = (msg.Reachable === 'true');
        statusText = ` Reachable: ${this.reachable ? 'Yes' : 'No'}`;
      }

      if (msg.Power !== undefined) {
        const power = (msg.Power === 1);
        const ignored = this.power.update(power);
        if (!ignored) {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
          statusText = ` Power: ${this.power ? 'On' : 'Off'}`;
        }
      }
    }
    return statusText;
  }

  setOn(value: CharacteristicValue) {
    const power = value as boolean;
    this.power.set(power);
    if (this.powerTopic !== undefined) {
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, power ? 'ON' : 'OFF');
    } else {
      this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Send: { Power: (power ? 'On' : 'Off') } });
    }
  }

  getOn() {
    const power = this.power.get();
    if (this.power.needsUpdate()) {
      if (this.powerTopic !== undefined) {
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
      } else {
        this.zbSend({ Device: this.addr, Endpoint: this.endpoint, Cluster: 6, Read: 0 });
      }
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return power;
  }

}
