import {
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private power?: CharacteristicValue;

  setPower(value: boolean) {
    this.power = value;
    if (this.powerTopic !== undefined) {
      this.reachable = this.power; // will be unreachable if the power is switched off
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
      this.setPower(msg.Power === 1);
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

  async updateExternalPower(message = '') {
    const topic = 'cmnd/' + this.powerTopic;
    const responseTopic = 'stat/' + this.powerTopic;
    const msg = await this.platform.mqttClient.submit(topic, message, responseTopic);
    this.setPower(msg === 'ON');
  }

  async setOn(value: CharacteristicValue) {
    const power = value as boolean;
    if (this.power !== power) {
      try {
        if (this.powerTopic !== undefined) {
          this.log('start');
          await this.updateExternalPower(power ? 'ON' : 'OFF');
          this.log('end');
        } else {
          const msg = await this.mqttSubmit({ device: this.addr, send: { Power: (power ? 'On' : 'Off') } });
          this.updatePower(msg);
        }
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    try {
      if (this.powerTopic !== undefined) {
        await this.updateExternalPower();
      } else {
        const msg = await this.mqttSubmit({ device: this.addr, cluster: 6, read: 0 });
        this.updatePower(msg);
      }
    } catch (err) {
      this.log(err);
    }
    if (this.power !== undefined) {
      return this.power;
    }
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

}