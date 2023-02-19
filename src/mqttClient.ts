import { Logger, PlatformConfig } from 'homebridge';
import { MqttClient, connect } from 'mqtt';

type TopicCallback =
  (msg: string, topic: string) => void;

type TopicHandler = {
  id: string;
  topic: string;
  messageDump: boolean;
  callOnce: boolean;
  callback: TopicCallback;
};

export const DEFALT_TIMEOUT = 5000;

export class MQTTClient {
  private topicHandlers: Array<TopicHandler> = [];
  private client: MqttClient;
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

    this.client.on('error', err => {
      this.log.error('MQTT: Error: %s', err.message);
    });

    this.client.on('message', (topic, message) => {
      const callOnceHandlers = this.topicHandlers.filter(h => h.callOnce === true && this.matchTopic(h, topic));
      if (callOnceHandlers.length !== 0) {
        const msg = callOnceHandlers.some(h => h.messageDump) ? topic + ' ' + message : topic;
        this.log.debug('MQTT Message %s, onceHandlers: %s', msg, callOnceHandlers.length);
        callOnceHandlers.forEach(h => h.callback(message.toString(), topic));
        this.topicHandlers = this.topicHandlers.filter(h => !callOnceHandlers.includes(h));
        const handlersCount = this.topicHandlers.filter(h => this.matchTopic(h, topic)).length;
        if (handlersCount === 0) {
          this.client.unsubscribe(topic);
          this.log.debug('MQTT: Unsubscribed %s', topic);
        }
      } else {
        const hadnlers = this.topicHandlers.filter(h => this.matchTopic(h, topic));
        const msg = hadnlers.some(h => h.messageDump) ? topic + ' ' + message : topic;
        this.log.debug('MQTT Message %s, handlers: %s', msg, hadnlers.length);
        hadnlers.forEach(h => h.callback(message.toString(), topic));
      }
    });
  }

  matchTopic(handler: TopicHandler, topic: string) {
    if (handler.topic.includes('#')) {
      return topic.startsWith(handler.topic.substring(0, handler.topic.indexOf('#')));
    }
    const topicParts = topic.split('/');
    const handlerTopicParts = handler.topic.split('/');
    if (topicParts.length === handlerTopicParts.length) {
      return topicParts.every((part, idx) => part === handlerTopicParts[idx] || handlerTopicParts[idx] === '+');
    }
    return false;
  }

  uniqueID() {
    const pid = process && process.pid ? process.pid.toString(36) : '';
    const time = Date.now();
    this.last = time > this.last ? time : this.last + 1;
    return pid + this.last.toString(36);
  }

  subscribeTopic(topic: string, callback: TopicCallback, messageDump = true, callOnce = false): string {
    if (this.client) {
      const id = this.uniqueID();
      this.log.debug('MQTT Subscribed: %s, %s', topic, id);
      this.topicHandlers.push({ id, topic, messageDump, callOnce, callback });
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

  read(topic: string, timeout?: number, messageDump?: boolean): Promise<string> {
    return new Promise((resolve: (message: string) => void, reject) => {
      const start = Date.now();
      const handlerId = this.subscribeTopic(topic, message => {
        clearTimeout(timer);
        resolve(message);
      }, messageDump === undefined ? true : messageDump, true);
      const timer = setTimeout(() => {
        if (handlerId !== undefined) {
          this.unsubscribe(handlerId);
        }
        const elapsed = Date.now() - start;
        reject(`MQTT: Read timeout after ${elapsed}ms`);
      }, timeout === undefined ? DEFALT_TIMEOUT : timeout);
    });
  }

  submit(topic: string, message: string, responseTopic = topic, timeout?: number, messageDump?: boolean): Promise<string> {
    this.publish(topic, message);
    return this.read(responseTopic, timeout, messageDump);
  }
}
