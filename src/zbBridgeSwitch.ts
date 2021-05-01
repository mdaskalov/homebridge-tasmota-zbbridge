import {
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';

export class ZbBridgeSwitch extends ZbBridgeAccessory {
  private power?: CharacteristicValue;

  getServiceName() {
    return 'Switch';
  }

  registerHandlers() {
    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  onQueryInnitialState() {
    this.mqttSend({ device: this.addr, cluster: 6, read: 0 });
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
    const power = value as boolean;
    if (this.power !== power) {
      try {
        const msg = await this.mqttSubmit({ device: this.addr, send: { Power: (power ? 'On' : 'Off') } });
        if (msg.Power !== undefined) {
          this.power = (msg.Power === 1);
        }
      } catch (err) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    try {
      const msg = await this.mqttSubmit({ device: this.addr, cluster: 6, read: 0 });
      if (msg.Power !== undefined) {
        this.power = (msg.Power === 1);
        return this.power;
      }
    } catch (err) {
      this.log(err);
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }
}