import { Logger, PlatformConfig } from 'homebridge';
import { MqttClient, connect } from 'mqtt';

type HandlerCallback =
  (msg: string, topic: string) => void;

type Handler = {
  id: string;
  topic: string;
  callback: HandlerCallback;
};

export class MQTTClient {

  private messageHandlers: Array<Handler> = [];
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
      const hadnlers = this.messageHandlers.filter(h => this.matchTopic(h, topic));
      hadnlers.forEach(h => h.callback(message.toString(), topic));
    });
  }

  matchTopic(handler: Handler, topic: string) {
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

  subscribe(topic: string, callback: HandlerCallback): string {
    if (this.client) {
      const id = this.uniqueID();
      this.messageHandlers.push({ id, topic, callback });
      this.client.subscribe(topic);
      const handlersCount = this.messageHandlers.filter(h => this.matchTopic(h, topic)).length;
      this.log.debug('MQTT: Subscribed %s :- %s %d handler(s)', id, topic, handlersCount);
      return id;
    }
    return '';
  }

  unsubscribe(id: string) {
    const handler = this.messageHandlers.find(h => h.id === id);
    if (handler) {
      this.messageHandlers = this.messageHandlers.filter(h => h.id !== id);
      const handlersCount = this.messageHandlers.filter(h => this.matchTopic(h, handler.topic)).length;
      if (handlersCount === 0) {
        this.client.unsubscribe(handler.topic);
      }
      this.log.debug('MQTT: Unsubscribed %s :- %s %d handler(s)', id, handler.topic, handlersCount);
    }
  }

  publish(topic: string, message: string) {
    this.client.publish(topic, message);
    this.log.debug('MQTT: Published: %s :- %s', topic, message);
  }
}

