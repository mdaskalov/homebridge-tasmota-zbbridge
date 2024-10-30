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

export type TasmotaResponse = {
  topic?: string;
  path?: string;
  update?: boolean;
  shared?: boolean;
}

export type TasmotaCommand = {
  cmd: string;
  res?: TasmotaResponse;
};

export type TasmotaCharacteristicDefinition = {
  get?: TasmotaCommand;
  set?: TasmotaCommand;
  stat?: TasmotaResponse;
  props?: object
  mapping?: Mapping;
  default?: CharacteristicValue;
};

type TemplateVariables = {[key: string]: string };

export class TasmotaCharacteristic {
  private variables: TemplateVariables;

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
    this.variables = {
      topic: this.accessory.context.device.topic,
      stat: 'stat/' + this.accessory.context.device.topic,
      sensor: 'tele/' + this.accessory.context.device.topic + '/SENSOR',
      idx: this.accessory.context.device.index || '',
    };

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
      // stat path defaults to get.res.path if not set
      if (definition.stat?.update !== false) {
        const topic = this.replaceTemplate(definition.stat?.topic || '{stat}/RESULT');
        const path = definition.stat?.path || definition.get?.res?.path || definition.get?.cmd;
        if (path !== undefined) {
          this.log('Configure statUpdate on topic: %s %s', topic, path);
          this.platform.mqttClient.subscribeTopic(topic, message => {
            this.setValue('statUpdate', this.getValueByPath(message, path));
          });
        }
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
      const cmd = this.replaceTemplate(split[0]);
      const message = payload || split[1] || '';
      const reqTopic = `cmnd/${this.accessory.context.device.topic}/${cmd}`;
      const resTopic = this.replaceTemplate(command.res?.topic || '{stat}/RESULT');
      const valuePath = command.res?.path || cmd;

      const start = Date.now();
      let timeout: NodeJS.Timeout | undefined = undefined;
      let handlerId: string | undefined = undefined;
      handlerId = this.platform.mqttClient.subscribeTopic(resTopic, responseMessage => {
        const response = this.getValueByPath(responseMessage, valuePath);
        if (response !== undefined) {
          if (timeout !== undefined) {
            clearTimeout(timeout);
          }
          if (handlerId !== undefined) {
            this.platform.mqttClient.unsubscribe(handlerId);
          }
          resolve(response);
          if (command.res?.shared !== true) {
            return true; // consume message
          }
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
        const getUpdateAlways = this.definition.get?.res?.update === true;
        const updateAlways = this.definition.stat?.update === true;
        const update = (hbValue !== prevValue) || updateAlways || getUpdateAlways;
        if (update) {
          this.service.getCharacteristic(this.platform.Characteristic[this.name]).updateValue(hbValue);
          this.value = hbValue;
        }
        this.log('%s value%s: %s (hb: %s), prev: %s',
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
    const result = this.replaceTemplate(path).split('.').reduce((a, v) => a ? a[v] : undefined, obj);
    return result !== undefined ? String(result) : undefined;
  }

  replaceTemplate(template: string): string {
    return template.replace(/\{(.*?)\}/g, (_, key) => this.variables[key] || '');
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
    if (this.definition.default !== undefined) {
      const value = this.checkHBValue(this.definition.default);
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
