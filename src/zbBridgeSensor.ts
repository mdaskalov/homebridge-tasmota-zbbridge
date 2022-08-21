import {
  Characteristic,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';

export class ZbBridgeSensor extends ZbBridgeAccessory {
  private value: CharacteristicValue;
  private characteristic?: Characteristic;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    this.value = 0;
  }

  getServiceName() {
    const serviceName = (this.accessory.context.device.sensorService || 'undefined');
    const service = this.platform.Service[serviceName!];
    if (service === undefined) {
      this.platform.log.warn('Warning: Unknown service: %s, using ContactSensor instead!', serviceName);
      return 'ContactSensor';
    }
    return serviceName;
  }

  registerHandlers() {
    const characteristicName = this.accessory.context.device.sensorCharacteristic;
    this.characteristic = this.service.getCharacteristic(this.platform.Characteristic[characteristicName!]);
    if (this.characteristic === undefined) {
      this.platform.log.warn('Warning: Unknown characteristic: %s, using ContactSensorState instead!', characteristicName);
      this.characteristic = this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
    }
    // readonly characteristic
    this.characteristic
      .onGet(this.getValue.bind(this));
  }

  onStatusUpdate(msg) {
    let statusText = '';
    if (this.characteristic !== undefined && this.accessory.context.device.sensorValuePath !== undefined) {
      const value = this.getObjectByPath(msg, this.accessory.context.device.sensorValuePath);
      if ((value !== undefined) && (value !== this.value)) {
        this.value = value;
        this.characteristic.updateValue(value);
        statusText += ` Value: ${value}`;
      }
    }
    return statusText;
  }

  //Motion      ZbSend { "device": "0x01F3", "cluster": "0x0006", "read": "0x42" }
  //Contact     ZbSend { "device": "0xF03B", "cluster": "0x0500", "read": "0xFFF2" }
  //Humidity    ZbSend { "device": "0x19D0", "cluster": "0x0405", "read": 0 }
  //Temperature ZbSend { "device": "0x19D0", "cluster": "0x0402", "read": 0 }
  //{"ZbReceived":{"0x01F3":{"Device":"0x01F3","Name":"MotionSensor","BatteryVoltage":2.7,
  //                                 "BatteryPercentage":17,"Endpoint":1,"LinkQuality":79}}}

  async getValue(): Promise<CharacteristicValue> {
    // TODO: current value is unavailable when device is in sleep mode
    // this.mqttSend({ device: this.addr, endpoint: this.endpoint, cluster: this.cluster, read: this.attribute });
    // throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    return this.value;
  }

}

