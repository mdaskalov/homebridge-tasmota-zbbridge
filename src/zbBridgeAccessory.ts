import {
  Service,
  PlatformAccessory,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

export type ZbBridgeDevice = {
  addr: string,
  type: string,
  name: string
}

export abstract class ZbBridgeAccessory {
  protected service: Service;
  protected powerTopic?: string;
  protected addr: string;
  protected endpoint: number | undefined;
  protected type: string;

  constructor(protected readonly platform: TasmotaZbBridgePlatform, protected readonly accessory: PlatformAccessory) {
    const addr = this.accessory.context.device.addr.split(':');
    this.addr = addr[0];
    this.endpoint = addr[1]; // optional endpoint 1–240
    this.type = this.accessory.context.device.type;

    const serviceName = this.getServiceName();
    const service = this.platform.Service[serviceName];
    if (service === undefined) {
      throw new Error('Unknown service: ' + serviceName);
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Subscribe for device updates
    this.platform.mqttClient.subscribeDevice(Number(this.addr), this.endpoint, msg => {
      this.statusUpdate(msg);
    });

    // udpate name only if no endpoint is defined
    if (this.endpoint === undefined) {
      this.platform.mqttClient.publish(
        'cmnd/' + this.platform.mqttClient.topic + '/zbname',
        this.addr + ',' + accessory.context.device.name,
      );
    }

    this.registerHandlers();

    // Query Manufacturer, Model
    this.zbSend({ device: this.addr, cluster: 0, read: [0, 4, 5] });
  }

  static formatTs(dt?: number): string {
    if (dt === undefined) {
      return 'undefined';
    }
    const d = new Date(dt);
    const dformat =[d.getHours().toString().padStart(2, '0'),
      d.getMinutes().toString().padStart(2, '0'),
      d.getSeconds().toString().padStart(2, '0')].join(':')+'.'+d.getMilliseconds().toString();
    return dformat;
  }

  getObjectByPath(obj, path: string) {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  statusUpdate(message) {
    if (message.Manufacturer && message.ModelId) {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, message.Manufacturer)
        .setCharacteristic(this.platform.Characteristic.Model, message.ModelId)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.addr);
      this.log('Manufacturer: %s, Model: %s',
        message.Manufacturer,
        message.ModelId,
      );
    } else {
      const statusText = this.onStatusUpdate(message);
      if (statusText !== '') {
        this.log('onStatusUpdate:%s', statusText);
      }
    }
  }

  zbSend(command): void {
    const topic = 'cmnd/' + this.platform.mqttClient.topic + '/zbsend';
    const message = JSON.stringify(command);
    this.platform.mqttClient.publish(topic, message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, ...parameters: any[]): void {
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

  abstract getServiceName(): string;

  abstract registerHandlers(): void;

  abstract onStatusUpdate(response): string;
}
