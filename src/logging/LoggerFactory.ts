import path from 'path';
import { ISettingsParam, Logger, TLogLevelName } from 'tslog';

export const defaultLoggerOptions: ISettingsParam = {
  displayFunctionName: false,
  displayFilePath: 'hideNodeModulesOnly',
  displayLoggerName: false,
  dateTimeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

export type LoggerWithProfile = Logger & {
  profile: (id: string) => void;
};

/**
 * A wrapper around "Winston" logging library that allows to change logging settings at runtime
 * (for each registered module independently, or globally - for all loggers).
 */
export class LoggerFactory {
  static readonly INST: LoggerFactory = new LoggerFactory();

  private readonly registeredLoggers: { [moduleName: string]: LoggerWithProfile } = {};
  private readonly registeredOptions: { [moduleName: string]: ISettingsParam } = {};

  private defaultOptions: ISettingsParam = { ...defaultLoggerOptions };

  private constructor() {
    // noop
  }

  setOptions(newOptions: ISettingsParam, moduleName?: string): void {
    // if moduleName not specified
    if (!moduleName) {
      // update default options
      LoggerFactory.INST.defaultOptions = newOptions;
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

  logLevel(level: TLogLevelName, moduleName?: string) {
    this.setOptions({ minLevel: level }, moduleName);
  }

  create(moduleName = 'SWC'): LoggerWithProfile {
    // in case of passing '__dirname' as moduleName - leaves only the file name without extension.
    const normalizedModuleName = path.basename(moduleName, path.extname(moduleName));
    if (!this.registeredLoggers[normalizedModuleName]) {
      const logger = new Logger({
        ...this.getOptions(normalizedModuleName),
        name: normalizedModuleName
      });
      (logger as LoggerWithProfile).profile = () => {
        // noop
      };
      this.registeredLoggers[normalizedModuleName] = logger as LoggerWithProfile;
    }
    return this.registeredLoggers[normalizedModuleName];
  }
}
