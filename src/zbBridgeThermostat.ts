import {
  CharacteristicValue,
  PlatformAccessory,
} from 'homebridge';

import { ZbBridgeAccessory } from './zbBridgeAccessory';
import { TasmotaZbBridgePlatform } from './platform';
import { ZbBridgeCharacteristic } from './zbBridgeCharacteristic';

export class ZbBridgeThermostat extends ZbBridgeAccessory {
  private currentTemperature: ZbBridgeCharacteristic;
  private targetTemperature: ZbBridgeCharacteristic;

  private currentHeatingCoolingState: ZbBridgeCharacteristic;
  private targetHeatingCoolingState: ZbBridgeCharacteristic;
  private heatingThresholdTemperature: ZbBridgeCharacteristic;
  private coolingThresholdTemperature: ZbBridgeCharacteristic;

  constructor(
    readonly platform: TasmotaZbBridgePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.currentTemperature = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'CurrentTemperature', 20);

    this.targetTemperature = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'TargetTemperature', 22);

    this.currentHeatingCoolingState = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'CurrentHeatingCoolingState', this.platform.Characteristic.CurrentHeatingCoolingState.OFF);

    this.targetHeatingCoolingState = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'TargetHeatingCoolingState', this.platform.Characteristic.TargetHeatingCoolingState.AUTO);

    this.heatingThresholdTemperature = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'HeatingThresholdTemperature', 20);

    this.coolingThresholdTemperature = new ZbBridgeCharacteristic(this.platform, this.accessory, this.service,
      'CoolingThresholdTemperature', 30);

    this.currentTemperature.willGet = (value, needsUpdate) => {
      this.log('willGet currentTemperature to: %s, needsUpdate %s', value, needsUpdate);
      if (needsUpdate) {
        this.zbInfo();
        return undefined;
      }
      return value;
    };
    this.targetTemperature.willGet = (value, needsUpdate) => {
      this.log('willGet targetTemperature to: %s, needsUpdate %s', value, needsUpdate);
      if (needsUpdate) {
        this.zbInfo();
        return undefined;
      }
      return value;
    };

    this.heatingThresholdTemperature.willGet = (value, needsUpdate) => {
      this.log('willGet heatingThresholdTemperature to: %s, needsUpdate %s', value, needsUpdate);
      if (needsUpdate) {
        this.zbInfo();
        return undefined;
      }
      return value;
    };

    this.coolingThresholdTemperature.willGet = (value, needsUpdate) => {
      this.log('willGet coolingThresholdTemperature to: %s, needsUpdate %s', value, needsUpdate);
      if (needsUpdate) {
        this.zbInfo();
        return undefined;
      }
      return value;
    };

    this.targetTemperature.willSet = (value: CharacteristicValue) => {
      this.log('willSet targetTemperature to:', value);
    };

    this.heatingThresholdTemperature.willSet = (value: CharacteristicValue) => {
      this.log('willSet heatingThresholdTemperature to:', value);
    };

    this.coolingThresholdTemperature.willSet = (value: CharacteristicValue) => {
      this.log('willSet coolingThresholdTemperature to:', value);
    };
  }

  getServiceName() {
    return 'Thermostat';
  }

  registerHandlers() {
    return;
  }

  onStatusUpdate(msg): string {
    let statusText = '';

    if (msg.Temperature !== undefined) {
      statusText += this.currentTemperature.update(msg.Temperature);
    }
    if (msg.LocalTemperature !== undefined) { // Tuya
      statusText += this.currentTemperature.update(msg.LocalTemperature);
    }
    if (msg.TempTarget !== undefined) {
      statusText += this.targetTemperature.update(msg.TempTarget);
    }
    if (msg.TuyaTempTarget !== undefined) {
      statusText += this.targetTemperature.update(msg.TuyaTempTarget);
    }

    if (msg.TuyaEcoTemp !== undefined) {
      statusText += this.heatingThresholdTemperature.update(msg.TuyaEcoTemp);
    }
    if (msg.TuyaComfortTemp !== undefined) {
      statusText += this.coolingThresholdTemperature.update(msg.TuyaComfortTemp);
    }

    return statusText;
  }

}
