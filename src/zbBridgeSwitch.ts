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
      this.platform.mqttClient.publish('cmnd/' + this.powerTopic, '');
    } else {
      if (this.endpoint !== -1) {
        this.mqttSend({ device: this.addr, endpoint: this.endpoint, cluster: 6, read: 0 });
      } else {
        this.mqttSend({ device: this.addr, cluster: 6, read: 0 });
      }
    }
  }

  setPower(value: boolean) {
    this.power = value;
    this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.power);
    if (this.powerTopic !== undefined) {
      this.reachable = this.power; // will be unreachable if the power is switched off
    }
  }

  onStatusUpdate(msg) {
    if (msg.Power !== undefined && ((this.endpoint !== -1 && msg.Endpoint === this.endpoint) || this.endpoint === -1)) {
      this.setPower(msg.Power === 1);
    }
    this.log('%s',
      this.power !== undefined ? 'Power: ' + (this.power ? 'On' : 'Off') : '',
    );
  }

  async externalPower(cmd = '') {
    const topic = 'cmnd/' + this.powerTopic;
    const responseTopic = 'stat/' + this.powerTopic;
    const msg = await this.platform.mqttClient.submit(topic, cmd, responseTopic);
    this.setPower(msg === 'ON');
  }

  async setOn(value: CharacteristicValue) {
    const power = value as boolean;
    if (this.power !== power) {
      if (this.powerTopic !== undefined) {
        await this.externalPower(power ? 'ON' : 'OFF');
      } else {
        this.power = power;
        if (this.endpoint !== -1) {
          await this.zbSend({ device: this.addr, endpoint: this.endpoint, send: { Power: (this.power ? 'On' : 'Off') } });
        } else {
          await this.zbSend({ device: this.addr, send: { Power: (this.power ? 'On' : 'Off') } });
        }
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    if (this.power !== undefined) {
      return this.power;
    }
    if (this.powerTopic !== undefined) {
      await this.externalPower();
    } else {
      if (this.endpoint !== -1) {
        await this.zbSend({ device: this.addr, endpoint: this.endpoint, cluster: 6, read: 0 }, false);
      } else {
        await this.zbSend({ device: this.addr, cluster: 6, read: 0 }, false);
      }
    }
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

}