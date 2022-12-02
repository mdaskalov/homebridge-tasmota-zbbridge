import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  HAPStatus,
  CharacteristicProps,
  Formats,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { Z2MExpose } from './zigbee2MQTTAcessory';
import { ENUMS } from './zigbee2MQTTMapping';

const UPDATE_TIMEOUT = 2000;

export class Zigbee2MQTTCharacteristic {
  public props: CharacteristicProps;
  public value: CharacteristicValue;
  private setValue: CharacteristicValue;
  private getTs: number;
  private setTs: number;
  private awaitGetUpdate = false;
  private awaitSetUpdate = false;

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
    this.getTs = Date.now() - UPDATE_TIMEOUT;

    const characteristic = this.service.getCharacteristic(this.platform.Characteristic[this.characteristicName]);
    if (characteristic !== undefined) {
      this.props = characteristic.props;
      this.value = this.initValue();
      this.setValue = this.value;
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
      case Formats.BOOL: return false;
      case Formats.INT:
      case Formats.FLOAT:
      case Formats.UINT8:
      case Formats.UINT16:
      case Formats.UINT32:
      case Formats.UINT64:
        return this.props.minValue !== undefined ? this.props.minValue : 0;
    }
    return '';
  }

  private timeouted(ts: number): boolean {
    return (Date.now() > (ts + UPDATE_TIMEOUT));
  }

  private async onGetValue(): Promise<CharacteristicValue> {
    if (this.awaitGetUpdate && !this.timeouted(this.getTs)) {
      return this.value;
    }
    if (this.awaitSetUpdate && !this.timeouted(this.setTs)) {
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    if (this.onGet !== undefined) {
      this.getTs = Date.now();
      this.awaitGetUpdate = true;
      const value = this.checkHBValue(this.onGet());
      if (value === undefined) {
        throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
      }
      this.value = value;
    }
    return this.value;
  }

  private async onSetValue(value: CharacteristicValue) {
    if (this.onSet !== undefined) {
      const setValue = this.mapZ2MValue(value);
      if (setValue !== undefined) {
        this.onSet(setValue);
        this.setValue = setValue;
        this.setTs = Date.now();
        this.awaitSetUpdate = true;
        return;
      }
    }
    this.value = value;
  }

  update(value: CharacteristicValue | undefined) {
    const updatedValue = this.mapHBValue(value);
    if (updatedValue !== undefined) {
      if (this.awaitGetUpdate) {
        this.service.getCharacteristic(this.platform.Characteristic[this.characteristicName]).updateValue(updatedValue);
        this.awaitGetUpdate = false;
      }

      if (this.awaitSetUpdate) {
        if (value === this.setValue) {
          this.value = updatedValue; // confirmed
          this.awaitSetUpdate = false;
          return;
        }
        if (!this.timeouted(this.setTs)) {
          return; // ignore
        }
        this.awaitSetUpdate = false;
      }
      if (updatedValue !== this.value) {
        //this.log('update: %s, old: %s', updatedValue, this.value);
        this.service.getCharacteristic(this.platform.Characteristic[this.characteristicName]).updateValue(updatedValue);
        this.value = updatedValue;
      }
    }
  }

  // homebridge -> Zigbee2MQTT
  mapZ2MValue(value: CharacteristicValue): CharacteristicValue | undefined {
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
        return isNaN(value as number) ? undefined : this.mapZ2MNumericValue(value);
    }
  }

  // Zigbee2MQTT -> homebridge
  mapHBValue(value: CharacteristicValue | undefined): CharacteristicValue | undefined {
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
          return isNaN(value as number) ? undefined : this.mapHBNumericValue(value);
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
  mapZ2MNumericValue(value: CharacteristicValue): CharacteristicValue | undefined {
    if (this.props.minValue === undefined || this.props.maxValue === undefined) {
      return undefined;
    }
    if (this.exposed.value_min === undefined || this.exposed.value_max === undefined) {
      return undefined;
    }
    if (this.props.minValue === this.exposed.value_min && this.props.maxValue === this.exposed.value_max) {
      return undefined;
    }
    const mappedValue = Zigbee2MQTTCharacteristic.mapValue(
      value as number,
      this.props.minValue, this.props.maxValue,
      this.exposed.value_min, this.exposed.value_max,
    );
    return this.checkZ2MValue(mappedValue);
  }

  // Zigbee2MQTT -> homebridge
  mapHBNumericValue(value: CharacteristicValue): CharacteristicValue | undefined {
    if (this.exposed.value_min === undefined || this.exposed.value_max === undefined) {
      return undefined;
    }
    if (this.props.minValue === undefined || this.props.maxValue === undefined) {
      return undefined;
    }
    if (this.exposed.value_min === this.props.minValue && this.exposed.value_max === this.props.maxValue) {
      return undefined;
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
