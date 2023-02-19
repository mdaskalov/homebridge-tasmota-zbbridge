import {
  PlatformAccessory,
  Service,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

export type Zigbee2TasmotaDevice = {
  addr: string;
  type: string;
  name: string;
  powerTopic?: string;
  powerType?: string;
  sensorService?: string;
  sensorCharacteristic?: string;
  sensorValuePath?: string;
};

export abstract class Zigbee2TasmotaAccessory {
  private topic: string;
  private shortAddr?: number;
  protected service: Service;
  protected powerTopic?: string;
  protected addr: string;
  protected endpoint?: number;
  protected type: string;
  protected updatedAccessoryInfo = false;

  constructor(
    protected readonly platform: TasmotaZbBridgePlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly serviceName: string,
  ) {
    if (this.accessory.context.device.powerTopic !== undefined) {
      this.powerTopic = this.accessory.context.device.powerTopic + '/' + (this.accessory.context.device.powerType || 'POWER');
    }
    const addr = this.accessory.context.device.addr.split(':');
    this.addr = addr[0];
    this.shortAddr = Number(this.addr);
    this.endpoint = addr[1]; // optional endpoint 1–240
    this.type = this.accessory.context.device.type;
    this.topic = this.platform.config.zigbee2tasmotaTopic || 'zbbridge';

    const service = this.platform.Service[serviceName];
    if (service === undefined) {
      throw new Error('Unknown service: ' + serviceName);
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Subscribe for device updates
    this.platform.mqttClient.subscribeTopic('tele/' + this.topic + '/SENSOR', msg => this.onSensorMessage(msg));

    // support unique device topic (ZbDeviceTopic / SetOption89)
    this.platform.mqttClient.subscribeTopic('tele/' + this.topic + '/+/SENSOR', msg => this.onSensorMessage(msg));

    // call zbname (udpate name)
    if (this.endpoint === undefined) {
      this.platform.mqttClient.publish(
        'cmnd/' + this.topic + '/zbname',
        this.addr + ',' + accessory.context.device.name,
      );
    }

    this.registerHandlers();

    // // Query device info
    this.zbInfo();
  }

  static formatTs(dt?: number): string {
    if (dt === undefined) {
      return 'undefined';
    }
    const d = new Date(dt);
    const dformat = [
      d.getHours().toString().padStart(2, '0'),
      d.getMinutes().toString().padStart(2, '0'),
      d.getSeconds().toString().padStart(2, '0'),
    ].join(':') + '.' + d.getMilliseconds().toString();
    return dformat;
  }

  findDeviceChildObj(obj) {
    if (obj) {
      if (obj.Device) {
        return obj;
      }
      for (const prop in obj) {
        const childObj = obj[prop];
        if (typeof childObj === 'object' && !Array.isArray(childObj) && childObj !== null) {
          const foundDeviceChildObj = this.findDeviceChildObj(childObj);
          if (foundDeviceChildObj !== undefined) {
            return foundDeviceChildObj;
          }
        }
      }
    }
  }

  matchDeviceObjAddr(obj) {
    const addr = Number(obj.IEEEAddr);
    const shortAddr = Number(obj.Device);

    if (Number(this.addr) === addr) {
      if (shortAddr) {
        this.shortAddr = shortAddr;
      }
      return true;
    }
    return (this.shortAddr === shortAddr);
  }

  onSensorMessage(message: string) {
    try {
      const parsedMsg = JSON.parse(message);
      const devObj = this.findDeviceChildObj(parsedMsg); // Object containing 'Device' property
      if (devObj !== undefined) {
        const addrMatch = this.matchDeviceObjAddr(devObj); // Match Device (shortAddr) or IEEEAddr
        const endpointMatch =
          (this.endpoint === undefined) ||
          (devObj.Endpoint === undefined) ||
          (Number(this.endpoint) === Number(devObj.Endpoint));
        if (addrMatch && endpointMatch) {
          this.statusUpdate(devObj);
        }
      }
    } catch (err) {
      this.platform.log.error('SENSOR message parse error: %s', message);
    }
  }

  getObjectByPath(obj, path: string) {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  statusUpdate(message) {
    if (!this.updatedAccessoryInfo && message.Manufacturer && message.ModelId) {
      this.updatedAccessoryInfo = true;
      const service = this.accessory.getService(this.platform.Service.AccessoryInformation);
      if (service !== undefined) {
        service
          .setCharacteristic(this.platform.Characteristic.Manufacturer, message.Manufacturer)
          .setCharacteristic(this.platform.Characteristic.Model, message.ModelId)
          .setCharacteristic(this.platform.Characteristic.SerialNumber, this.addr);
        this.log('Manufacturer: %s, Model: %s',
          message.Manufacturer,
          message.ModelId,
        );
      }
    }
    const statusText = this.onStatusUpdate(message);
    if (statusText !== '') {
      this.log('onStatusUpdate:%s', statusText);
    }
  }

  zbInfo(): void {
    const topic = 'cmnd/' + this.topic + '/zbinfo';
    this.platform.mqttClient.publish(topic, this.addr);
  }

  zbSend(command): void {
    const topic = 'cmnd/' + this.topic + '/zbsend';
    const message = JSON.stringify(command);
    this.platform.mqttClient.publish(topic, message);
  }

  log(message: string, ...parameters: unknown[]): void {
    this.platform.log.debug('%s (%s) ' + message,
      this.accessory.context.device.name, this.addr,
      ...parameters,
    );
  }

  mapValue(value: number, in_max: number, out_max: number): number {
    return Math.round(out_max * value / in_max);
  }

  // mapValue(value: number, in_min: number, in_max: number, out_min: number, out_max: number): number | undefined {
  //   const dividend = out_max - out_min;
  //   const divisor = in_max - in_min;
  //   const delta = value - in_min;
  //   if (divisor !== 0) {
  //     return Math.round((delta * dividend + (divisor / 2)) / divisor + out_min);
  //   }
  //   return undefined;
  // }

  abstract registerHandlers(): void;

  abstract onStatusUpdate(response): string;
}
