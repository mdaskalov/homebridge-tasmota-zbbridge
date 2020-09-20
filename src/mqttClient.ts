import { Logger, PlatformConfig } from 'homebridge';

import { MqttClient, connect } from 'mqtt';

type Handler = {
  id: string;
  callback: (msg) => void;
};

export class MQTTClient {

  private singleHandlers: Array<Handler> = [];
  private multipleHandlers: Array<Handler> = [];
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

      let handlersCount = 0;
      const multipleHandlers = this.multipleHandlers[topic];
      if (multipleHandlers) {
        handlersCount += multipleHandlers.length;
        log.debug('got %d multipleHandlers handlers for %s', multipleHandlers.length, topic);
        multipleHandlers.forEach((handler: Handler) => handler.callback(obj));
      }

      const singleHandlers = this.singleHandlers[topic];
      if (singleHandlers) {
        log.debug('got %d singleMessage handlers for %s', singleHandlers.length, topic);
        const handler = singleHandlers.pop();
        handlersCount += singleHandlers.length;
        if (handler) {
          handler.callback(obj);
        }
      }

      if (handlersCount === 0) {
        log.debug('MQTT Unsubscribe %s', topic);
        this.client.unsubscribe(topic);
      }
    });
    this.log.info('MQTT Client initialized');
  }

  uniqueID() {
    const pid = process && process.pid ? process.pid.toString(36) : '';
    const time = Date.now();
    this.last = time > this.last ? time : this.last + 1;
    return pid + this.last.toString(36);
  }

  addHandler(topic: string, singleMessage: boolean, handler: Handler) {
    const list = singleMessage ? this.singleHandlers : this.multipleHandlers;
    if (list[topic]) {
      list[topic].push(handler);
    } else {
      list[topic] = [handler];
    }
  }

  subscribe(topic: string, callback: (msg) => void, singleMessage = false): string {
    if (this.client) {
      const handler = { id: this.uniqueID(), callback: callback };
      this.log.debug('MQTT Subscribed: %s :- %s', handler.id, topic);
      this.addHandler(topic, singleMessage, handler);
      this.client.subscribe(topic);
      return handler.id;
    }
    return '';
  }

  unsubscribe(topic: string, id: string) {
    if (this.client) {
      this.log.debug('MQTT Unsubscribed: %s :- %s', id, topic);
    }
  }

  execute(command: string, arg?: string, inTopic?: string) {
    return new Promise((resolve: (data) => void, reject) => {
      let id = '';
      const timeOutValue = 3000; //wait max 3 seconds

      const topic = this.config.mqttTopic || 'zbbridge';
      const oTopic = 'cmnd/' + topic + '/' + command;
      const iTopic = inTopic || 'tele/' + topic + '/SENSOR';

      this.log.info('Execute in: %s, oTopic: %s %s', iTopic, oTopic, arg);

      const timer = setTimeout(() => {
        this.unsubscribe(iTopic, id);
        reject(`Timeout: id: ${id} command: ${command} :- topic: ${iTopic}`);
      }, timeOutValue);

      id = this.subscribe(iTopic, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      }, true);
      this.client.publish(oTopic, arg || '');
    });
  }

}


/*

var array = [];
var resp;
var n = 10; //number of messages to wait for
var timeOutValue = 5000; //wait 5 seconds
var timer;

const client = mqtt.connect(MQTTServer)
var count =0;
client.on('message', (topic, message) => {
  array.push(message);
  count ++
  if (count == n) {
     resp.send(array);
     client.unsubscribe('inTopic');
     resp = undefined;
     counter = 0;
     array = [];
     clearTimeout(timer)
  }
}

app.post('/test', function (request, response) {

resp = response;
client.publish ('outTopic' , 'request ');
client.subscribe('inTopic');

  timer = setTimeout(function(){
    if (resp) {
        resp.send(array);
        resp = undefined;
        client.unsubscribe('inTopic');
        counter = 0;
        array = []
    }
  }, timeOutValue);

}

*/