import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  name: 'ticobot-whatsapp',
  level: config.logLevel,
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss'
        }
      }
});
