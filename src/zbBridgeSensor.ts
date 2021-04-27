import {
  Service,
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';

export class ZbBridgeSensor extends ZbBridgeAccessory {
  private value?: CharacteristicValue;
  private cluster?: number;
  private attribute?: number;
  private serviceName?: string;
  private characteristicName?: string;
  private valuePath?: string;

  getService(): Service {
    //TODO: throw exceptions on invalid data
    const part = this.type.split('_');
    this.cluster = Number(part[1]);
    this.attribute = Number(part[2]);
    this.serviceName = part[3];
    this.characteristicName = part[4];
    this.valuePath = part[5];

    this.log('getService:%s%s%s%s%s',
      this.cluster !== undefined ? ' Cluster: ' + this.cluster : '',
      this.attribute !== undefined ? ' Attribute: ' + this.attribute : '',
      this.serviceName !== undefined ? ' ServiceName: ' + this.serviceName : '',
      this.characteristicName !== undefined ? ' CharacteristicName: ' + this.characteristicName : '',
      this.valuePath !== undefined ? ' valuePath: ' + this.valuePath : '',
    );
    const service = this.platform.Service[this.serviceName!];
    return this.accessory.getService(service) || this.accessory.addService(service);
  }

  registerHandlers() {
    if (this.characteristicName) {
      const characteristic = this.platform.Characteristic[this.characteristicName];
      this.service.getCharacteristic(characteristic)
        .onGet(this.getValue.bind(this));
    }
  }

  onQueryInnitialState() {
    this.mqttSend({ device: this.addr, cluster: this.cluster, read: this.attribute });
  }

  onStatusUpdate(msg) {
    this.log('message: ' + JSON.stringify(msg));
    if (this.valuePath && this.characteristicName) {
      const characteristic = this.platform.Characteristic[this.characteristicName];
      const value = this.getObjectByPath(msg, this.valuePath);
      if (characteristic && value) {
        this.log('value: %s', value);
        this.value = value;
        this.service.getCharacteristic(characteristic).updateValue(value);
      }
    }
  }

  //Motion      ZbSend { "device": "0x01F3", "cluster": "0x0006", "read": "0x42" }
  //Contact     ZbSend { "device": "0xF03B", "cluster": "0x0500", "read": "0xFFF2" }
  //Humidity    ZbSend { "device": "0x19D0", "cluster": "0x0405", "read": 0 }
  //Temperature ZbSend { "device": "0x19D0", "cluster": "0x0402", "read": 0 }

  async getValue(): Promise<CharacteristicValue> {
    //TODO: should find out how to get currennt value
    //this.mqttSend({ device: this.addr, cluster: this.cluster, read: this.attribute });
    if (this.value !== undefined) {
      return this.value;
    }
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

}

