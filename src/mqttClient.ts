import { Logger, PlatformConfig } from 'homebridge';
import { IClientOptions, MqttClient, connect } from 'mqtt';

type TopicCallback =
  (msg: string, topic: string) => boolean | void; // priority handler consumes message if not false

type TopicHandler = {
  id: string;
  topic: string;
  callback: TopicCallback;
};

const DEFALT_TIMEOUT = 5000;
const MAX_COUNTER = 2147483647; // 2^31 - 1

export class MQTTClient {
  private prioHandlers: TopicHandler[] = [];
  private handlers: TopicHandler[] = [];
  private client: MqttClient;
  private idCounter = 0;

  constructor(private log: Logger, private config: PlatformConfig) {
    const broker = config.mqttBroker || 'localhost';
    const options: IClientOptions = {
      clientId: 'homebridge-zbbridge_' + Math.random().toString(16).slice(2, 10),
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
      const handlers = this.handlers.filter(h => this.matchTopic(h, topic));
      const prioHandlers = this.prioHandlers.filter(h => this.matchTopic(h, topic));
      const handlersCount = handlers.length + prioHandlers.length;
      this.log.debug('MQTT: Message on %s, handler(s): %d (%d prio)', topic, handlersCount, prioHandlers.length);
      for (const prioHandler of prioHandlers) {
        if (prioHandler.callback(message.toString(), topic) === true) {
          this.log.debug('MQTT: Message consumed by prioHandler %s', prioHandler.id);
          return;
        }
      }
      for (const handler of handlers) {
        if (handler.callback(message.toString(), topic) === true) {
          this.log.debug('MQTT: Message consumed by Handler %s', handler.id);
          return;
        }
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

  uniqueID(): string {
    const timestamp = Date.now();
    if (this.idCounter >= MAX_COUNTER) {
      this.idCounter = 0;
    }
    return `${timestamp}-${this.idCounter++}`;
  }

  handersCount(topic: string): { handlersCount: number, prioHandlersCount } {
    const prioHandlersCount = this.prioHandlers.filter(h => this.matchTopic(h, topic)).length;
    const handlersCount = prioHandlersCount + this.handlers.filter(h => this.matchTopic(h, topic)).length;
    return { handlersCount, prioHandlersCount };
  }

  subscribeTopic(topic: string, callback: TopicCallback, priority = false, messageDump = false): string | undefined {
    if (this.client) {
      const id = this.uniqueID();
      const handler: TopicHandler = { id, topic, callback };
      if (priority) {
        this.prioHandlers.push(handler);
      } else {
        this.handlers.push(handler);
      }
      const {prioHandlersCount, handlersCount} = this.handersCount(topic);
      this.log.debug('MQTT: Subscribed: %s :- %s%s - %d (%d prio) handler(s)',
        id,
        topic,
        priority ? ' (priority)' : '',
        handlersCount,
        prioHandlersCount,
      );
      if (handlersCount === 1) {
        this.client.subscribe(topic);
      }
      return id;
    }
    return undefined;
  }

  unsubscribe(id: string) {
    let priority = true;
    let handler = this.prioHandlers.find(h => h.id === id);
    if (!handler) {
      priority = false;
      handler = this.handlers.find(h => h.id === id);
    }
    if (handler) {
      if (priority) {
        this.prioHandlers = this.prioHandlers.filter((h => h.id !== id));
      } else {
        this.handlers = this.handlers.filter((h => h.id !== id));
      }
      const {prioHandlersCount, handlersCount} = this.handersCount(handler.topic);
      if (handlersCount === 0) {
        this.client.unsubscribe(handler.topic);
      }
      this.log.debug('MQTT: Unsubscribed %s :- %s%s - %d (%d prio) handler(s)',
        handler.id,
        handler.topic,
        priority ? ' (priority)' : '',
        handlersCount,
        prioHandlersCount,
      );
    } else {
      this.log.warn('MQTT: Cannot unsubscribe %s - not found', id);
    }
  }

  publish(topic: string, message: string) {
    this.client.publish(topic, message);
    this.log.debug('MQTT: Published: %s %s', topic, message);
  }

  read(topic: string, timeout: number = DEFALT_TIMEOUT): Promise<string> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let handlerId: string | undefined = undefined;
      handlerId = this.subscribeTopic(topic, message => {
        clearTimeout(timer);
        resolve(message);
        if (handlerId !== undefined) {
          this.unsubscribe(handlerId);
        }
        return true;
      }, true);
      const timer = setTimeout(() => {
        if (handlerId !== undefined) {
          this.unsubscribe(handlerId);
        }
        const elapsed = Date.now() - start;
        reject(`MQTT: Read timeout after ${elapsed}ms`);
      }, timeout);
    });
  }

  async submit(topic: string, message: string, responseTopic = topic, timeout?: number): Promise<string> {
    this.publish(topic, message);
    try {
      return await this.read(responseTopic, timeout);
    } catch {
      this.log.error('Submit timeout on %s %s', topic, message);
      return '';
    }
  }
}
