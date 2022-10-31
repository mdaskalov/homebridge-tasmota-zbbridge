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
  public zigbee2mqttDevices: Z2MDevice[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name || 'ZbBridge');

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.cleanupCachedDevices();
      if (Array.isArray(this.config.zigbee2mqttDevices) && this.config.zigbee2mqttDevices.length > 0) {
        this.discoverZigbee2MQTTDevices();
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
    const identificator = device.ieee_address +
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
    for (const device of this.config.zbBridgeDevices) {
      if ((<ZbBridgeDevice>device)?.addr && (<ZbBridgeDevice>device)?.type && (<ZbBridgeDevice>device)?.name) {
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

  async discoverZigbee2MQTTDevices() {
    if (this.config.zigbee2mqttTopic === undefined) {
      this.config.zigbee2mqttTopic = 'zigbee2mqtt';
    }
    try {
      const devicesTopic = this.config.zigbee2mqttTopic + '/bridge/devices';
      const message = await this.mqttClient.read(devicesTopic, undefined, false);
      const devices: Z2MDevice[] = JSON.parse(message);
      if (!Array.isArray(devices)) {
        throw (`topic (${devicesTopic}) parse error`);
      }

      this.zigbee2mqttDevices = devices;
      this.log.info('Found %s Zigbee2MQTT devices', devices.length);

      for (const device of this.config.zigbee2mqttDevices) {
        if ((<Zigbee2MQTTDevice>device)?.ieee_address && (<Zigbee2MQTTDevice>device)?.name) {
          const z2mDevice = this.zigbee2mqttDevices.find(d => d.ieee_address === device.ieee_address);
          if (z2mDevice !== undefined) {
            const serviceName = Zigbee2MQTTAcessory.getServiceName(z2mDevice);
            if (serviceName !== undefined) {
              const { restored, accessory } = this.restoreAccessory(this.zigbee2MQTTDeviceUUID(device), device.name);
              accessory.context.device = device;
              new Zigbee2MQTTAcessory(this, accessory, serviceName);
              this.log.info('%s Zigbee2MQTTAcessory accessory: %s (%s) - %s',
                restored ? 'Restoring' : 'Adding', device.name, device.ieee_address, serviceName);
            } else {
              this.log.error('Ignored unsupported Zigbee2MQTT device %s (%s)', device.name, device.ieee_address);
            }
          }
        } else {
          this.log.error('Ignored Zigbee2MQTT device configuration: ', JSON.stringify(device));
          continue;
        }
      }
    } catch (err) {
      this.log.error(`Zigbee2MQTT devices read failed: ${err}`);
    }
  }

  discoverTasmotaDevices() {
    for (const device of this.config.tasmotaDevices) {
      if ((<TasmotaDevice>device)?.topic && (<TasmotaDevice>device)?.type && (<TasmotaDevice>device)?.name) {
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
        if (Array.isArray(this.config.zigbee2mqttDevices)) {
          const found = this.config.zigbee2mqttDevices.find(d => this.zigbee2MQTTDeviceUUID(d) === accessory.UUID);
          foundZigbee2MQTTDevice = (found !== undefined);
        }
        if (Array.isArray(this.config.tasmotaDevices)) {
          const found = this.config.tasmotaDevices.find(d => this.tasmotaDeviceUUID(d) === accessory.UUID);
          foundTasmotaDevice = (found !== undefined);
        }
        if (!foundZbBridgeDevice && !foundZigbee2MQTTDevice && !foundTasmotaDevice) {
          const device = accessory.context.device;
          if ((<ZbBridgeDevice>device)?.addr && (<ZbBridgeDevice>device)?.type) {
            this.log.info('Removing ZbBridge accessory: %s (%s) - %s', device.name, device.addr, device.type);
          } else if ((<Zigbee2MQTTDevice>device)?.ieee_address) {
            this.log.info('Removing Zigbee2MQTT accessory: %s (%s)', device.name, device.ieee_address);
          } else if ((<TasmotaDevice>device)?.topic) {
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
