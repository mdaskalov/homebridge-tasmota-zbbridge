import {
  CharacteristicValue,
} from 'homebridge';

const UPDATE_TIMEOUT = 2000;

export class ZbBridgeValue {
  private value?: CharacteristicValue
  private newValue?: CharacteristicValue
  private setTs?: number
  private queryTs?: number
  private updateTs?: number

  constructor() {
    this.value = undefined;
    this.setTs = undefined;
    this.queryTs = undefined;
    this.updateTs = undefined;
  }

  query() {
    this.queryTs = Date.now();
  }

  set(to: CharacteristicValue) {
    this.setTs = Date.now();
    this.newValue = to;
  }

  update(to: CharacteristicValue) {
    this.updateTs = Date.now();
    this.value = to;
  }

  timeouted(ts: number): boolean {
    return ts + UPDATE_TIMEOUT > Date.now();
  }

  get(): CharacteristicValue | undefined {
    // not updated yet
    if (this.updateTs === undefined) {
      return (this.setTs !== undefined && !this.timeouted(this.setTs)) ? this.newValue : undefined;
    }

    // set but not udpated
    if (this.setTs !== undefined && this.setTs > this.updateTs && !this.timeouted(this.setTs)) {
      return this.newValue;
    }

    // query timeout
    if (this.queryTs !== undefined && this.queryTs > this.updateTs && this.timeouted(this.queryTs)) {
      return undefined;
    }

    return this.value;
  }


}