import { Service, PlatformAccessory, CharacteristicValue} from 'homebridge';
import { TasmotaZbBridgePlatform } from './platform';

enum DeviceType {
  Switch,
  Lightbulb,
  TemperatureSensor,
  HumiditySensor,
  ContactSensor
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
  private valuePath: string;
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
    this.valuePath = this.accessory.context.device.type;
    this.value = 0;
    this.hue = 20;
    this.saturation = 100;
    this.brightness = 100;

    let service;
    if (this.valuePath.includes('Temperature')) {
      service = this.platform.Service.TemperatureSensor;
      this.type = DeviceType.TemperatureSensor;
    } else if (this.valuePath.includes('Humidity')) {
      service = this.platform.Service.HumiditySensor;
      this.type = DeviceType.HumiditySensor;
    } else if (this.valuePath.includes('Switch')) {
      this.valuePath = this.valuePath + '.Action';
      service = this.platform.Service.ContactSensor;
      this.type = DeviceType.ContactSensor;
    } else if (this.valuePath.includes('HSBColor')) {
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
      this.supportHS = true;
      this.supportBrightness = true;
    } else if (this.valuePath.includes('Dimmer')) {
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
      this.supportBrightness = true;
    } else if (this.valuePath.includes('LIGHT')) {
      this.valuePath = this.valuePath.replace('LIGHT', 'POWER');
      service = this.platform.Service.Lightbulb;
      this.type = DeviceType.Lightbulb;
    } else {
      service = this.platform.Service.Switch;
      this.type = DeviceType.Switch;
    }
    this.service = this.accessory.getService(service) || this.accessory.addService(service);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

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

  updateStatus(response) {
    this.updateAccessoryInformation(response);

    if (this.type === DeviceType.HSBLight && response.POWER) {
      this.value = (response.POWER === 'ON');
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.value);
    }

    if (this.type === DeviceType.ContactSensor) {
      this.updateContactSensor(response, 'StatusSNS.'+this.deviceType);
      this.updateContactSensor(response, this.deviceType+'.Action');
    }

    const sensorValue = this.getObjectByPath(response, this.valuePath);
    if (sensorValue !== undefined) {
      switch (this.type) {
        case DeviceType.HSBLight:
          this.updateHSBColor(sensorValue as string);
          break;
        case DeviceType.TemperatureSensor:
          this.value = sensorValue as number;
          this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.value);
          this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).props.minValue = -50;
          break;
        case DeviceType.HumiditySensor:
          this.value = sensorValue as number;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.value);
          break;
        default:
          this.value = (sensorValue as string === 'ON');
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.value);
          break;
      }
      this.platform.log.debug('%s (%s) %s: %s',
        this.accessory.context.device.name,
        this.accessory.context.device.topic,
        this.valuePath,
        sensorValue,
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

  updateHSBColor(value: string) {
    const data = value.split(',');
    if (data.length === 3) {
      this.hue = Number(data[0]);
      this.saturation = Number(data[1]);
      this.brightness = Number(data[2]);
      if (this.supportHS) {
        this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(this.hue);
        this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(this.saturation);
      }
      if (this.supportBrightness) {
        this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(this.brightness);
      }
    }
  }

  setOn(value: CharacteristicValue) {
    if (this.value !== value) {
      this.value = value as boolean;
      this.platform.mqttClient.publish(this.cmndTopic + '/' + this.valuePath, value ? 'ON' : 'OFF');
    }
  }

  getOn(): CharacteristicValue {
    this.platform.mqttClient.publish(this.cmndTopic + '/' + this.valuePath, '');
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
