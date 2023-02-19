import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
  CharacteristicProps,
  Formats,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { Z2MExpose } from './zigbee2MQTTAcessory';
import { ENUMS } from './zigbee2MQTTMapping';

const UPDATE_TIMEOUT = 2000;

export class Zigbee2MQTTCharacteristic {
  public props: CharacteristicProps;
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
    readonly characteristicName: string,
    readonly exposed: Z2MExpose,
  ) {
    this.setTs = Date.now() - UPDATE_TIMEOUT;
    this.updateTs = Date.now();

    const characteristic = this.service.getCharacteristic(this.platform.Characteristic[this.characteristicName]);
    if (characteristic !== undefined) {
      this.props = characteristic.props;
      this.value = this.initValue();
      this.setValue = this.initValue();
      //this.log('characteristic props: %s', JSON.stringify(this.props));
      if (this.props.perms.includes(this.platform.api.hap.Perms.PAIRED_READ)) {
        characteristic.onGet(this.onGetValue.bind(this));
      }
      if (this.props.perms.includes(this.platform.api.hap.Perms.PAIRED_WRITE)) {
        characteristic.onSet(this.onSetValue.bind(this));
      }
    } else {
      throw (`Unable to initialize characteristic: ${this.characteristicName}`);
    }
  }

  private initValue(): CharacteristicValue {
    switch (this.props.format) {
      case Formats.BOOL:
        return false;
      case Formats.STRING:
      case Formats.DATA:
      case Formats.TLV8:
        return '';
      default: {
        const value = this.checkHBValue(0);
        return value !== undefined ? value : 0;
      }
    }
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
      value = this.mapValueToHB(this.onGet());
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
      const mappedValue = this.mapValueToZ2M(value);
      if (mappedValue !== undefined) {
        this.onSet(mappedValue);
      }
    }
  }

  update(value: CharacteristicValue | undefined): boolean {
    const mappedValue = this.mapValueToHB(value);
    if (mappedValue !== undefined) {
      const updateIgnored = this.updateValue(mappedValue);
      if (!updateIgnored) {
        this.service.getCharacteristic(this.platform.Characteristic[this.characteristicName]).updateValue(mappedValue);
        return true;
      }
    }
    return false;
  }

  // homebridge -> Zigbee2MQTT
  mapValueToZ2M(value: CharacteristicValue): CharacteristicValue | undefined {
    switch (this.exposed.type) {
      case 'binary':
        if (value as boolean === true) {
          return this.exposed.value_on;
        }
        if (value as boolean === false) {
          return this.exposed.value_off;
        }
        break;
      case 'numeric':
        return isNaN(value as number) ? undefined : this.mapNumericValueToZ2M(value);
    }
  }

  // Zigbee2MQTT -> homebridge
  mapValueToHB(value: CharacteristicValue | undefined): CharacteristicValue | undefined {
    if (value !== undefined) {
      switch (this.exposed.type) {
        case 'binary':
          if (value === this.exposed.value_on) {
            return true;
          }
          if (value === this.exposed.value_off) {
            return false;
          }
          return value;
        case 'enum': {
          const customindex = ENUMS[this.exposed.property][value];
          const index = customindex !== undefined ? customindex : this.exposed.values.indexOf(value as string);
          //this.log('got %s as index of %s:%s', index, this.exposed.property, value);
          return (index === undefined ? 0 : index);
        }
        case 'numeric':
          return isNaN(value as number) ? undefined : this.mapNumericValueToHB(value);
      }
    }
  }

  private checkHBValue(value: CharacteristicValue | undefined): CharacteristicValue | undefined {
    if (value === undefined) {
      return value;
    }
    //this.log('return: %s :- min: %s, max: %s', value, this.props.minValue, this.props.maxValue);
    if (this.props.minValue !== undefined && value as number < this.props.minValue) {
      return this.props.minValue;
    }
    if (this.props.maxValue !== undefined && value as number > this.props.maxValue) {
      return this.props.maxValue;
    }
    return value;
  }

  private checkZ2MValue(value: CharacteristicValue | undefined): CharacteristicValue | undefined {
    if (value === undefined) {
      return value;
    }
    //this.log('return: %s :- min: %s, max: %s', value, this.exposed.value_min, this.exposed.value_max);
    if (this.exposed.value_min !== undefined && value as number < this.exposed.value_min) {
      return this.exposed.value_min;
    }
    if (this.exposed.value_max !== undefined && value as number > this.exposed.value_max) {
      return this.exposed.value_max;
    }
    return value;
  }

  // homebridge -> Zigbee2MQTT
  mapNumericValueToZ2M(value: CharacteristicValue): CharacteristicValue | undefined {
    const checkedValue = this.checkZ2MValue(value);
    if (this.props.minValue === undefined || this.props.maxValue === undefined) {
      return checkedValue;
    }
    if (this.exposed.value_min === undefined || this.exposed.value_max === undefined) {
      return checkedValue;
    }
    if (this.props.minValue === this.exposed.value_min && this.props.maxValue === this.exposed.value_max) {
      return checkedValue;
    }
    const mappedValue = Zigbee2MQTTCharacteristic.mapValue(
      value as number,
      this.props.minValue, this.props.maxValue,
      this.exposed.value_min, this.exposed.value_max,
    );
    return this.checkZ2MValue(mappedValue);
  }

  // Zigbee2MQTT -> homebridge
  mapNumericValueToHB(value: CharacteristicValue): CharacteristicValue | undefined {
    const checkedValue = this.checkHBValue(value);
    if (this.exposed.value_min === undefined || this.exposed.value_max === undefined) {
      return checkedValue;
    }
    if (this.props.minValue === undefined || this.props.maxValue === undefined) {
      return checkedValue;
    }
    if (this.exposed.value_min === this.props.minValue && this.exposed.value_max === this.props.maxValue) {
      return checkedValue;
    }
    const mappedValue = Zigbee2MQTTCharacteristic.mapValue(
      value as number,
      this.exposed.value_min, this.exposed.value_max,
      this.props.minValue, this.props.maxValue,
    );
    return this.checkHBValue(mappedValue);
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug(this.accessory.context.device.homekit_name + ':' + this.characteristicName + ' ' + message,
      ...parameters,
    );
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
