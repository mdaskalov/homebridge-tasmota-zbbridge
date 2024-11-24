import { PlatformAccessory, Service } from 'homebridge';
import { TasmotaZbBridgePlatform } from './platform';
import { TasmotaDeviceDefinition, tasmotaDeviceDefinitionSchema } from './tasmotaDeviceDefinition';
import { TasmotaCharacteristic } from './tasmotaCharacteristic';
import { DEVICE_TYPES, SENSOR_TYPES } from './tasmotaDeviceTypes';
import Ajv from 'ajv';

export type TasmotaDevice = {
  topic: string;
  type: string;
  index?: string;
  custom?: string;
  name: string;
};

export class TasmotaAccessory {
  private characteristics: TasmotaCharacteristic[] = [];

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.configureAccessoryInformation();
    const deviceType = this.accessory.context.device.type;
    if (typeof deviceType === 'object') {
      this.configureDevice(deviceType);
    } else if (deviceType === 'SENSOR') {
      this.configureSensors();
    } else {
      if (DEVICE_TYPES[deviceType] !== undefined) {
        this.configureDevice(DEVICE_TYPES[deviceType]);
      } else if (deviceType === 'CUSTOM') {
        const ajv = new Ajv();
        const validate = ajv.compile(tasmotaDeviceDefinitionSchema);
        try {
          const deviceDefinition = JSON.parse(this.accessory.context.device.custom);
          const valid = validate(deviceDefinition);
          if (valid) {
            this.platform.log.info('%s: Custom device definition: %s',
              this.accessory.context.device.name,
              JSON.stringify(deviceDefinition),
            );
            this.configureDevice(deviceDefinition as TasmotaDeviceDefinition);
          } else if (validate.errors) {
            let message = '';
            let first = true;
            for (const err of validate.errors) {
              message += `${first ? '' : ', '}'${err.instancePath}' ${err.message}`;
              first = false;
            }
            this.platform.log.warn('%s: Invalid custom device definition:\n%s\n%s\n',
              this.accessory.context.device.name,
              this.accessory.context.device.custom,
              message,
            );
          }
        } catch (err) {
          if (err instanceof SyntaxError && 'message' in err) {
            const errorMessage = err.message;
            const match = errorMessage.match(/at position (\d+)/);
            if (match) {
              const position = parseInt(match[1], 10);
              const snippet = this.accessory.context.device.custom.slice(0, position);
              this.platform.log.warn('%s: Invalid custom device definition: %s:\n%s',
                this.accessory.context.device.name,
                errorMessage,
                snippet,
              );
            }
          } else {
            this.platform.log.warn('%s: Unexpected error occurred while parsing custom service JSON:\n%s\n%s',
              this.accessory.context.device.name,
              this.accessory.context.device.custom,
              err,
            );
          }
        }
      } else {
        this.platform.log.error('%s: Uknown device definition: %s',
          this.accessory.context.device.name,
          this.accessory.context.device.type,
        );
      }
    }
  }

  private getServiceByName(name: string): Service | undefined {
    const nameSplit = name.split('_');
    const serviceName = nameSplit[0];
    const serviceSubType = nameSplit[1];
    let service: Service | undefined = undefined;
    if (serviceSubType === undefined) {
      const serviceByName = this.platform.Service[serviceName];
      if (serviceByName !== undefined) {
        service = this.accessory.getService(serviceByName) || this.accessory.addService(serviceByName);
      }
    } else {
      service = this.accessory.getServiceById(this.platform.Service[serviceName], serviceSubType);
      if (!service) {
        service = this.accessory.addService(this.platform.Service, name, this.platform.Service[serviceName].UUID, serviceSubType);
      }
    }
    if (service === undefined) {
      this.platform.log.warn('Invalid service name: %s%s',
        serviceName,
        serviceSubType !== undefined ? `, subType: ${serviceSubType}` : '',
      );
    }
    return service;
  }

  private async configureDevice(deviceDefinition: TasmotaDeviceDefinition) {
    for (const [serviceName, serviceDefinition] of Object.entries(deviceDefinition as object)) {
      let configureText = `${this.accessory.context.device.name}: Configured ${serviceName} with `;
      let first = true;
      const service = this.getServiceByName(serviceName);
      if (service !== undefined) {
        if (serviceDefinition['Name'] === undefined) {
          service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);
        }
        for (const [characteristicName, definition] of Object.entries(serviceDefinition as object)) {
          const characteristic = service.getCharacteristic(this.platform.Characteristic[characteristicName]);
          if (characteristic !== undefined) {
            const tasmotaCharacteristic = new TasmotaCharacteristic(
              this.platform, this.accessory, service, characteristic, definition,
            );
            this.characteristics.push(tasmotaCharacteristic);
            configureText += `${first ? '' : ', '}${characteristic.displayName}`;
            first = false;
          } else {
            this.platform.log.warn('Invalid characteristic name: %s', characteristicName);
          }
        }
      } else {
        this.platform.log.warn('Failed to configure: %s as %s',
          this.accessory.context.device.name,
          JSON.stringify(deviceDefinition),
        );
      }
      this.platform.log.debug(configureText);
    }
  }

  private findPath(obj: object, targetKey: string, path: string = ''): string | undefined {
    if (typeof obj !== 'object') {
      return undefined;
    }
    for (const key in obj) {
      const newPath = path ? `${path}.${key}` : key;
      if (key === targetKey) {
        return newPath;
      }
      const result = this.findPath(obj[key], targetKey, newPath);
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  private async configureSensors() {
    const reqTopic = `cmnd/${this.accessory.context.device.topic}/STATUS`;
    const reqPayload = '10';
    const resTopic = `stat/${this.accessory.context.device.topic}/STATUS10`;
    try {
      const sensorsJSON = await this.platform.mqttClient.read(reqTopic, reqPayload, resTopic);
      const sensors = JSON.parse(sensorsJSON);
      if (sensors.StatusSNS !== undefined) {
        for (const sensorType of SENSOR_TYPES) {
          const path = this.findPath(sensors.StatusSNS, sensorType.key);
          const characteristic = {
            get: { cmd: 'STATUS 10', res: { topic: '{stat}/STATUS10', path: `StatusSNS.${path}` } },
            stat: { topic: '{sensor}', path: `${path}` },
          };
          const service = Object();
          service[sensorType.characteristic] = characteristic;
          const definition = Object();
          definition[sensorType.service] = service;
          this.configureDevice(definition);
        }
      } else {
        this.platform.log.warn('StatusSNS node missing on sensor reply: %s', sensorsJSON);
      }
    } catch (err) {
      this.platform.log.warn('Unable to read sensor data: %s', err);
    }
  }

  private async getProperty(cmd: string, path: string = cmd, res: string = 'RESULT'): Promise<string | undefined> {
    const split = cmd.split(' ');
    const reqTopic = `cmnd/${this.accessory.context.device.topic}/${split[0]}`;
    const resTopic = `stat/${this.accessory.context.device.topic}/${res || 'RESULT'}`;
    try {
      const response = await this.platform.mqttClient.read(reqTopic, split[1] || '', resTopic, 1000);
      return this.platform.mqttClient.getValueByPath(response, path);
    } catch (err) {
      if (this.accessory.context.ignoreTimeouts === false) {
        this.platform.log.error('%s: Got no response on %s command, reading %s topic (check MQTT topic): %s',
          this.accessory.context.device.name,
          reqTopic,
          resTopic,
          err as string,
        );
      }
      return '';
    }
  }

  private async configureAccessoryInformation() {
    const manufacturer = await this.getProperty('MODULE0', 'Module.0') || 'Tasmota';
    const model = await this.getProperty('DeviceName') || 'Unknown';
    const serialNumber = await this.getProperty('STATUS 5', 'StatusNET.Mac', 'STATUS5') || 'Unknown';
    let firmwareRevision = await this.getProperty('STATUS 2', 'StatusFWR.Version', 'STATUS2') || 'Unknown';
    firmwareRevision = firmwareRevision.split('(')[0];
    const accessoryInformation: TasmotaDeviceDefinition = {
      AccessoryInformation: {
        Manufacturer: { default: `${manufacturer}` },
        Model: { default: `${model}` },
        SerialNumber: { default: `${serialNumber}` },
        FirmwareRevision: { default: `${firmwareRevision}` },
      },
    };
    this.configureDevice(accessoryInformation);
  }
}
