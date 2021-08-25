import { Logger, LogLevel } from '@smartweave';
import { LoggerOptions } from 'winston';
import { ConsoleLogger } from './web/ConsoleLogger';

export class ConsoleLoggerFactory {
  constructor() {
    this.setOptions = this.setOptions.bind(this);
    this.getOptions = this.getOptions.bind(this);
    this.create = this.create.bind(this);
    this.logLevel = this.logLevel.bind(this);
  }

  setOptions(newOptions: LoggerOptions, moduleName?: string): void {
    // noop
  }

  getOptions(moduleName?: string): LoggerOptions {
    return {};
  }

  logLevel(level: LogLevel, moduleName?: string) {
    // noop
  }

  create(moduleName = 'SWC'): Logger {
    return new ConsoleLogger();
  }
}
