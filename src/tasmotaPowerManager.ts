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

  private powerStateChanged(msg: string, topic: string) {
    const affectedAccessories = this.accessories.filter(a => topic === 'stat/' + a.topic);
    for (const accessory of affectedAccessories) {
      const state = (msg === 'ON');
      accessory.state = state;
      if (accessory.stateCallback !== undefined) {
        accessory.stateCallback(state);
      }
    }
  }

  findAccessory(ieee_address: string): PoweredAccessory | undefined {
    return this.accessories.find(a => a.ieee_address === ieee_address);
  }

  addAccessory(ieee_address: string, topic: string, name: string) {
    const accessory = this.findAccessory(ieee_address);
    if (accessory !== undefined) {
      return;
    }
    const subscribed = this.accessories.some(a => a.topic === topic);
    this.accessories.push({ ieee_address, topic, name, state: false });
    if (!subscribed) {
      this.mqttClient.subscribeTopic('stat/' + topic, (msg, topic) => this.powerStateChanged(msg, topic));
    }
    // request update
    this.mqttClient.publish('cmnd/' + topic, '');
  }

  addStateCallback(ieee_address: string, stateCallback: PowerStateCallback): boolean {
    const accessory = this.findAccessory(ieee_address);
    if (accessory !== undefined) {
      accessory.stateCallback = stateCallback;
    }
    return false;
  }

  private findOtherAcessory(accessory: PoweredAccessory) {
    const other = this.accessories.find(a =>
      a.topic === accessory.topic && a.ieee_address !== accessory.ieee_address && a.state === true);
    return (other !== undefined);
  }

  isOn(ieee_address: string): boolean {
    const accessory = this.findAccessory(ieee_address);
    return accessory?.state === true;
  }

  getState(ieee_address: string): boolean | undefined {
    const accessory = this.findAccessory(ieee_address);
    if (accessory !== undefined) {
      this.mqttClient.publish('cmnd/' + accessory.topic, '');
      return accessory.state;
    }
  }

  setState(ieee_address: string, state: boolean): boolean {
    const accessory = this.findAccessory(ieee_address);
    if (accessory !== undefined) {
      accessory.state = state;
      if (!this.findOtherAcessory(accessory)) {
        this.mqttClient.publish('cmnd/' + accessory.topic, state ? 'ON' : 'OFF');
        return true;
      }
    }
    return false;
  }

}
