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

type StatusUpdateHandler = {
  id: string;
  callback: (message) => void;
};

const UPDATE_DELAY = 2000;

export abstract class ZbBridgeAccessory {
  protected service: Service;
  protected powerTopic?: string;
  protected addr: string;
  protected type: string;
  protected updated?: number;
  private statusUpdateHandlers: StatusUpdateHandler[] = [];

  constructor(protected readonly platform: TasmotaZbBridgePlatform, protected readonly accessory: PlatformAccessory) {
    this.service = this.getService();
    this.addr = this.accessory.context.device.addr;
    this.type = this.accessory.context.device.type;

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.platform.mqttClient.publish(
      'cmnd/' + this.platform.mqttClient.topic + '/zbname',
      this.addr + ',' + accessory.context.device.name,
    );

    // Use separated topic for power
    if (this.accessory.context.device.powerTopic !== undefined) {
      this.powerTopic = this.accessory.context.device.powerTopic + '/' + (this.accessory.context.device.powerType || 'POWER');
      this.platform.mqttClient.subscribe('stat/' + this.powerTopic, (message) => {
        this.statusUpdate({ Power: (message === 'ON') ? 1 : 0 });
      });
    }

    // Update
    this.platform.mqttClient.subscribe('tele/' + this.platform.mqttClient.topic + '/SENSOR', (message, topic) => {
      const obj = JSON.parse(message);
      if (obj && obj.ZbReceived) {
        const responseDevice: string = Object.keys(obj.ZbReceived)[0];
        const response = obj.ZbReceived[responseDevice];
        if ((responseDevice.toUpperCase() === this.addr.toUpperCase()) && response) {
          this.platform.log.debug('%s (%s) MQTT: Received %s :- %s',
            this.accessory.context.device.name, this.addr,
            topic, message);
          this.statusUpdate(response);
        }
      }
    });

    this.registerHandlers();

    // Query Manufacturer, Model
    this.mqttSend({ device: this.addr, cluster: 0, read: [0, 4, 5] });
    this.onQueryInnitialState();
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
    } else if (this.statusUpdateHandlers.length !== 0) {
      this.statusUpdateHandlers.forEach(h => h.callback(message));
    } else {
      if ((this.updated !== undefined) && (Date.now() - this.updated < UPDATE_DELAY)) {
        this.log('updateStatus ignored, updated %sms ago...', Date.now() - this.updated);
        return;
      }
      this.onStatusUpdate(message);
    }
  }

  mqttSend(command): void {
    const topic = 'cmnd/' + this.platform.mqttClient.topic + '/zbsend';
    const message = JSON.stringify(command);
    this.platform.mqttClient.publish(topic, message);
  }

  mqttSubmit(command) {
    return new Promise((resolve: (message) => void, reject) => {
      const timeOutValue = 2000; // wait timeout (ms)
      const id = this.platform.mqttClient.uniqueID();

      const removeHandler = () => {
        this.statusUpdateHandlers = this.statusUpdateHandlers.filter(h => h.id !== id);
      };

      const timer = setTimeout(() => {
        removeHandler();
        reject(`mqttSubmit timeout (${timeOutValue}ms): id: ${id}, command: ${JSON.stringify(command)}`);
      }, timeOutValue);

      const updateCallback: (message) => void = message => {
        removeHandler();
        clearTimeout(timer);
        resolve(message);
      };

      this.statusUpdateHandlers.push({ id, callback: updateCallback });
      this.updated = Date.now();
      this.mqttSend(command);
    });
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

  abstract getService(): Service;

  abstract registerHandlers(): void;

  abstract onQueryInnitialState(): void;

  abstract onStatusUpdate(response): void;
}
