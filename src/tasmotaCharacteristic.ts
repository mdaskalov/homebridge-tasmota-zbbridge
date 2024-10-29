import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicProps,
  Formats,
  Characteristic,
  HAPStatus,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

const EXEC_TIMEOUT = 1500;

export type Mapping = {
  from: string,
  to: CharacteristicValue
}[];

export type TasmotaCommand = {
  cmd: string;
  topic?: string;
  valuePath?: string;
};

export enum StatUpdate {
  OnChange,
  Always,
  Never,
}

export type TasmotaCharacteristicDefinition = {
  get?: TasmotaCommand;
  set?: TasmotaCommand;
  statTopic?: string;
  statValuePath?: string;
  statUpdate?: StatUpdate;
  teleTopic?: string;
  teleValuePath?: string;
  props?: object
  mapping?: Mapping;
  defaultValue?: CharacteristicValue;
};

export class TasmotaCharacteristic {
  private cmndTopic: string;
  private statTopic: string;
  private teleTopic: string;

  private characteristic: Characteristic;
  private props: CharacteristicProps;
  private value: CharacteristicValue;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly service: Service,
    readonly name: string,
    readonly definition: TasmotaCharacteristicDefinition,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic + '/';
    this.statTopic = 'stat/' + this.accessory.context.device.topic + '/';
    this.teleTopic = 'tele/' + this.accessory.context.device.topic + '/';

    this.characteristic = this.service.getCharacteristic(this.platform.Characteristic[this.name]);
    if (this.characteristic !== undefined) {
      if (definition.props !== undefined) {
        for (const [name, value] of Object.entries(definition.props as object)) {
          if (this.characteristic.props[name] !== undefined) {
            this.log('props.%s set to %s', name, value);
            this.characteristic.props[name] = value;
          } else {
            this.platform.log.error('%s: %s Invalid property: props.%s - ignored',
              this.accessory.context.device.name,
              this.name,
              name,
            );
          }
        }
      }
      this.props = this.characteristic.props;
      //this.log('characteristic props: %s', JSON.stringify(this.props));
      this.value = this.initValue();
      const onGetEnabled = this.props.perms.includes(this.platform.api.hap.Perms.PAIRED_READ);
      const onSetEnabled = this.props.perms.includes(this.platform.api.hap.Perms.PAIRED_WRITE);
      if (onGetEnabled) {
        this.characteristic.onGet(this.onGet.bind(this));
      }
      if (onSetEnabled) {
        this.characteristic.onSet(this.onSet.bind(this));
      }
      // statValuePath defaults to get.cmd if not set
      const onStatEnabled = (definition.statValuePath !== undefined || definition.get?.cmd !== undefined);
      if (onStatEnabled && definition.statUpdate !== StatUpdate.Never) {
        const statTopic = this.statTopic + (definition.statTopic || 'RESULT');
        const valuePath = this.definition.statValuePath || this.definition?.get?.cmd;
        this.log('Configure statUpdate on topic: %s %s', statTopic, valuePath);
        this.platform.mqttClient.subscribeTopic(statTopic, message => {
          if (valuePath !== undefined) {
            this.setValue('statUpdate', this.getValueByPath(message, valuePath));
          }
        });
      }
      // teleValuePath must be set to enable
      if (definition.teleValuePath !== undefined) {
        const teleTopic = this.teleTopic + (definition.teleTopic || 'SENSOR');
        const valuePath = definition.teleValuePath;
        this.log('Configure teleUpdate on topic: %s %s', teleTopic, valuePath);
        this.platform.mqttClient.subscribeTopic(teleTopic, message => {
          this.setValue('teleUpdate', this.getValueByPath(message, valuePath));
        });
      }
    } else {
      throw new Error (`Unable to initialize characteristic: ${this.name}`);
    }
  }

  private async onGet(): Promise<CharacteristicValue> {
    if (this.definition.get !== undefined) {
      try {
        const value = await this.exec(this.definition.get);
        this.setValue('onGet', value);
      } catch (err) {
        this.platform.log.error(err as string);
        throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
      }
    }
    return this.value;
  }

  private async onSet(value: CharacteristicValue) {
    const command = this.definition.get ? this.definition.get : this.definition.set;
    const payload = this.mapFromHB(value);
    if (command !== undefined && payload !== undefined) {
      try {
        const valueToConfirm = await this.exec(command, payload);
        if (valueToConfirm === payload) {
          this.setValue('onSet', payload);
        } else {
          this.platform.log.warn('%s:%s Set value: %s (%s (%s)) confirmation differs: %s (%s)',
            this.accessory.context.device.name,
            this.name,
            value,
            payload,
            typeof(payload),
            valueToConfirm,
            typeof(valueToConfirm),
          );
        }
      } catch (err) {
        this.platform.log.error(err as string);
      }
    }
  }

  async exec(command: TasmotaCommand, payload?: string): Promise<string> {
    return new Promise((resolve: (value: string) => void, reject: (error: string) => void) => {
      const split = command.cmd.split(' ');
      const cmd = split[0];
      const message = payload || split[1] || '';
      const reqTopic = this.cmndTopic + cmd;
      const resTopic = this.statTopic + (command.topic || 'RESULT');
      const valuePath = command.valuePath || cmd;

      const start = Date.now();
      let timeout: NodeJS.Timeout | undefined = undefined;
      let handlerId: string | undefined = undefined;
      handlerId = this.platform.mqttClient.subscribeTopic(resTopic, responseMessage => {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        const response = this.getValueByPath(responseMessage, valuePath);
        if (response !== undefined) {
          if (handlerId !== undefined) {
            this.platform.mqttClient.unsubscribe(handlerId);
          }
          resolve(response);
          return true; // consume message
        }
      }, true);
      timeout = setTimeout(() => {
        if (handlerId !== undefined) {
          this.platform.mqttClient.unsubscribe(handlerId);
        }
        const elapsed = Date.now() - start;
        reject(`${this.accessory.context.device.name}:${this.name} Command "${reqTopic} ${message}" timeouted after ${elapsed}ms`);
      }, EXEC_TIMEOUT);
      this.platform.mqttClient.publish(reqTopic, message);
    });
  }

  setValue(origin: string, value: string | undefined) {
    if (value !== undefined) {
      const hbValue = this.checkHBValue(this.mapToHB(value));
      if (hbValue !== undefined) {
        const prevValue = this.value;
        const update = (hbValue !== prevValue) || this.definition.statUpdate === StatUpdate.Always;
        if (update) {
          this.service.getCharacteristic(this.platform.Characteristic[this.name]).updateValue(hbValue);
          this.value = hbValue;
        }
        this.log('%s valueSet%s: %s (hb: %s), prev: %s',
          origin,
          update ? '' : ' (not updated)',
          value,
          hbValue,
          prevValue,
        );
      }
    }
  }

  private getValueByPath(json: string, path: string): string | undefined {
    let obj = Object();
    try {
      obj = JSON.parse(json);
    } catch {
      return undefined; // not parsed
    }
    const result = path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
    return result !== undefined ? String(result) : undefined;
  }

  private mapFromHB(value: CharacteristicValue): string | undefined {
    if (Array.isArray(this.definition.mapping)) {
      const mapEntry = this.definition.mapping.find(m => m.to === value);
      if (mapEntry !== undefined) {
        return mapEntry.from;
      }
      return undefined;
    }
    switch (this.props.format) {
      case Formats.BOOL:
        return value ? 'ON' : 'OFF';
      default:
        return String(value);
    }
  }

  private mapToHB(value: string): CharacteristicValue | undefined {
    if (Array.isArray(this.definition.mapping)) {
      const mapEntry = this.definition.mapping.find(m => m.from === value);
      if (mapEntry !== undefined) {
        return mapEntry.to;
      }
      return undefined;
    }
    switch (this.props.format) {
      case Formats.BOOL:
        return (value === 'ON' || value === '1' || value === 'True') ? true :false;
      case Formats.STRING:
      case Formats.DATA:
      case Formats.TLV8:
        return value;
      default:
        return this.checkHBValue(value);
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

  private initValue(): CharacteristicValue {
    if (this.definition.defaultValue !== undefined) {
      const value = this.checkHBValue(this.definition.defaultValue);
      if (value !== undefined) {
        return value;
      }
    }
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

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug(this.accessory.context.device.name + ':' + this.name + ' ' + message,
      ...parameters,
    );
  }

}
