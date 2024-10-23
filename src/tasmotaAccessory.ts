import { Service, PlatformAccessory, CharacteristicValue, HAPStatus} from 'homebridge';
import { TasmotaZbBridgePlatform } from './platform';

enum DeviceType {
  Switch,
  Lightbulb,
  TemperatureSensor,
  HumiditySensor,
  ContactSensor,
}

export type TasmotaDevice = {
  topic: string;
  type: string;
  name: string;
};

export class TasmotaAccessory {
  private type: DeviceType;
  private service: Service;
  private cmndTopic: string;
  private valueUpdatePath: string;
  private value: CharacteristicValue;
  private hue: CharacteristicValue;
  private saturation: CharacteristicValue;
  private brightness: CharacteristicValue;

  private supportBrightness?: boolean;
  private supportHS?: boolean;

  constructor(
    private readonly platform: TasmotaZbBridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.cmndTopic = 'cmnd/' + this.accessory.context.device.topic;
    this.valueUpdatePath = this.accessory.context.device.type;
    this.value = 0;
    this.hue = 20;
    this.saturation = 100;
    this.brightness = 100;

    let service;
    if (this.valueUpdatePath.includes('Temperature')) {
      service = this.platform.Service.TemperatureSensor;
      this.type = DeviceType.TemperatureSensor;
    } else if (this.valueUpdatePath.includes('Humidity')) {
      service = this.platform.Service.HumiditySensor;
      this.type = DeviceType.HumiditySensor;
    } else if (this.valueUpdatePath.includes('Switch')) {
      service = this.platform.Service.ContactSensor;
      this.type = DeviceType.ContactSensor;
    } else if (this.valueUpdatePath.includes('HSBColor')) {
      this.valueUpdatePath = 'POWER';
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
      this.supportHS = true;
      this.supportBrightness = true;
    } else if (this.valueUpdatePath.includes('Dimmer')) {
      this.valueUpdatePath = 'POWER';
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
      this.supportBrightness = true;
    } else if (this.valueUpdatePath.includes('LIGHT')) {
      this.valueUpdatePath = this.valueUpdatePath.replace('LIGHT', 'POWER');
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
    } else {
      service = this.platform.Service.Switch;
      this.type = DeviceType.Switch;
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);

    switch (this.type) {
      case DeviceType.Switch, DeviceType.Lightbulb:
        if (this.supportHS) {
          this.service.getCharacteristic(this.platform.Characteristic.Hue)
            .onSet(this.setHue.bind(this))
            .onGet(this.getHue.bind(this));
          this.service.getCharacteristic(this.platform.Characteristic.Saturation)
            .onSet(this.setSaturation.bind(this))
            .onGet(this.getSaturation.bind(this));
        }
        if (this.supportBrightness) {
          this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBrightness.bind(this))
            .onGet(this.getBrightness.bind(this));
        }
        this.service.getCharacteristic(this.platform.Characteristic.On)
          .onSet(this.setOn.bind(this))
          .onGet(this.getOn.bind(this));
        break;
      case DeviceType.TemperatureSensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.getSensor.bind(this));
        break;
      case DeviceType.HumiditySensor:
        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
          .onGet(this.getSensor.bind(this));
        break;
      case DeviceType.ContactSensor:
        this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
          .onGet(this.getSensor.bind(this));
        break;
    }

    // Update status on all stat topics
    this.platform.mqttClient.subscribeTopic('stat/' + this.accessory.context.device.topic + '/+', (message, topic) => {
      this.platform.log.debug('MQTT: Received: %s %s', topic, message);
      let obj = undefined;
      try {
        obj = JSON.parse(message);
        this.updateStatus(obj);
      } catch {
        this.updateStatus({ message });
      }
    });

    // Request general, serial and sensor status
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '');
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '5');
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
  }

  getObjectByPath(obj, path: string) {
    return path.split('.').reduce((a, v) => a ? a[v] : undefined, obj);
  }

  updateStatus(obj) {
    this.updateAccessoryInformation(obj);
    if (this.type === DeviceType.ContactSensor) {
      this.updateContactSensor(obj, 'StatusSNS.'+this.valueUpdatePath);
      this.updateContactSensor(obj, this.valueUpdatePath+'.Action');
      return;
    }
    this.updateColor(obj);

    const value = this.getObjectByPath(obj, this.valueUpdatePath);
    if (value !== undefined) {
      switch (this.type) {
        case DeviceType.TemperatureSensor:
          this.value = value as number;
          this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.value);
          this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).props.minValue = -50;
          break;
        case DeviceType.HumiditySensor:
          this.value = value as number;
          this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).updateValue(this.value);
          break;
        default:
          this.value = (value as string === 'ON');
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.value);
          break;
      }
      this.platform.log.debug('%s (%s) %s: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        this.valueUpdatePath,
        value,
      );
    }
  }

  updateAccessoryInformation(obj) {
    const accessoryInformation = this.accessory.getService(this.platform.Service.AccessoryInformation);
    if (accessoryInformation !== undefined) {
      const deviceName = this.getObjectByPath(obj, 'Status.DeviceName');
      if (deviceName) {
        accessoryInformation
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tasmota')
          .setCharacteristic(this.platform.Characteristic.Model, deviceName);
        this.platform.log.debug('%s (%s) Manufacturer: Tasmota, Model: %s',
          this.accessory.context.device.name,
          this.accessory.context.device.topic,
          deviceName,
        );
      }
      const serialNumber = this.getObjectByPath(obj, 'StatusNET.Mac');
      if (serialNumber !== undefined) {
        accessoryInformation
          .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
        this.platform.log.debug('%s (%s) Mac: %s',
          this.accessory.context.device.name,
          this.accessory.context.device.topic,
          serialNumber,
        );
      }
    }
  }

  updateContactSensor(obj, path: string) {
    const value = this.getObjectByPath(obj, path) as string;
    if (value !== undefined) {
      this.value = (value === 'ON') ? 0 : 1;
      this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState).updateValue(this.value);
    }
  }

  updateColor(obj) {
    if (typeof(obj.HSBColor) === 'string' && (this.supportHS || this.supportBrightness) ) {
      const data = obj.HSBColor.split(',');
      if (data.length === 3) {
        if (this.supportHS) {
          this.hue = Number(data[0]);
          this.saturation = Number(data[1]);
          this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.hue);
          this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.saturation);
        }
        if (this.supportBrightness) {
          this.brightness = Number(data[2]);
          this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(this.brightness);
        }
      }  
    }
    if (typeof(obj.Dimmer) === 'number' && this.supportBrightness) {
      this.brightness = obj.Dimmer as number;
      this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(this.brightness);
    }
  }

  setOn(value: CharacteristicValue) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/' + this.valueUpdatePath, value ? 'ON' : 'OFF');
    }
  }

  getOn(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/' + this.valueUpdatePath, '');
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  setHue(value: CharacteristicValue) {
    if (this.hue !== value) {
      this.hue = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor1', String(value as number));
    }
  }

  getHue(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  setSaturation(value: CharacteristicValue) {
    if (this.saturation !== value) {
      this.saturation = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor2', String(value as number));
    }
  }

  getSaturation(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  setBrightness(value: CharacteristicValue) {
    if (this.brightness !== value) {
      this.brightness = value as number;
      this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor3', String(value as number));
    }
  }

  getBrightness(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/HSBColor', '');
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  getSensor(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/STATUS', '10');
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }
}
