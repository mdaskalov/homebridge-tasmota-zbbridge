import { PlatformAccessory, Service } from 'homebridge';
import { TasmotaZbBridgePlatform } from './platform';
import { TasmotaCharacteristic, TasmotaCharacteristicDefinition } from './tasmotaCharacteristic';
import { DEVICE_TYPES, SENSOR_TYPES, ACCESSORY_INFORMATION } from './tasmotaDeviceTypes';

export type TasmotaDevice = {
  topic: string;
  type: string | TasmotaDeviceDefinition;
  index?: string;
  name: string;
};

export type TasmotaSensorDefinition = {
  key: string;
  service: string;
  characteristic: string;
};

export type TasmotaDeviceDefinition = {
  [service: string] : { [characteristic: string]: TasmotaCharacteristicDefinition }
};

export class TasmotaAccessory {
  private characteristics: TasmotaCharacteristic[] = [];

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.configureDevice(ACCESSORY_INFORMATION);
    const deviceType = this.accessory.context.device.type;
    if (typeof deviceType === 'object') {
      this.configureDevice(deviceType);
    } else if (deviceType === 'SENSOR') {
      this.configureSensors();
    } else {
      if (DEVICE_TYPES[deviceType] !== undefined) {
        this.configureDevice(DEVICE_TYPES[deviceType]);
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
      let configureText = `${this.accessory.context.device.name}: Configured as ${serviceName} with `;
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
    const sensorsJSON = await this.platform.mqttClient.submit(reqTopic, reqPayload, resTopic);
    try {
      const sensors = JSON.parse(sensorsJSON);
      if (sensors.StatusSNS !== undefined) {
        for (const sensorType of SENSOR_TYPES) {
          const path = this.findPath(sensors.StatusSNS, sensorType.key);
          const characteristic = {
            get: {cmd: 'STATUS 10', res: {topic: '{stat}/STATUS10', path: `StatusSNS.${path}`}},
            stat: {topic: '{sensor}', path: `${path}`},
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
      this.platform.log.warn('Unable to parse sensors JSON: %s :- %s', sensorsJSON, err);
    }
  }
}
