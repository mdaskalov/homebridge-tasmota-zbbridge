import { CharacteristicValue } from 'homebridge';

export type SplitMapping = {
  separator?: string;
  index: number;
};

export type SwapMapping = {
  from: string,
  to: CharacteristicValue
};

export type Mapping = SplitMapping | SwapMapping[]

export type TasmotaCommand = {
  cmd: string;
  res?: TasmotaResponse;
};

export type TasmotaResponse = {
  topic?: string;
  path?: string;
  update?: boolean;
  shared?: boolean;
  mapping?: Mapping;
}

export type TasmotaCharacteristicDefinition = {
  get?: TasmotaCommand;
  set?: TasmotaCommand;
  stat?: TasmotaResponse;
  props?: object
  default?: CharacteristicValue;
};

export type TasmotaDeviceDefinition = {
  [service: string] : { [characteristic: string]: TasmotaCharacteristicDefinition }
};

export type TasmotaSensorDefinition = {
  key: string;
  service: string;
  characteristic: string;
};

export const tasmotaDeviceDefinitionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  patternProperties: {
    '^[a-zA-Z0-9_-]+$': {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z0-9_-]+$': {
          type: 'object',
          properties: {
            get: { $ref: '#/definitions/tasmotaCommand' },
            set: { $ref: '#/definitions/tasmotaCommand' },
            stat: { $ref: '#/definitions/tasmotaResponse' },
            props: { type: 'object' },
            default: { $ref: '#/definitions/characteristicValue' },
          },
          additionalProperties: false,
        },
      },
    },
  },
  definitions: {
    tasmotaCommand: {
      type: 'object',
      properties: {
        cmd: { type: 'string' },
        res: { $ref: '#/definitions/tasmotaResponse' },
      },
      required: ['cmd'],
      additionalProperties: false,
    },
    tasmotaResponse: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        path: { type: 'string' },
        update: { type: 'boolean' },
        shared: { type: 'boolean' },
        mapping: {
          oneOf: [
            {
              type: 'object',
              properties: {
                separator: { type: 'string' },
                index: { type: 'integer' },
              },
              required: ['index'],
              additionalProperties: false,
            },
            {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { $ref: '#/definitions/characteristicValue' },
                },
                required: ['from', 'to'],
                additionalProperties: false,
              },
            },
          ],
        },
      },
      additionalProperties: false,
    },
    characteristicValue: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
            ],
          },
        },
        {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9_-]+$': {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
              ],
            },
          },
          additionalProperties: false,
        },
      ],
    },
  },
};
