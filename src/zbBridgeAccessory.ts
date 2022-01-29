import {
  Service,
  PlatformAccessory,
  HAPStatus,
} from 'homebridge';

import { TasmotaZbBridgePlatform } from './platform';

export type ZbBridgeDevice = {
  addr: string,
  type: string,
  name: string,
  endpoint: number | undefined
}

type StatusUpdateHandler = {
  id: string;
  callback: (message) => void;
};

const IGNORE_UPDATES_TIME = 2000;

export abstract class ZbBridgeAccessory {
  protected service: Service;
  protected powerTopic?: string;
  protected addr: string;
  protected endpoint: number | undefined;
  protected type: string;
  protected reachable: boolean;
  protected ignoreUpdatesUntil = 0;
  private statusUpdateHandlers: StatusUpdateHandler[] = [];

  constructor(protected readonly platform: TasmotaZbBridgePlatform, protected readonly accessory: PlatformAccessory) {
    const addr = this.accessory.context.device.addr.split(':');
    this.addr = addr[0];
    this.endpoint = addr[1]; // optional endpoint 1–240
    this.type = this.accessory.context.device.type;
    this.reachable = true;

    const serviceName = this.getServiceName();
    const service = this.platform.Service[serviceName];
    if (service === undefined) {
      throw new Error('Unknown service: ' + serviceName);
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Subscribe for the power topic updates
    if (this.accessory.context.device.powerTopic !== undefined) {
      this.powerTopic = this.accessory.context.device.powerTopic + '/' + (this.accessory.context.device.powerType || 'POWER');
      this.platform.mqttClient.subscribe('stat/' + this.powerTopic, (message) => {
        this.statusUpdate({ Power: (message === 'ON') ? 1 : 0 });
      });
    }

    //subscribe for zbsend updates
    this.platform.mqttClient.subscribe('stat/' + this.platform.mqttClient.topic + '/RESULT', message => {
      const msg = JSON.parse(message);
      if (this.statusUpdateHandlers.length !== 0) {
        this.statusUpdateHandlers.forEach(h => h.callback(msg));
      }
    });

    // Subscribe for sensor updates
    this.platform.mqttClient.subscribe('tele/' + this.platform.mqttClient.topic + '/SENSOR', message => {
      const obj = JSON.parse(message);
      if (obj && obj.ZbReceived) {
        const responseDevice: string = Object.keys(obj.ZbReceived)[0];
        const response = obj.ZbReceived[responseDevice];
        if (Number(responseDevice) === Number(this.addr) && response !== undefined) {
          this.statusUpdate(response);
        }
      }
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
    this.mqttSend({ device: this.addr, cluster: 0, read: [0, 4, 5] });
    this.onQueryInitialState();
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
      const waitTime = this.ignoreUpdatesUntil - Date.now();
      if (waitTime > 0) {
        this.log('updateStatus ignored, waiting %sms...', waitTime);
        return;
      }
      if (this.endpoint === undefined || Number(this.endpoint) === Number(message.Endpoint)) {
        this.onStatusUpdate(message);
      }
    }
  }

  mqttSend(command): void {
    const topic = 'cmnd/' + this.platform.mqttClient.topic + '/zbsend';
    const message = JSON.stringify(command);
    this.platform.mqttClient.publish(topic, message);
  }

  mqttSubmit(command, timeOutValue = 2000) {
    return new Promise((resolve: (message) => void, reject) => {
      const id = this.platform.mqttClient.uniqueID();
      const startTS = Date.now();

      const removeHandler = () => {
        this.statusUpdateHandlers = this.statusUpdateHandlers.filter(h => h.id !== id);
      };

      const timer = setTimeout(() => {
        this.platform.log.error('%s (%s) mqttSubmit: timeout after %sms %s',
          this.accessory.context.device.name, this.addr,
          Date.now() - startTS, JSON.stringify(command));
        removeHandler();
        reject('mqttSubmit timeout');
      }, timeOutValue);

      const updateCallback: (message) => void = message => {
        if (message.ZbSend === 'Done') {
          removeHandler();
          clearTimeout(timer);
          resolve(message);
        }
      };

      this.statusUpdateHandlers.push({ id, callback: updateCallback });
      this.mqttSend(command);
    });
  }

  async zbSend(command, ignoreUpdates = true) {
    try {
      await this.mqttSubmit(command);
      if (ignoreUpdates) {
        this.ignoreUpdatesUntil = Date.now() + IGNORE_UPDATES_TIME;
      }
    } catch (err) {
      throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    }
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

  abstract onQueryInitialState(): void;

  abstract onStatusUpdate(response): void;
}
