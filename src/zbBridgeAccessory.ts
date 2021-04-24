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

const UPDATE_DELAY = 2000;

export abstract class ZbBridgeAccessory {
  protected service: Service;
  protected powerTopic?: string;
  protected addr: string;
  protected type: string;
  protected updated?: number;

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
    this.platform.mqttClient.send({ device: this.addr, cluster: 0, read: [0, 4, 5] });
    this.onQueryInnitialState();
  }

  log(message: string, ...parameters: any[]): void {
    this.platform.log.debug('%s (%s) ' + message,
      this.accessory.context.device.name, this.addr,
      ...parameters,
    );
  }

  abstract getService(): Service;

  abstract registerHandlers(): void;

  abstract onQueryInnitialState(): void;

  abstract onStatusUpdate(response): void;

  statusUpdate(response) {
    if ((this.updated !== undefined) && (Date.now() - this.updated < UPDATE_DELAY)) {
      this.platform.log.debug('%s (%s) updateStatus ignored updated %sms ago...',
        this.accessory.context.device.name, this.addr,
        Date.now() - this.updated);
      return;
    }
    if (response.Manufacturer && response.ModelId) {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, response.Manufacturer)
        .setCharacteristic(this.platform.Characteristic.Model, response.ModelId)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.addr);
      this.platform.log.debug('%s (%s) Manufacturer: %s, Model: %s',
        this.accessory.context.device.name, this.addr,
        response.Manufacturer,
        response.ModelId,
      );
    } else {
      this.onStatusUpdate(response);
    }
  }
}
