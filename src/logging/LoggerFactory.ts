import { LogLevel } from './LoggerSettings';
import { WarpLogger } from './WarpLogger';
import { ConsoleLoggerFactory } from './web/ConsoleLoggerFactory';

export interface ILoggerFactory {
  setOptions(newOptions: any, moduleName?: string): void;

  getOptions(moduleName?: string): any;

  logLevel(level: LogLevel, moduleName?: string): void;

  create(moduleName?: string): WarpLogger;
}

export class LoggerFactory implements ILoggerFactory {
  static INST: ILoggerFactory = new ConsoleLoggerFactory();

  private constructor() {
    // not instantiable from outside
  }

  setOptions(newOptions: any, moduleName?: string): void {
    LoggerFactory.INST.setOptions(newOptions, moduleName);
  }

  getOptions(moduleName?: string): any {
    return LoggerFactory.INST.getOptions(moduleName);
  }

  logLevel(level: LogLevel, moduleName?: string) {
    LoggerFactory.INST.logLevel(level, moduleName);
  }

  create(moduleName?: string): WarpLogger {
    return LoggerFactory.INST.create(moduleName);
  }

  static use(logger: ILoggerFactory) {
    LoggerFactory.INST = logger;
  }
}
