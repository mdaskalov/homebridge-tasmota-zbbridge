import { Logger, PlatformConfig } from 'homebridge';

import { MqttClient, connect } from 'mqtt';


type HandlerCallback =
  (msg) => void;

type Handler = {
  id: string;
  topic: string;
  callback: HandlerCallback;
};

export class MQTTClient {

  private topicHandlers: Array<Handler> = [];
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
      this.log.error('MQTT Error: %s', err.message);
    });

    this.client.on('message', (topic, message) => {
      this.log.debug('MQTT Received: %s :- %s', topic, message);
      const obj = JSON.parse(message.toString());
      const hadnlers = this.topicHandlers.filter(h => h.topic === topic);
      hadnlers.forEach(h => h.callback(obj));
    });

    this.log.info('MQTT Client initialized');
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
      this.topicHandlers.push({ id, topic, callback });
      this.client.subscribe(topic);
      const handlersCount = this.topicHandlers.filter(h => h.topic === topic).length;
      this.log.debug('MQTT Subscribed %s :- %s %d handler(s)', id, topic, handlersCount);
      return id;
    }
    return '';
  }

  unsubscribe(id: string) {
    const handler = this.topicHandlers.find(h => h.id === id);
    if (handler) {
      const topic = handler.topic;
      this.topicHandlers = this.topicHandlers.filter(h => h.id !== id);
      const handlersCount = this.topicHandlers.filter(h => h.topic === topic).length;
      this.log.debug('MQTT Unsubscribed %s :- %s %d handler(s)', id, topic, handlersCount);
      if (handlersCount === 0) {
        this.client.unsubscribe(topic);
      }
    }
  }

  send(command) {
    return new Promise((resolve: (data) => void, reject) => {
      const device = command.device;
      if (device) {
        let id = '';
        const timeOutValue = 5000; //wait max 3 seconds

        const topic = this.config.mqttTopic || 'zbbridge';
        const oTopic = 'cmnd/' + topic + '/ZbSend';
        const iTopic = 'tele/' + topic + '/SENSOR';
        const payload = JSON.stringify(command);

        this.log.info('Send device: %s :- %s', device.toString(16), payload);

        const timer = setTimeout(() => {
          reject(`send: Timeout: id: ${id} command: ${payload} :- topic: ${iTopic}`);
          this.unsubscribe(id);
        }, timeOutValue);

        id = this.subscribe(iTopic, (msg) => {
          const answerDevice = Object.keys(msg.ZbReceived)[0];
          if (answerDevice === device) {
            clearTimeout(timer);
            this.unsubscribe(id);
            resolve(msg.ZbReceived[answerDevice]);
          } else {
            this.log.warn('send: Ignored response for device: %s', answerDevice);
          }
        });
        this.client.publish(oTopic, payload);
      } else {
        reject('send: Unknown device.');
      }
    });
  }
}

