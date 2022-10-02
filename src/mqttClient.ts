import { Logger, PlatformConfig } from 'homebridge';
import { MqttClient, connect } from 'mqtt';

type TopicCallback =
  (msg: string, topic: string) => void;

type TopicHandler = {
  id: string;
  topic: string;
  callOnce: boolean;
  callback: TopicCallback;
};

type DeviceCallback =
  (msg) => void;

type DeviceHandler = {
  addr: number;
  shortAddr: number;
  endpoint: number | undefined;
  callback: DeviceCallback;
};

export class MQTTClient {

  private topicHandlers: Array<TopicHandler> = [];
  private deviceHandlers: Array<DeviceHandler> = [];
  private client: MqttClient;
  public topic: string;
  private last = 0;

  constructor(private log: Logger, private config: PlatformConfig) {
    const broker = config.mqttBroker || 'localhost';
    const options = {
      clientId: 'homebridge-zbbridge_' + Math.random().toString(16).substr(2, 8),
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 30000,
      connectTimeout: 30000,
      username: config.mqttUsername,
      password: config.mqttPassword,
    };

    this.client = connect('mqtt://' + broker, options);
    this.topic = this.config.mqttTopic || 'zbbridge';

    this.client.on('error', err => {
      this.log.error('MQTT: Error: %s', err.message);
    });

    this.client.on('message', (topic, message) => {
      if (topic.startsWith('tele/' + this.topic)) {
        try {
          const msg = JSON.parse(message.toString());
          this.onDeviceMessage(msg);
        } catch (err) {
          this.log.error('MQTT: message parse error: %s', message.toString());
        }
        return;
      }
      const callOnceHandlers = this.topicHandlers.filter(h => h.callOnce === true && this.matchTopic(h, topic));
      if (callOnceHandlers.length !== 0) {
        this.log.debug('MQTT message %s %s onceHandlers: %s', topic, message, callOnceHandlers.length);
        callOnceHandlers.forEach(h => h.callback(message.toString(), topic));
        this.topicHandlers = this.topicHandlers.filter(h => !callOnceHandlers.includes(h));
      } else {
        const hadnlers = this.topicHandlers.filter(h => this.matchTopic(h, topic));
        this.log.debug('MQTT message %s %s handlers: %s', topic, message, hadnlers.length);
        hadnlers.forEach(h => h.callback(message.toString(), topic));
      }
    });

    // zbBridge device messages
    this.client.subscribe('tele/' + this.topic + '/SENSOR');
    this.client.subscribe('tele/' + this.topic + '/+/SENSOR');
  }

  findDevice(obj) {
    if (obj) {
      if (obj.Device) {
        return obj;
      }
      for (const prop in obj) {
        const child = obj[prop];
        if (typeof child === 'object' && !Array.isArray(child) && child !== null) {
          const found = this.findDevice(child);
          if (found !== undefined) {
            return found;
          }
        }
      }
    }
  }

  addrMatch(h: DeviceHandler, msg) {
    const addr = Number(msg.IEEEAddr);
    const shortAddr = Number(msg.Device);

    if (h.addr === addr) {
      if (shortAddr) {
        h.shortAddr = shortAddr;
      }
      return true;
    }
    return (h.shortAddr === shortAddr);
  }

  onDeviceMessage(message) {
    const msg = this.findDevice(message);
    if (msg !== undefined) {
      const handler = this.deviceHandlers.find(h => {
        const addrMatch = this.addrMatch(h, msg);
        const endpointMatch = (h.endpoint === undefined) || (msg.Endpoint === undefined) || (Number(h.endpoint) === Number(msg.Endpoint));
        return addrMatch && endpointMatch;
      });
      if (handler) {
        handler.callback(msg);
      }
    }
  }

  subscribeDevice(addr: number, endpoint: number | undefined, callback: DeviceCallback) {
    this.deviceHandlers.push({ addr, shortAddr: addr, endpoint, callback });
  }

  matchTopic(handler: TopicHandler, topic: string) {
    if (handler.topic.includes('+')) {
      return topic.includes(handler.topic.substr(0, handler.topic.indexOf('+')));
    }
    return handler.topic === topic;
  }

  uniqueID() {
    const pid = process && process.pid ? process.pid.toString(36) : '';
    const time = Date.now();
    this.last = time > this.last ? time : this.last + 1;
    return pid + this.last.toString(36);
  }

  subscribeTopic(topic: string, callback: TopicCallback, callOnce = false): string {
    if (this.client) {
      const id = this.uniqueID();
      this.log.debug('MQTT subscribe: %s, %s', topic, id);
      this.topicHandlers.push({ id, topic, callOnce, callback });
      const handlersCount = this.topicHandlers.filter(h => this.matchTopic(h, topic)).length;
      if (handlersCount === 1) {
        this.client.subscribe(topic);
      }
      return id;
    }
    return '';
  }

  unsubscribe(id: string) {
    const handler = this.topicHandlers.find(h => h.id === id);
    if (handler) {
      this.topicHandlers = this.topicHandlers.filter(h => h.id !== id);
      const handlersCount = this.topicHandlers.filter(h => this.matchTopic(h, handler.topic)).length;
      if (handlersCount === 0) {
        this.client.unsubscribe(handler.topic);
      }
      this.log.debug('MQTT: Unsubscribed %s :- %s %d handler(s)', id, handler.topic, handlersCount);
    }
  }

  publish(topic: string, message: string) {
    this.client.publish(topic, message);
    this.log.debug('MQTT: Published: %s %s', topic, message);
  }

  submit(topic: string, message: string, responseTopic = topic, timeOut = 2000): Promise<string> {
    return new Promise((resolve: (message) => void, reject) => {
      const startTS = Date.now();

      const handlerId = this.subscribeTopic(responseTopic, msg => {
        clearTimeout(timer);
        resolve(msg);
      }, true);

      const timer = setTimeout(() => {
        this.log.error('MQTT: Submit: timeout after %sms %s',
          Date.now() - startTS, message);
        if (handlerId !== undefined) {
          this.unsubscribe(handlerId);
        }
        reject('MQTT: Submit timeout');
      }, timeOut);
      this.publish(topic, message);
    });
  }

  zbInfo(addr: string): void {
    const topic = 'cmnd/' + this.topic + '/zbinfo';
    this.publish(topic, addr);
  }

  zbSend(command): void {
    const topic = 'cmnd/' + this.topic + '/zbsend';
    const message = JSON.stringify(command);
    this.publish(topic, message);
  }

}

