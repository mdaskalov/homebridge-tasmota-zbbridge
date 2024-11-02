import { PlatformAccessory } from 'homebridge';
import { TasmotaZbBridgePlatform } from './platform';
import { TasmotaCharacteristic, TasmotaCharacteristicDefinition } from './tasmotaCharacteristic';
import { DEVICE_TYPES, ACCESSORY_INFORMATION } from './tasmotaDeviceTypes';

export type TasmotaDevice = {
  topic: string;
  type: string | TasmotaDeviceDefinition;
  index?: string;
  name: string;
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
    if(DEVICE_TYPES[deviceType] !== undefined) {
      this.configureDevice(DEVICE_TYPES[deviceType]);
    } else {
      this.platform.log.error('%s: Uknown device definition: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.type,
      );
    }
  }

  private async configureDevice(deviceDefinition: TasmotaDeviceDefinition) {
    for (const [serviceName, serviceDefinition] of Object.entries(deviceDefinition as object)) {
      let configureText = `${this.accessory.context.device.name}: Configured as ${serviceName} with `;
      const serviceByName = this.platform.Service[serviceName];
      if (serviceByName !== undefined) {
        const service = this.accessory.getService(serviceByName) || this.accessory.addService(serviceByName);
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
            configureText += `${characteristicName} `;
          } else {
            this.platform.log.warn('Invalid characteristic name: %s in %s', characteristicName, JSON.stringify(deviceDefinition));
          }
        }
      } else {
        this.platform.log.warn('Invalid service name: %s in %s', serviceName, JSON.stringify(deviceDefinition));
      }
      this.platform.log.debug(configureText);
    }
  }

}
