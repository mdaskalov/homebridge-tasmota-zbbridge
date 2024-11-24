import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, UnknownContext } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TasmotaDevice, TasmotaAccessory } from './tasmotaAccessory';
import { MQTTClient } from './mqttClient';
import { Zigbee2TasmotaDevice } from './zigbee2TasmotaAccessory';
import { Zigbee2TasmotaLightbulb } from './zigbee2TasmotaLightbulb';
import { Zigbee2TasmotaSwitch } from './zigbee2TasmotaSwitch';
import { Zigbee2TasmotaSensor } from './zigbee2TasmotaSensor';
import { Zigbee2MQTTAcessory, Zigbee2MQTTDevice } from './zigbee2MQTTAcessory';
import { TasmotaPowerManager } from './tasmotaPowerManager';

export class TasmotaZbBridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly mqttClient = new MQTTClient(this.log, this.config);
  public readonly powerManager = new TasmotaPowerManager(this.log, this.mqttClient);
  // cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  private configuredUUIDs: string[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name || 'ZbBridge');

    this.api.on('didFinishLaunching', async () => {
      if (Array.isArray(this.config.zigbee2mqttDevices) && this.config.zigbee2mqttDevices.length > 0) {
        await this.discoverZigbee2MQTTDevices();
      }
      if (Array.isArray(this.config.zigbee2TasmotaDevices) && this.config.zigbee2TasmotaDevices.length > 0) {
        this.discoverZigbee2TasmotaDevices();
      }
      if (Array.isArray(this.config.tasmotaDevices) && this.config.tasmotaDevices.length > 0) {
        this.discoverTasmotaDevices();
      }
      this.cleanupCachedDevices();
    });

    this.api.on('shutdown', () => {
      this.mqttClient.shutdown();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  zigbee2TasmotaDeviceUUID(device: Zigbee2TasmotaDevice): string {
    const identificator = device.addr + device.type +
      (device.powerTopic || '') +
      (device.powerType || '') +
      (device.sensorService || '') +
      (device.sensorCharacteristic || '') +
      (device.sensorValuePath || '');
    return this.api.hap.uuid.generate(identificator);
  }

  zigbee2MQTTDeviceUUID(ieee_address: string, topic?: string): string {
    const identificator = 'z2m' + ieee_address +
      (topic || '');
    return this.api.hap.uuid.generate(identificator);
  }

  tasmotaDeviceUUID(device: TasmotaDevice): string {
    const identificator = `${device.topic}-${device.type}` +
      (device.index !== undefined ? `-${device.index}` : '') +
      (device.custom !== undefined ? device.custom : '');
    return this.api.hap.uuid.generate(identificator);
  }

  createZigbee2TasmotaAccessory(accessory: PlatformAccessory) {
    const type = accessory.context.device.type;
    if (type === undefined) {
      return;
    } else if (type.startsWith('sensor')) {
      let serviceName = (accessory.context.device.sensorService || 'undefined');
      const service = this.Service[serviceName];
      if (service === undefined) {
        this.log.warn('Warning: Unknown service: %s, using ContactSensor instead!', serviceName);
        serviceName = 'ContactSensor';
      }
      new Zigbee2TasmotaSensor(this, accessory, serviceName);
    } else if (type.startsWith('light')) {
      new Zigbee2TasmotaLightbulb(this, accessory, 'Lightbulb');
    } else if (type === 'switch') {
      new Zigbee2TasmotaSwitch(this, accessory, 'Switch');
    }
  }

  restoreAccessory(uuid: string, name: string): { restored: boolean; accessory: PlatformAccessory<UnknownContext> } {
    this.configuredUUIDs.push(uuid);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      this.api.updatePlatformAccessories([existingAccessory]);
      return { restored: true, accessory: existingAccessory };
    } else {
      const accessory = new this.api.platformAccessory(name, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      return { restored: false, accessory };
    }
  }

  discoverZigbee2TasmotaDevices() {
    for (const device of this.config.zigbee2TasmotaDevices) {
      if ((<Zigbee2TasmotaDevice>device)?.addr && (<Zigbee2TasmotaDevice>device)?.type && (<Zigbee2TasmotaDevice>device)?.name) {
        const { restored, accessory } = this.restoreAccessory(this.zigbee2TasmotaDeviceUUID(device), device.name);
        accessory.context.device = device;
        this.createZigbee2TasmotaAccessory(accessory);
        this.log.info('%s Zigbee2Tasmota accessory: %s (%s) - %s',
          restored ? 'Restoring' : 'Adding', device.name, device.addr, device.type);
      } else {
        this.log.error('Ignored Zigbee2Tasmota device configuration: ', JSON.stringify(device));
        continue;
      }
    }
  }

  async discoverZigbee2MQTTDevices() {
    if (this.config.zigbee2mqttTopic === undefined) {
      this.config.zigbee2mqttTopic = 'zigbee2mqtt';
    }
    try {
      const bridgeDevicesTopic = this.config.zigbee2mqttTopic + '/bridge/devices';
      const message = await this.mqttClient.read(bridgeDevicesTopic);
      const z2m_devices: Zigbee2MQTTDevice[] = JSON.parse(message);
      if (!Array.isArray(z2m_devices)) {
        throw (`topic (${bridgeDevicesTopic}) parse error`);
      }
      this.log.info('Found %s Zigbee2MQTT devices', z2m_devices.length);

      for (const configured of this.config.zigbee2mqttDevices) {
        if (configured.ieee_address) {
          const device = z2m_devices.find(d => d.ieee_address === configured.ieee_address);
          if (device !== undefined) {
            const usePowerManager = configured.powerTopic !== undefined;
            const powerTopic = configured.powerTopic + '/' + (configured.powerType || 'POWER');
            device.homekit_name = configured.name || device.friendly_name || configured.ieee_address;
            if (usePowerManager) {
              this.powerManager.addAccessory(device.ieee_address, powerTopic, device.homekit_name);
            }
            const uuid = this.zigbee2MQTTDeviceUUID(device.ieee_address, powerTopic);
            const { restored, accessory } = this.restoreAccessory(uuid, device.homekit_name);
            accessory.context.device = device;
            new Zigbee2MQTTAcessory(this, accessory, usePowerManager);
            this.log.info('%s Zigbee2MQTT accessory: %s (%s)',
              restored ? 'Restoring' : 'Adding', device.homekit_name, configured.ieee_address);
          } else {
            this.log.warn('Zigbee2MQTT device %s (%s) not found!', configured.name || 'Unknown', configured.ieee_address);
          }
        } else {
          this.log.warn('Ignored invalid Zigbee2MQTT configuration: %s', JSON.stringify(configured));
        }
      }
    } catch (err) {
      this.log.error(`Zigbee2MQTT devices initialization failed: ${err}`);
    }
  }

  discoverTasmotaDevices() {
    for (const device of this.config.tasmotaDevices) {
      if ((<TasmotaDevice>device)?.topic && (<TasmotaDevice>device)?.type && (<TasmotaDevice>device)?.name) {
        const { restored, accessory } = this.restoreAccessory(this.tasmotaDeviceUUID(device), device.name);
        accessory.context.device = device;
        accessory.context.ignoreTimeouts = this.config.ignoreTimeouts;
        accessory.context.ignoreUnexpected = this.config.ignoreUnexpected;
        new TasmotaAccessory(this, accessory);
        this.log.info('%s Tasmota accessory: %s (%s) - %s',
          restored ? 'Restoring' : 'Adding', device.name, device.topic,
          device.type + (device.index === undefined ? '' : `(${device.index})`),
        );
      } else {
        this.log.error('Ignored Tasmota device configuration: ', JSON.stringify(device));
        continue;
      }
    }
  }

  cleanupCachedDevices() {
    if (Array.isArray(this.accessories) && Array.isArray(this.configuredUUIDs)) {
      this.log.info('Cleanup - configured %d, cached %d accessories.', this.configuredUUIDs.length, this.accessories.length);
      for (const accessory of this.accessories) {
        const found = this.configuredUUIDs.find(uuid => uuid === accessory.UUID);
        if (!found) {
          const device = accessory.context.device;
          if ((<Zigbee2TasmotaDevice>device)?.addr && (<Zigbee2TasmotaDevice>device)?.type) {
            this.log.info('Removing ZbBridge accessory: %s (%s) - %s', device.name, device.addr, device.type);
          } else if ((<Zigbee2MQTTDevice>device)?.ieee_address) {
            this.log.info('Removing Zigbee2MQTT accessory: %s (%s)', device.homekit_name, device.ieee_address);
          } else if ((<TasmotaDevice>device)?.topic) {
            this.log.info('Removing Tasmota accessory: %s (%s) - %s', device.name, device.topic,
              device.type + (device.index === undefined ? '' : `(${device.index})`),
            );
          } else {
            this.log.info('Removing accessory: %s', accessory.displayName);
          }
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

}
