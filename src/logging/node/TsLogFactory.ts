import path from 'path';
import { ISettingsParam, Logger } from 'tslog';
import { LogLevel, RedStoneLogger } from '../RedStoneLogger';

export const defaultLoggerOptions: ISettingsParam = {
  displayFunctionName: false,
  displayFilePath: 'hidden',
  displayLoggerName: true,
  dateTimeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  minLevel: 'debug',
  overwriteConsole: false
};

/**
 * A wrapper around "tslog" logging library that allows to change logging settings at runtime
 * (for each registered module independently, or globally - for all loggers).
 */
export class TsLogFactory {
  private readonly registeredLoggers: { [moduleName: string]: Logger } = {};
  private readonly registeredOptions: { [moduleName: string]: ISettingsParam } = {};

  private defaultOptions: ISettingsParam = { ...defaultLoggerOptions };

  constructor() {
    this.setOptions = this.setOptions.bind(this);
    this.getOptions = this.getOptions.bind(this);
    this.create = this.create.bind(this);
    this.logLevel = this.logLevel.bind(this);
  }

  setOptions(newOptions: ISettingsParam, moduleName?: string): void {
    // if moduleName not specified
    if (!moduleName) {
      // update default options
      this.defaultOptions = newOptions;
      // update options for all already registered loggers
      Object.keys(this.registeredLoggers).forEach((key: string) => {
        this.registeredLoggers[key].setSettings({
          ...this.registeredLoggers[key].settings,
          ...newOptions
        });
      });
    } else {
      // if logger already registered
      if (this.registeredLoggers[moduleName]) {
        // update its options
        this.registeredLoggers[moduleName].setSettings({
          ...this.registeredLoggers[moduleName].settings,
          ...newOptions
        });
      } else {
        // if logger not yet registered - save options that will be used for its creation
        this.registeredOptions[moduleName] = {
          ...this.defaultOptions,
          ...newOptions
        };
      }
    }
  }

  getOptions(moduleName?: string): ISettingsParam {
    if (!moduleName) {
      return this.defaultOptions;
    } else {
      if (this.registeredLoggers[moduleName]) {
        return this.registeredLoggers[moduleName].settings;
      } else if (this.registeredOptions[moduleName]) {
        return this.registeredOptions[moduleName];
      } else {
        return this.defaultOptions;
      }
    }
  }

  logLevel(level: LogLevel, moduleName?: string) {
    this.setOptions({ minLevel: level }, moduleName);
  }

  create(moduleName = 'SWC'): RedStoneLogger {
    // in case of passing '__dirname' as moduleName - leaves only the file name without extension.
    const normalizedModuleName = path.basename(moduleName, path.extname(moduleName));
    if (!this.registeredLoggers[normalizedModuleName]) {
      const logger = new Logger({
        ...this.getOptions(normalizedModuleName),
        name: normalizedModuleName
      });
      this.registeredLoggers[normalizedModuleName] = logger;
    }
    return this.registeredLoggers[normalizedModuleName] as RedStoneLogger;
  }
}
