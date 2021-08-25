import { RedStoneLogger } from '@smartweave';

export class ConsoleLogger implements RedStoneLogger {
  trace(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  error(message?: any, ...optionalParams: any[]) {
    console.error(message, optionalParams);
  }

  info(message?: any, ...optionalParams: any[]) {
    console.info(message, optionalParams);
  }

  silly(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  debug(message?: any, ...optionalParams: any[]) {
    console.debug(message, optionalParams);
  }

  warn(message?: any, ...optionalParams: any[]) {
    console.warn(message, optionalParams);
  }

  log(message?: any, ...optionalParams: any[]) {
    console.info(message, optionalParams);
  }

  fatal(message?: any, ...optionalParams: any[]) {
    console.error(message, optionalParams);
  }
}
