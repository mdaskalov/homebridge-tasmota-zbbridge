import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeAccessory } from './zbBridgeAccessory';

const UPDATE_TIMEOUT = 2000;

export class Zigbee2MQTTCharacteristic {
  public value: CharacteristicValue;
  private setValue: CharacteristicValue;
  private setTs: number;
  private updateTs: number;

  public onGet?: () => CharacteristicValue | undefined;
  public onSet?: (value: CharacteristicValue) => void;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly service: Service,
    readonly characteristic: string,
    readonly initial: CharacteristicValue,
  ) {
    this.value = initial;
    this.setValue = initial;
    this.setTs = Date.now() - UPDATE_TIMEOUT;
    this.updateTs = Date.now();

    this.service.getCharacteristic(this.platform.Characteristic[this.characteristic])
      .onGet(this.onGetValue.bind(this))
      .onSet(this.onSetValue.bind(this));

  }

  private timeouted(ts: number): boolean {
    return (Date.now() > (ts + UPDATE_TIMEOUT));
  }

  private updateValue(value: CharacteristicValue): boolean {
    const now = Date.now();
    const oldValue = this.value;
    const updateTs = ZbBridgeAccessory.formatTs(this.updateTs);
    const setTs = ZbBridgeAccessory.formatTs(this.setTs);
    let ignored = (value === oldValue) || ((this.setTs > this.updateTs) && !this.timeouted(this.setTs));
    if (!ignored) {
      this.value = value;
      this.updateTs = now;
    } else if (value === this.setValue) {
      this.value = value;
      this.updateTs = now;
      ignored = true;
    }
    this.log('updateValue: %s, old: %s, set: %s, setTs: %s, updateTs: %s%s',
      value,
      oldValue,
      this.setValue,
      setTs,
      updateTs,
      (ignored ? ' (ignored)' : ''),
    );
    return ignored;
  }

  private async onGetValue(): Promise<CharacteristicValue> {
    const updated = (this.updateTs >= this.setTs);
    const timeouted = this.timeouted(this.setTs);

    const notUpdated = !updated && !timeouted;
    const needsUpdate = !updated && timeouted;

    let value: CharacteristicValue | undefined = notUpdated ? this.setValue : this.value;

    if (needsUpdate && this.onGet !== undefined) {
      value = this.onGet();
    }
    if (value === undefined) {
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    if (value !== this.value) {
      this.value = value;
    }
    return value;
  }

  private async onSetValue(value: CharacteristicValue) {
    this.setValue = value;
    this.setTs = Date.now();
    if (this.onSet !== undefined) {
      this.onSet(value);
    }
  }

  update(value: CharacteristicValue | undefined): string {
    let statusText = '';
    if (value !== undefined) {
      const updateIgnored = this.updateValue(value);
      if (!updateIgnored) {
        this.service.getCharacteristic(this.platform.Characteristic[this.characteristic]).updateValue(value);
        statusText += ` ${this.characteristic}: ${value}`;
      }
    }
    return statusText;
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug(this.accessory.context.device.name + ':' + this.characteristicName + ' ' + message,
      ...parameters,
    );
  }

  static mapMaxValue(value: number, in_max: number, out_max: number): number {
    return Math.round(out_max * value / in_max);
  }

  static mapValue(value: number, in_min: number, in_max: number, out_min: number, out_max: number): number {
    if (in_max === in_min) {
      return value;
    }
    const dividend = out_max - out_min;
    const divisor = in_max - in_min;
    const delta = value - in_min;
    return Math.round((delta * dividend + (divisor / 2)) / divisor + out_min);
  }

}
