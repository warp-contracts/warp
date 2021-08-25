import { Logger } from '@smartweave';

export class ConsoleLogger implements Logger {
  debug(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  error(message?: any, ...optionalParams: any[]) {
    console.error(message, optionalParams);
  }

  info(message?: any, ...optionalParams: any[]) {
    console.info(message, optionalParams);
  }

  profile(id: any) {
    console.warn('Profile not implemented for this logger!');
  }

  silly(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  verbose(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  warn(message?: any, ...optionalParams: any[]) {
    console.warn(message, optionalParams);
  }

  log(message?: any, ...optionalParams: any[]) {
    console.info(message, optionalParams);
  }
}
