import {
  CharacteristicValue,
} from 'homebridge';

const UPDATE_TIMEOUT = 2000;

export class ZbBridgeValue {
  private value: CharacteristicValue
  private setValue: CharacteristicValue
  private setTs: number;
  private updateTs: number;

  constructor(initial: CharacteristicValue) {
    this.value = this.setValue = initial;
    this.setTs = Date.now();
    this.updateTs = 0;
  }

  timeouted(ts: number): boolean {
    return (Date.now() > (ts + UPDATE_TIMEOUT)) ;
  }

  update(to: CharacteristicValue): boolean {
    const now = Date.now();
    let ignored = (to === this.value) || (this.setTs > this.updateTs && !this.timeouted(this.setTs));
    if (to === this.setValue) {
      this.value = to;
      this.updateTs = now;
      ignored = true;
    }
    if (!ignored) {
      this.updateTs = now;
      this.value = to;
    }
    return ignored;
  }

  set(to: CharacteristicValue) {
    this.setValue = to;
    this.setTs = Date.now();
  }

  get(): CharacteristicValue {
    if (this.setTs > this.updateTs && !this.timeouted(this.setTs)) {
      return this.setValue;
    }
    return this.value;
  }

  queryNeeded(): boolean {
    return (this.setTs > this.updateTs) && this.timeouted(this.setTs);
  }

}