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
    readonly serviceName: string,
  ) {
    super(platform, accessory, serviceName);
    this.value = 0;
  }

  registerHandlers() {
    const characteristicName = this.accessory.context.device.sensorCharacteristic;
    if (characteristicName !== undefined) {
      this.characteristic = this.service.getCharacteristic(this.platform.Characteristic[characteristicName]);
      if (this.characteristic === undefined) {
        this.platform.log.warn('Warning: Unknown characteristic: %s, using ContactSensorState instead!', characteristicName);
        this.characteristic = this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState);
      }
      // readonly characteristic
      this.characteristic
        .onGet(this.getValue.bind(this));
    }
  }

  onStatusUpdate(msg) {
    let statusText = '';
    if (this.characteristic !== undefined && this.accessory.context.device.sensorValuePath !== undefined) {
      const value = this.mapSensorValue(this.getObjectByPath(msg, this.accessory.context.device.sensorValuePath));
      if ((value !== undefined) && (value !== this.value)) {
        this.value = value;
        this.characteristic.updateValue(value);
        statusText += ` Value: ${value}`;
      }
    }
    return statusText;
  }

  mapSensorValue(value: CharacteristicValue): CharacteristicValue | undefined {
    const mapping = this.accessory.context.device.sensorValueMapping;
    if (Array.isArray(mapping)) {
      const mapEntry = mapping.find(m => m.from === value);
      if (mapEntry !== undefined) {
        return mapEntry.to;
      }
      return undefined;
    }
    return value;
  }

  //Motion      ZbSend { "Device": "0x01F3", "Cluster": "0x0006", "Read": "0x42" }
  //Contact     ZbSend { "Device": "0xF03B", "Cluster": "0x0500", "Read": "0xFFF2" }
  //Humidity    ZbSend { "Device": "0x19D0", "Cluster": "0x0405", "Read": 0 }
  //Temperature ZbSend { "Device": "0x19D0", "Cluster": "0x0402", "Read": 0 }
  //{"ZbReceived":{"0x01F3":{"Device":"0x01F3","Name":"MotionSensor","BatteryVoltage":2.7,
  //                                 "BatteryPercentage":17,"Endpoint":1,"LinkQuality":79}}}

  async getValue(): Promise<CharacteristicValue> {
    // TODO: current value is unavailable when device is in sleep mode
    // this.mqttSend({ device: this.addr, endpoint: this.endpoint, cluster: this.cluster, read: this.attribute });
    // throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
    return this.value;
  }

}

