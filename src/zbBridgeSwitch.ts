import {
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private power?: CharacteristicValue;

  getServiceName() {
    return 'Switch';
  }

  registerHandlers() {
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  onQueryInnitialState() {
    if (this.powerTopic !== undefined) {
      this.updated = undefined;
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    } else {
      this.mqttSend({ device: this.addr, cluster: 6, read: 0 });
    }
  }

  updatePower(msg): void {
    if (msg.Power !== undefined) {
      this.power = (msg.Power === 1);
      if (this.powerTopic !== undefined) {
        this.reachable = !this.powerTopic;
      }
    }
  }

  onStatusUpdate(msg) {
    this.updatePower(msg);
    if (this.power !== undefined) {
      this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.power);
    }
    this.log('%s',
      this.power !== undefined ? 'Power: ' + (this.power ? 'On' : 'Off') : '',
    );
  }

  async setOn(value: CharacteristicValue) {
    const power = value as boolean;
    if (this.power !== power) {
      if (this.powerTopic !== undefined) {
        this.updated = Date.now();
        this.power = power;
        this.reachable = !power; // will be unreachable if the power is switched off
        this.platform.mqttClient.publish('cmnd/' + this.powerTopic, power ? 'ON' : 'OFF');
      } else {
        try {
          const msg = await this.mqttSubmit({ device: this.addr, send: { Power: (power ? 'On' : 'Off') } });
          this.updatePower(msg);
        } catch (err) {
          throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
        }
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    if (this.powerTopic !== undefined) {
      this.updated = undefined;
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    } else {
      try {
        const msg = await this.mqttSubmit({ device: this.addr, cluster: 6, read: 0 });
        this.updatePower(msg);
      } catch (err) {
        this.reachable = false;
        this.power = false;
        this.log(err);
      }
    }
    if (this.power !== undefined) {
      return this.power;
    }
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

}