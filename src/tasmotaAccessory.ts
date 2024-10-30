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
    const refType = typeof(this.accessory.context.device.type) === 'string';
    const deviceDefinition = refType ? DEVICE_TYPES[this.accessory.context.device.type] : this.accessory.context.device.type;
    if (deviceDefinition !== undefined) {
      this.configureDevice(ACCESSORY_INFORMATION);
      this.configureDevice(deviceDefinition);
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
        service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);
        for (const [name, definition] of Object.entries(serviceDefinition as object)) {
          const characteristic = new TasmotaCharacteristic(this.platform, this.accessory, service, name, definition);
          this.characteristics.push(characteristic);
          configureText += `${name} `;
        }
      } else {
        this.platform.log.warn('invalid service name: %s', serviceName);
      }
      this.platform.log.debug(configureText);
    }
  }

}
