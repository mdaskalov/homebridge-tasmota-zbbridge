import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, UnknownContext } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TasmotaDevice, TasmotaAccessory } from './tasmotaAccessory';
import { MQTTClient } from './mqttClient';
import { ZbBridgeDevice } from './zbBridgeAccessory';
import { ZbBridgeLightbulb } from './zbBridgeLightbulb';
import { ZbBridgeSwitch } from './zbBridgeSwitch';
import { ZbBridgeSensor } from './zbBridgeSensor';
import { ZbBridgeZ2M, Z2MDevice } from './zbBridgeZ2M';

export class TasmotaZbBridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly mqttClient = new MQTTClient(this.log, this.config);
  // cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // zigbee2mqtt devices
  public z2mDevices: Z2MDevice[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name || 'ZbBridge');

    if (config.z2mBaseTopic === undefined) {
      config.z2mBaseTopic = 'zigbee2mqtt';
    }

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.cleanupCachedDevices();
      const configuredZ2MDevice = config.zbBridgeDevices?.find(d => d.type = 'z2m');
      if (configuredZ2MDevice !== undefined) {
        const handlerID = this.mqttClient.subscribeTopic(config.z2mBaseTopic + '/bridge/devices', message => {
          const devices: Z2MDevice[] = JSON.parse(message);
          this.z2mDevices = devices;
          this.mqttClient.unsubscribe(handlerID);
          this.log.info('Found %s zigbee2mqtt devices', devices.length);
          this.discoverDevices(true);
        });
      }
      this.discoverDevices(false);
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  zbBridgeDeviceUUID(device: ZbBridgeDevice) {
    const identificator = device.addr + device.type +
      (device.powerTopic || '') +
      (device.powerType || '') +
      (device.sensorService || '') +
      (device.sensorCharacteristic || '') +
      (device.sensorValuePath || '');
    return this.api.hap.uuid.generate(identificator);
  }

  tasmotaDeviceUUID(device: TasmotaDevice) {
    return this.api.hap.uuid.generate(device.topic + '-' + device.type);
  }

  createZbBridgeAccessory(accessory: PlatformAccessory) {
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
      new ZbBridgeSensor(this, accessory, serviceName);
    } else if (type.startsWith('light')) {
      new ZbBridgeLightbulb(this, accessory, 'Lightbulb');
    } else if (type === 'switch') {
      new ZbBridgeSwitch(this, accessory, 'Switch');
    } else if (type === 'z2m') {
      const device = this.z2mDevices.find(d => d.ieee_address === accessory.context.device.addr);
      if (device !== undefined) {
        const serviceName = ZbBridgeZ2M.getServiceName(device);
        if (serviceName !== undefined) {
          new ZbBridgeZ2M(this, accessory, serviceName);
        }
      }
    }
  }

  restoreAccessory(uuid: string, name: string): { restored: boolean; accessory: PlatformAccessory<UnknownContext> } {
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

  discoverDevices(discoverZ2M: boolean) {
    if (Array.isArray(this.config.zbBridgeDevices)) {
      for (const device of this.config.zbBridgeDevices) {
        if ((<ZbBridgeDevice>device).addr && (<ZbBridgeDevice>device).type && (<ZbBridgeDevice>device).name) {
          if (discoverZ2M !== (device.type === 'z2m')) {
            continue;
          }
          const { restored, accessory } = this.restoreAccessory(this.zbBridgeDeviceUUID(device), device.name);
          accessory.context.device = device;
          this.createZbBridgeAccessory(accessory);
          this.log.info('%s zbBridge accessory: %s (%s) - %s',
            restored ? 'Restoring' : 'Adding', device.name, device.addr, device.type);
        } else {
          this.log.error('Ignored zbBridge device configuration: ', JSON.stringify(device));
          continue;
        }
      }
    }
    if (Array.isArray(this.config.tasmotaDevices) && !discoverZ2M) {
      for (const device of this.config.tasmotaDevices) {
        if ((<TasmotaDevice>device).topic && (<TasmotaDevice>device).type && (<TasmotaDevice>device).name) {
          const { restored, accessory } = this.restoreAccessory(this.tasmotaDeviceUUID(device), device.name);
          accessory.context.device = device;
          new TasmotaAccessory(this, accessory);
          this.log.info('%s tasmota accessory: %s (%s) - %s',
            restored ? 'Restoring' : 'Adding', device.name, device.topic, device.type);
        } else {
          this.log.error('Ignored Tasmota device configuration: ', JSON.stringify(device));
          continue;
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
          const device = accessory.context.device;
          if ((<ZbBridgeDevice>device).addr) {
            this.log.info('Removing zbBridge accessory: %s (%s) - %s', device.name, device.addr, device.type);
          } else if ((<TasmotaDevice>device).topic) {
            this.log.info('Removing tasmota accessory: %s (%s) - %s', device.name, device.topic, device.type);
          } else {
            this.log.info('Removing accessory: %s', accessory.displayName);
          }
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

}
