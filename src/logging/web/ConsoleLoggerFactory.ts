import { RedStoneLogger, LogLevel } from '@smartweave';
import { ConsoleLogger } from './ConsoleLogger';
import { ISettingsParam } from 'tslog';

export class ConsoleLoggerFactory {
  constructor() {
    this.setOptions = this.setOptions.bind(this);
    this.getOptions = this.getOptions.bind(this);
    this.create = this.create.bind(this);
    this.logLevel = this.logLevel.bind(this);
  }

  setOptions(newOptions: ISettingsParam, moduleName?: string): void {
    // noop
  }

  getOptions(moduleName?: string): ISettingsParam {
    return {};
  }

  logLevel(level: LogLevel, moduleName?: string) {
    // noop
  }

  create(moduleName = 'SWC'): RedStoneLogger {
    return new ConsoleLogger();
  }
}
