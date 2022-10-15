import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, UnknownContext } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TasmotaDevice, TasmotaAccessory } from './tasmotaAccessory';
import { MQTTClient } from './mqttClient';
import { ZbBridgeDevice } from './zbBridgeAccessory';
import { ZbBridgeLightbulb } from './zbBridgeLightbulb';
import { ZbBridgeSwitch } from './zbBridgeSwitch';
import { ZbBridgeSensor } from './zbBridgeSensor';
import { Zigbee2MQTTAcessory, Z2MDevice, Zigbee2MQTTDevice } from './zigbee2MQTTAcessory';

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

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.cleanupCachedDevices();
      if (Array.isArray(this.config.z2mDevices) && this.config.z2mDevices.length > 0) {
        if (config.z2mBaseTopic === undefined) {
          config.z2mBaseTopic = 'zigbee2mqtt';
        }
        const handlerID = this.mqttClient.subscribeTopic(config.z2mBaseTopic + '/bridge/devices', message => {
          const devices: Z2MDevice[] = JSON.parse(message);
          this.z2mDevices = devices;
          this.mqttClient.unsubscribe(handlerID);
          this.log.info('Found %s zigbee2mqtt devices', devices.length);
          this.discoverZigbee2MQTTDevices();
        });
      }
      if (Array.isArray(this.config.zbBridgeDevices) && this.config.zbBridgeDevices.length > 0) {
        this.discoverZbBridgeDevices();
      }
      if (Array.isArray(this.config.tasmotaDevices) && this.config.tasmotaDevices.length > 0) {
        this.discoverTasmotaDevices();
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  zbBridgeDeviceUUID(device: ZbBridgeDevice): string {
    const identificator = device.addr + device.type +
      (device.powerTopic || '') +
      (device.powerType || '') +
      (device.sensorService || '') +
      (device.sensorCharacteristic || '') +
      (device.sensorValuePath || '');
    return this.api.hap.uuid.generate(identificator);
  }

  zigbee2MQTTDeviceUUID(device: Zigbee2MQTTDevice): string {
    const identificator = device.addr +
      (device.powerTopic || '') +
      (device.powerType || '');
    return this.api.hap.uuid.generate(identificator);
  }

  tasmotaDeviceUUID(device: TasmotaDevice): string {
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
    }
  }

  createZigbee2MQTTAcessory(accessory: PlatformAccessory) {
    const device = this.z2mDevices.find(d => d.ieee_address === accessory.context.device.addr);
    if (device !== undefined) {
      const serviceName = Zigbee2MQTTAcessory.getServiceName(device);
      if (serviceName !== undefined) {
        new Zigbee2MQTTAcessory(this, accessory, serviceName);
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

  discoverZbBridgeDevices() {
    this.log.info('discover zbBridgeDevices');
    for (const device of this.config.zbBridgeDevices) {
      if ((<ZbBridgeDevice>device).addr && (<ZbBridgeDevice>device).type && (<ZbBridgeDevice>device).name) {
        const { restored, accessory } = this.restoreAccessory(this.zbBridgeDeviceUUID(device), device.name);
        accessory.context.device = device;
        this.createZbBridgeAccessory(accessory);
        this.log.info('%s ZbBridge accessory: %s (%s) - %s',
          restored ? 'Restoring' : 'Adding', device.name, device.addr, device.type);
      } else {
        this.log.error('Ignored ZbBridge device configuration: ', JSON.stringify(device));
        continue;
      }
    }
  }

  discoverZigbee2MQTTDevices() {
    for (const device of this.config.z2mDevices) {
      if ((<Zigbee2MQTTDevice>device).addr && (<Zigbee2MQTTDevice>device).name) {
        const { restored, accessory } = this.restoreAccessory(this.zigbee2MQTTDeviceUUID(device), device.name);
        accessory.context.device = device;
        this.createZigbee2MQTTAcessory(accessory);
        this.log.info('%s Zigbee2MQTTAcessory accessory: %s (%s)',
          restored ? 'Restoring' : 'Adding', device.name, device.addr);
      } else {
        this.log.error('Ignored Zigbee2MQTT device configuration: ', JSON.stringify(device));
        continue;
      }
    }
  }

  discoverTasmotaDevices() {
    for (const device of this.config.tasmotaDevices) {
      if ((<TasmotaDevice>device).topic && (<TasmotaDevice>device).type && (<TasmotaDevice>device).name) {
        const { restored, accessory } = this.restoreAccessory(this.tasmotaDeviceUUID(device), device.name);
        accessory.context.device = device;
        new TasmotaAccessory(this, accessory);
        this.log.info('%s Tasmota accessory: %s (%s) - %s',
          restored ? 'Restoring' : 'Adding', device.name, device.topic, device.type);
      } else {
        this.log.error('Ignored Tasmota device configuration: ', JSON.stringify(device));
        continue;
      }
    }
  }

  cleanupCachedDevices() {
    if (Array.isArray(this.accessories)) {
      for (const accessory of this.accessories) {
        let foundZbBridgeDevice = false;
        let foundTasmotaDevice = false;
        let foundZigbee2MQTTDevice = false;
        if (Array.isArray(this.config.zbBridgeDevices)) {
          const found = this.config.zbBridgeDevices.find(d => this.zbBridgeDeviceUUID(d) === accessory.UUID);
          foundZbBridgeDevice = (found !== undefined);
        }
        if (Array.isArray(this.config.z2mDevices)) {
          const found = this.config.z2mDevices.find(d => this.zigbee2MQTTDeviceUUID(d) === accessory.UUID);
          foundZigbee2MQTTDevice = (found !== undefined);
        }
        if (Array.isArray(this.config.tasmotaDevices)) {
          const found = this.config.tasmotaDevices.find(d => this.tasmotaDeviceUUID(d) === accessory.UUID);
          foundTasmotaDevice = (found !== undefined);
        }
        if (!foundZbBridgeDevice && !foundZigbee2MQTTDevice && !foundTasmotaDevice) {
          const device = accessory.context.device;
          if ((<ZbBridgeDevice>device).addr && (<ZbBridgeDevice>device).type) {
            this.log.info('Removing ZbBridge accessory: %s (%s) - %s', device.name, device.addr, device.type);
          } else if ((<Zigbee2MQTTDevice>device).addr) {
            this.log.info('Removing Zigbee2MQTT accessory: %s (%s)', device.name, device.addr);
          } else if ((<TasmotaDevice>device).topic) {
            this.log.info('Removing Tasmota accessory: %s (%s) - %s', device.name, device.topic, device.type);
          } else {
            this.log.info('Removing accessory: %s', accessory.displayName);
          }
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }

}
