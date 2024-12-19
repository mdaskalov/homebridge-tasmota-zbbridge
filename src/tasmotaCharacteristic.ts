import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  Formats,
  Characteristic,
  HAPStatus,
  AdaptiveLightingController,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';
import { TasmotaDevice } from './tasmotaAccessory';
import { TasmotaCommand, Mapping, TasmotaCharacteristicDefinition } from './tasmotaDeviceDefinition';

const EXEC_TIMEOUT = 1000;

type TemplateVariables = { [key: string]: string };

export class TasmotaCharacteristic {
  private adaptiveLightingController?: AdaptiveLightingController;
  private device: TasmotaDevice;
  private logTimeouts: boolean;
  private logUnexpected: boolean;
  private variables: TemplateVariables;
  private value: CharacteristicValue | undefined;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
    readonly service: Service,
    readonly characteristic: Characteristic,
    readonly definition: TasmotaCharacteristicDefinition,
  ) {
    this.device = this.accessory.context.device;
    this.logTimeouts = this.accessory.context.logTimeouts;
    this.logUnexpected = this.accessory.context.logUnexpected;
    this.variables = {
      deviceName: this.device.name,
      topic: this.device.topic,
      stat: 'stat/' + this.device.topic,
      sensor: 'tele/' + this.device.topic + '/SENSOR',
      idx: this.device.index || '',
    };

    if (definition.props !== undefined) {
      for (const [name, value] of Object.entries(definition.props as object)) {
        if (this.characteristic.props[name] !== undefined) {
          this.log('props.%s set to %s', name, value);
          this.characteristic.props[name] = value;
        } else {
          this.platform.log.error('%s: %s Invalid property: props.%s - ignored',
            this.device.name,
            this.characteristic.displayName,
            name,
          );
        }
      }
    }
    //this.log('characteristic props: %s', JSON.stringify(characteristic.props));
    this.value = undefined;
    if (characteristic.UUID === this.platform.Characteristic.ColorTemperature.UUID) {
      this.enableAdaptiveLighting();
    }
    const onGetEnabled = this.characteristic.props.perms.includes(this.platform.api.hap.Perms.PAIRED_READ);
    const onSetEnabled = this.characteristic.props.perms.includes(this.platform.api.hap.Perms.PAIRED_WRITE);
    if (onGetEnabled) {
      this.characteristic.onGet(this.onGet.bind(this));
    }
    if (onSetEnabled) {
      this.characteristic.onSet(this.onSet.bind(this));
    }
    // stat path defaults to get.res.path if not set
    if (definition.stat?.update !== false) {
      const topic = this.replaceTemplate(definition.stat?.topic || '{stat}/RESULT');
      const path = this.replaceTemplate(definition.stat?.path || definition.get?.res?.path || definition.get?.cmd || '');
      if (path !== '') {
        const disableALUUIDs = [
          this.platform.Characteristic.ColorTemperature.UUID,
          this.platform.Characteristic.Hue.UUID,
          this.platform.Characteristic.Saturation.UUID,
        ];
        this.log('Configure status-update on topic: %s, path: %s, update: %s',
          topic,
          path,
          definition.stat?.update ? definition.stat?.update === true ? 'Always' : 'Never' : 'OnChange',
        );
        this.platform.mqttClient.subscribe(topic, message => {
          const value = this.platform.mqttClient.getValueByPath(message, path);
          if (value !== undefined) {
            const mapping = definition.stat?.mapping ? definition.stat?.mapping : definition.get?.res?.mapping;
            const hbValue = this.mapToHB(value, mapping);
            if (hbValue !== undefined) {
              const prevValue = this.value;
              const updateAlways = definition.stat?.update === true;
              const update = (value !== prevValue) || updateAlways;
              if (update) {
                if (disableALUUIDs.includes(this.characteristic.UUID)) {
                  this.disableAdaptiveLighting();
                }
                this.value = hbValue;
                this.characteristic.updateValue(hbValue);
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
  }

  private async onGet(): Promise<CharacteristicValue> {
    if (this.value !== undefined) {
      return this.value;
    }
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
        this.logTimeout(err as string);
      }
    }
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
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
          this.value = value;
          this.log('onSet value: %s (tasmota: %s)', value, payload);
          return;
        } else {
          this.value = undefined;
          this.platform.log.warn('%s:%s Set value: %s: %s (tasmota: %s) not confirmed: %s: %s (tasmota: %s)',
            this.device.name,
            this.characteristic.displayName,
            value,
            typeof (value),
            payload,
            hbConfirmValue,
            typeof (hbConfirmValue),
            confirmValue,
          );
        }
      } catch (err) {
        this.value = undefined;
        this.logTimeout(err as string);
        throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
      }
    }
  }

  private enableAdaptiveLighting() {
    this.adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(this.service, {
      controllerMode: this.platform.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
    });
    if (this.adaptiveLightingController) {
      this.accessory.configureController(this.adaptiveLightingController);
      this.platform.log.info('AdaptiveLighting enabled');
    }
  }

  private disableAdaptiveLighting() {
    if (this.adaptiveLightingController) {
      this.adaptiveLightingController.disableAdaptiveLighting();
      this.log('AdaptiveLighting disabled');
    }
  }

  private async exec(command: TasmotaCommand, payload?: string): Promise<string> {
    const split = command.cmd.split(' ');
    const cmd = this.replaceTemplate(split[0]);
    const message = payload || split[1] || '';
    const reqTopic = `cmnd/${this.device.topic}/${cmd}`;
    const resTopic = this.replaceTemplate(command.res?.topic || '{stat}/RESULT');
    const path = this.replaceTemplate(command.res?.path || cmd);

    try {
      let response = '';
      await this.platform.mqttClient.read(reqTopic, message, resTopic, EXEC_TIMEOUT, (message) => {
        const res = this.platform.mqttClient.getValueByPath(message, path);
        if (res === undefined) {
          const msg = `${this.device.name}:${this.characteristic.displayName} expecting ${path}, ignored: ${message}`;
          if (this.logUnexpected === true) {
            this.platform.log.warn(msg);
          } else {
            this.platform.log.debug(msg);
          }
          return false; // ignore this message and wait
        }
        response = res;
        if (command.res?.shared !== true) {
          return true; // consume message
        }
      });
      return response;
    } catch (err) {
      throw `${this.device.name}:${this.characteristic.displayName} Command "${reqTopic} ${message}: ${err}`;
    }
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
        return (value === 'ON' || value === '1' || value === 'True') ? true : false;
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
    const numValue = Number(value);
    if (this.characteristic.props.minValue !== undefined && numValue < this.characteristic.props.minValue) {
      return this.characteristic.props.minValue;
    }
    if (this.characteristic.props.maxValue !== undefined && numValue > this.characteristic.props.maxValue) {
      return this.characteristic.props.maxValue;
    }
    return value;
  }

  logTimeout(message: string): void {
    if (this.logTimeouts === true) {
      this.platform.log.error(message);
    } else {
      this.platform.log.debug(message);
    }
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug(
      this.replaceTemplate(`${this.device.name}:${this.characteristic.displayName} ${message}`),
      ...parameters,
    );
  }

}
