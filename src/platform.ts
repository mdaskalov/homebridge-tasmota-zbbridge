import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaAccessory } from './tasmotaAccessory';
import { MQTTClient } from './mqttClient';

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
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    if (Array.isArray(this.config.zbBridgeDevices)) {
      for (const device of this.config.zbBridgeDevices) {
        const uuid = this.api.hap.uuid.generate(device.addr);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info('Restoring existing zbBridge accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          new ZbBridgeAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new zbBridge accessory:', device.name);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          new ZbBridgeAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
    if (Array.isArray(this.config.tasmotaDevices)) {
      for (const device of this.config.tasmotaDevices) {
        const uuid = this.api.hap.uuid.generate(device.topic + '-' + device.type);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info('Restoring existing tasmota accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          new TasmotaAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new tasmota accessory:', device.name);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          new TasmotaAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

}
