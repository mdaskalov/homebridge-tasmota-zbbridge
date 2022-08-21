import {
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

  getServiceName() {
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
    return this.serviceName;
  }

  registerHandlers() {
    if (this.characteristicName) {
      const characteristic = this.platform.Characteristic[this.characteristicName];
      this.service.getCharacteristic(characteristic)
        .onGet(this.getValue.bind(this));
    }
  }

  onStatusUpdate(msg) {
    let statusText = '';
    this.log('message: ' + JSON.stringify(msg));
    if (this.valuePath && this.characteristicName) {
      const characteristic = this.platform.Characteristic[this.characteristicName];
      const value = this.getObjectByPath(msg, this.valuePath);
      if (characteristic && value !== undefined) {
        statusText += `sensor Value: ${value}`;
        this.value = value;
        this.service.getCharacteristic(characteristic).updateValue(value);
      }
    }
    return statusText;
  }

  //Motion      ZbSend { "Device": "0x01F3", "Cluster": "0x0006", "Read": "0x42" }
  //Contact     ZbSend { "Device": "0xF03B", "Cluster": "0x0500", "Read": "0xFFF2" }
  //Humidity    ZbSend { "Device": "0x19D0", "Cluster": "0x0405", "Read": 0 }
  //Temperature ZbSend { "Device": "0x19D0", "Cluster": "0x0402", "Read": 0 }
  //{"ZbReceived":{"0x01F3":{"Device":"0x01F3","Name":"MotionSensor","BatteryVoltage":2.7,
  //                                 "BatteryPercentage":17,"Endpoint":1,"LinkQuality":79}}}

  async getValue(): Promise<CharacteristicValue> {
    //TODO: should find out how to get currennt value
    //this.mqttSend({ device: this.addr, endpoint: this.endpoint, cluster: this.cluster, read: this.attribute });
    if (this.value !== undefined) {
      return this.value;
    }
    this.zbInfo();
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

}

