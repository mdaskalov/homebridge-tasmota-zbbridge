import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicProps,
  Formats,
  Characteristic,
  HAPStatus,
  AdaptiveLightingController,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

const EXEC_TIMEOUT = 1500;

export type SplitMapping = {
  separator?: string;
  index: number;
};

export type SwapMapping = {
  from: string,
  to: CharacteristicValue
};

export type Mapping = SplitMapping | SwapMapping[]

export type TasmotaResponse = {
  topic?: string;
  path?: string;
  update?: boolean;
  shared?: boolean;
  mapping?: Mapping;
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
  default?: CharacteristicValue;
};

type TemplateVariables = {[key: string]: string };

export class TasmotaCharacteristic {
  private variables: TemplateVariables;

  private adaptiveLightingController?: AdaptiveLightingController;
  private characteristic: Characteristic;
  private variables: TemplateVariables;
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

    this.characteristic = this.service.getCharacteristic(this.platform.Characteristic[name]);
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
      if (name === 'ColorTemperature') {
        this.enableAdaptiveLighting();
      }
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
            const value = this.getValueByPath(message, path);
            if (value !== undefined) {
              const mapping = definition.stat?.mapping ? definition.stat?.mapping : definition.get?.res?.mapping;
              const hbValue = this.mapToHB(value, mapping);
              if (hbValue !== undefined) {
                const prevValue = this.value;
                const updateAlways = definition.stat?.update === true;
                const update = (value !== prevValue) || updateAlways;
                if (update) {
                  if (this.name === 'ColorTemperature' || this.name === 'Hue' || this.name === 'Saturation') {
                    this.disableAdaptiveLighting();
                  }
                  this.value = hbValue;
                  this.service.getCharacteristic(this.platform.Characteristic[this.name]).updateValue(hbValue);
                }
                this.log('statUpdate value%s: %s (homebridge: %s), prev: %s',
                  update ? '' : ' (not updated)',
                  value,
                  hbValue,
                  prevValue,
                );
              }
            }
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
        const hbValue = this.mapToHB(value, this.definition.get.res?.mapping);
        if (hbValue !== undefined) {
          this.log('onGet value: %s (homebridge: %s)', value, hbValue);
          this.value = hbValue;
          return this.value;
        }
      } catch (err) {
        this.platform.log.error(err as string);
      }
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
    return this.value;
  }

  private async onSet(value: CharacteristicValue) {
    const command = this.definition.set ? this.definition.set : this.definition.get;
    const payload = this.mapFromHB(value, command?.res?.mapping);
    if (command !== undefined && payload !== undefined) {
      try {
        const confirmValue = await this.exec(command, payload);
        const mapping = this.definition.get?.res?.mapping ? this.definition.get?.res?.mapping : this.definition.set?.res?.mapping;
        const hbConfirmValue = this.mapToHB(confirmValue, mapping);
        if (value === hbConfirmValue) {
          this.log('onSet value: %s (tasmota: %s)', value, payload);
          this.value = value;
          return;
        } else {
          this.platform.log.warn('%s:%s Set value: %s: %s (tasmota: %s) not confirmed: %s: %s (tasmota: %s)',
            this.accessory.context.device.name,
            this.name,
            value,
            typeof(value),
            payload,
            hbConfirmValue,
            typeof(hbConfirmValue),
            confirmValue,
          );
        }
      } catch (err) {
        this.platform.log.error(err as string);
      }
    }
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  private enableAdaptiveLighting() {
    this.log('Enabled AdaptiveLighting');
    this.adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(this.service, {
      controllerMode: this.platform.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
    });
    if (this.adaptiveLightingController) {
      this.accessory.configureController(this.adaptiveLightingController);
    }
  }

  private disableAdaptiveLighting() {
    this.log('Disabled AdaptiveLighting');
    if (this.adaptiveLightingController) {
      this.adaptiveLightingController.disableAdaptiveLighting();
    }
  }

  private async exec(command: TasmotaCommand, payload?: string): Promise<string> {
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

  private mapFromHB(value: CharacteristicValue, mapping?: Mapping): string | undefined {
    if (Array.isArray(mapping)) {
      const mapEntry = mapping.find(m => m.to === value);
      if (mapEntry !== undefined) {
        return mapEntry.from;
      }
      return undefined;
    }
    switch (this.characteristic.props.format) {
      case Formats.BOOL:
        return value ? 'ON' : 'OFF';
      default:
        return String(value);
    }
  }

  private mapToHB(value: string, mapping?: Mapping): CharacteristicValue | undefined {
    let mappedValue: CharacteristicValue | undefined = value;
    if (mapping !== undefined) {
      if (Array.isArray(mapping)) {
        const mapEntry = mapping.find(m => m.from === value);
        mappedValue = mapEntry?.to;
      } else {
        const split = value.split(mapping.separator || ',');
        mappedValue = split[mapping.index];
      }
    }
    if (mappedValue === undefined) {
      return undefined;
    }
    switch (this.characteristic.props.format) {
      case Formats.BOOL:
        return (value === 'ON' || value === '1' || value === 'True') ? true :false;
      case Formats.STRING:
      case Formats.DATA:
      case Formats.TLV8:
        return mappedValue;
      default:
        return this.checkHBValue(Number(mappedValue));
    }
  }

  private checkHBValue(value?: CharacteristicValue): CharacteristicValue | undefined {
    if (value === undefined) {
      return value;
    }
    //this.log('return: %s :- min: %s, max: %s', value, this.characteristic.props.minValue, this.characteristic.props.maxValue);
    if (this.characteristic.props.minValue !== undefined && value as number < this.characteristic.props.minValue) {
      return this.characteristic.props.minValue;
    }
    if (this.characteristic.props.maxValue !== undefined && value as number > this.characteristic.props.maxValue) {
      return this.characteristic.props.maxValue;
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
    switch (this.characteristic.props.format) {
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
