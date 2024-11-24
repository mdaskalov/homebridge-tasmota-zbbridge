import {
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { Zigbee2TasmotaAccessory } from './zigbee2TasmotaAccessory';
import { TasmotaZbBridgePlatform } from './platform';
import { Zigbee2TasmotaValue } from './zigbee2TasmotaValue';

export class Zigbee2TasmotaSwitch extends Zigbee2TasmotaAccessory {
  private power: Zigbee2TasmotaValue;
  private reachable: boolean;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly serviceName: string,
  ) {
    super(platform, accessory, serviceName);
    this.power = new Zigbee2TasmotaValue(platform, accessory, 'power', false);

    this.reachable = true;

    // Subscribe for the power topic updates
    if (this.powerTopic !== undefined) {
      this.platform.mqttClient.subscribe('stat/' + this.powerTopic, message => {
        const power = (message === 'ON');
        const ignored = this.power.update(power);
        if (!ignored) {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
        }
        this.log('onPowerTopicUpdate: Power: %s, ignored: %s', power ? 'On' : 'Off', ignored);
      });
    }

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
        this.reachable = (msg.Reachable === true);
        statusText += ` Reachable: ${this.reachable ? 'Yes' : 'No'}`;
      }

      if (msg.Power !== undefined) {
        const power = (msg.Power === 1);
        let ignored = this.power.update(power);
        if (!this.reachable) {
          ignored = false;
          this.reachable = true;
        }
        if (!ignored) {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
          statusText += ` Power: ${power ? 'On' : 'Off'}`;
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
