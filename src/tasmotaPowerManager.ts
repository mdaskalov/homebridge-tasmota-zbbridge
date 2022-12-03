import { Logger } from 'homebridge';
import { MQTTClient } from './mqttClient';

type PowerStateCallback =
  (state: boolean) => void;

export type PoweredAccessory = {
  ieee_address: string;
  topic: string;
  name: string;
  state: boolean;
  stateCallback?: PowerStateCallback;
};

export class TasmotaPowerManager {
  private accessories: PoweredAccessory[] = [];

  constructor(
    readonly log: Logger,
    readonly mqttClient: MQTTClient) {
  }

  powerStateChanged(msg: string, topic: string) {
    const affectedAccessories = this.accessories.filter(a => topic === 'stat/' + a.topic);
    for (const accessory of affectedAccessories) {
      const state = (msg === 'ON');
      accessory.state = state;
      if (accessory.stateCallback !== undefined) {
        accessory.stateCallback(state);
      }
    }
  }

  addAccessory(ieee_address: string, topic: string, name: string) {
    const subscribed = this.accessories.some(a => a.topic === topic);
    this.accessories.push({ ieee_address, topic, name, state: false });
    if (!subscribed) {
      this.mqttClient.subscribeTopic('stat/' + topic, (msg, topic) => this.powerStateChanged(msg, topic));
    }
    // request update
    this.mqttClient.publish('cmnd/' + topic, '');
  }

  addStateCallback(ieee_address: string, stateCallback: PowerStateCallback): boolean {
    const accessory = this.accessories.find(a => a.ieee_address = ieee_address);
    if (accessory !== undefined) {
      accessory.stateCallback = stateCallback;
    }
    return false;
  }

  getState(ieee_address: string): boolean | undefined {
    const accessory = this.accessories.find(a => a.ieee_address = ieee_address);
    if (accessory !== undefined) {
      return accessory.state;
    }
  }

  setState(ieee_address: string, state: boolean): boolean {
    const accessory = this.accessories.find(a => a.ieee_address = ieee_address);
    if (accessory !== undefined) {
      this.mqttClient.publish('cmnd/' + accessory.topic, state ? 'ON' : 'OFF');
      accessory.state = state;
      return true;
    }
    return false;
  }

}
