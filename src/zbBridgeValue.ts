import {
  CharacteristicValue,
} from 'homebridge';

const UPDATE_TIMEOUT = 2000;

export class ZbBridgeValue {
  private value?: CharacteristicValue
  private setValue?: CharacteristicValue
  private setTs: number;
  private queryTs: number;
  private updateTs: number;

  constructor() {
    this.value = undefined;
    this.setTs = this.queryTs = Date.now();
    this.updateTs = this.setTs +1;
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

  get(): CharacteristicValue | undefined {
    let res: CharacteristicValue | undefined = undefined;
    if (this.setTs > this.updateTs && !this.timeouted(this.setTs)) {
      res = this.setValue;
    } else if (this.queryTs > this.updateTs && this.timeouted(this.queryTs)) {
      res = undefined;
    } else {
      res = this.value;
    }

    if (res === undefined) {
      this.queryTs = Date.now();
    }

    return res;
  }

}