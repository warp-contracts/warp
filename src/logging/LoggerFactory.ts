import { Logger, LogLevel } from '@smartweave';
import { LoggerOptions } from 'winston';
import { ConsoleLoggerFactory } from './ConsoleLoggerFactory';
import { WinstonLoggerFactory } from './node/WinstonLoggerFactory';

export class LoggerFactory {
  static readonly INST: LoggerFactory =
    typeof window === 'undefined' ? new WinstonLoggerFactory() : new ConsoleLoggerFactory();

  setOptions(newOptions: LoggerOptions, moduleName: string): void {
    LoggerFactory.INST.setOptions(newOptions, moduleName);
  }

  getOptions(moduleName?: string): LoggerOptions {
    return LoggerFactory.INST.getOptions(moduleName);
  }

  logLevel(level: LogLevel, moduleName?: string) {
    LoggerFactory.INST.logLevel(level, moduleName);
  }

  create(moduleName?: string): Logger {
    return LoggerFactory.INST.create(moduleName);
  }
}
