import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TasmotaDevice, TasmotaAccessory } from './tasmotaAccessory';
import { MQTTClient } from './mqttClient';
import { ZbBridgeDevice } from './zbBridgeAccessory';
import { ZbBridgeLightbulb } from './zbBridgeLightbulb';
import { ZbBridgeSwitch } from './zbBridgeSwitch';
import { ZbBridgeSensor } from './zbBridgeSensor';

export class TasmotaZbBridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly mqttClient = new MQTTClient(this.log, this.config);

  // cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.cleanupCachedDevices();
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  zbBridgeDeviceUUID(device: ZbBridgeDevice) {
    return this.api.hap.uuid.generate(device.addr + (device.endpoint ? '-' + device.endpoint : ''));
  }

  tasmotaDeviceUUID(device: TasmotaDevice) {
    return this.api.hap.uuid.generate(device.topic + '-' + device.type);
  }

  createZbBridgeAccessory(accessory: PlatformAccessory) {
    const type = accessory.context.device.type;
    if (type === undefined) {
      return;
    }
    if (type.startsWith('sensor')) {
      new ZbBridgeSensor(this, accessory);
    }
    if (type.startsWith('light')) {
      new ZbBridgeLightbulb(this, accessory);
    }
    if (type === 'switch') {
      new ZbBridgeSwitch(this, accessory);
    }
  }

  discoverDevices() {
    if (Array.isArray(this.config.zbBridgeDevices)) {
      for (const device of this.config.zbBridgeDevices) {
        const uuid = this.zbBridgeDeviceUUID(device);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          this.createZbBridgeAccessory(existingAccessory);
        } else {
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          this.createZbBridgeAccessory(accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        this.log.info('Adding %s zbBridge accessory: %s (%s) - %s',
          existingAccessory ? 'cached' : 'new', device.name, device.addr, device.type);
      }
    }
    if (Array.isArray(this.config.tasmotaDevices)) {
      for (const device of this.config.tasmotaDevices) {
        const uuid = this.tasmotaDeviceUUID(device);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info('Restoring existing tasmota accessory from cache: %s', device.name);
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          new TasmotaAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new tasmota accessory: %s', device.name);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          new TasmotaAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

  cleanupCachedDevices() {
    if (Array.isArray(this.accessories)) {
      for (const accessory of this.accessories) {
        let foundZbBridgeDevice = false;
        let foundTasmotaDevice = false;
        if (Array.isArray(this.config.zbBridgeDevices)) {
          const found = this.config.zbBridgeDevices.find(d => this.zbBridgeDeviceUUID(d) === accessory.UUID);
          foundZbBridgeDevice = (found !== undefined);
        }
        if (Array.isArray(this.config.tasmotaDevices)) {
          const found = this.config.tasmotaDevices.find(d => this.tasmotaDeviceUUID(d) === accessory.UUID);
          foundTasmotaDevice = (found !== undefined);
        }
        if (!foundZbBridgeDevice && !foundTasmotaDevice) {
          this.log.info('Removing unused accessory from cache: %s', accessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

}
