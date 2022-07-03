import {
  CharacteristicValue,
  Logger,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';


const UPDATE_TIMEOUT = 2000;

export class ZbBridgeValue {
  private value: CharacteristicValue
  private setValue: CharacteristicValue
  private setTs: number;
  private updateTs: number;

  constructor(private logger: Logger, private label: string, initial: CharacteristicValue) {
    this.value = this.setValue = initial;
    this.setTs = Date.now()-UPDATE_TIMEOUT;
    this.updateTs = Date.now();
  }

  timeouted(ts: number): boolean {
    return (Date.now() > (ts + UPDATE_TIMEOUT)) ;
  }

  update(to: CharacteristicValue): boolean {
    const now = Date.now();
    this.log('to: %s, value: %s, updateTs: %s, setTs: %s',
      to,
      this.value,
      ZbBridgeAccessory.formatTs(this.updateTs),
      ZbBridgeAccessory.formatTs(this.setTs),
    );
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

    this.log('ignored: %s', ignored);
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

  needsUpdate(): boolean {
    return (this.setTs > this.updateTs) && this.timeouted(this.setTs);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, ...parameters: any[]): void {
    this.logger.debug('Value (%s) ' + message,
      this.label,
      ...parameters,
    );
  }

}