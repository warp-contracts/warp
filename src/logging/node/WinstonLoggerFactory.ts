import winston, { createLogger, format, LogEntry, LoggerOptions, transports } from 'winston';
import path from 'path';
import { Logger, LogLevel } from '@smartweave';

const { combine, errors, timestamp, colorize, printf } = format;
/**
 * A wrapper around "Winston" logging library that allows to change logging settings at runtime
 * (for each registered module independently, or globally - for all loggers).
 */
export class WinstonLoggerFactory {
  public readonly baseFormat = combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    format.splat(),
    format((info) => {
      info.level = info.level.toUpperCase();
      return info;
    })()
  );

  public readonly prettyFormat = combine(
    this.baseFormat,
    colorize({ all: false }),
    printf(({ timestamp, level, message, ...rest }) => {
      let result = `[${timestamp}] [${rest.module || 'SWC'}] ${level}: ${message}`;
      if (rest?.durationMs) {
        result += ` - ${rest.durationMs}ms`;
      }
      return result;
    })
  );

  private readonly registeredLoggers: { [moduleName: string]: Logger } = {};
  private readonly registeredOptions: { [moduleName: string]: LoggerOptions } = {};

  private defaultOptions: LoggerOptions = {
    level: 'debug',
    format: this.prettyFormat,
    transports: [new transports.Console()],
    exitOnError: false
  };

  public constructor() {
    winston.addColors({
      error: 'bold redBG',
      warn: 'bold magenta',
      info: 'bold green',
      http: 'bold magentaBG',
      verbose: 'bold cyan',
      debug: 'bold blue',
      silly: 'grey'
    });

    this.setOptions = this.setOptions.bind(this);
    this.getOptions = this.getOptions.bind(this);
    this.create = this.create.bind(this);
    this.logLevel = this.logLevel.bind(this);
  }

  setOptions(newOptions: LoggerOptions, moduleName?: string): void {
    // if moduleName not specified
    if (!moduleName) {
      // update default options
      this.defaultOptions = newOptions;
      // update options for all already registered loggers
      Object.keys(this.registeredLoggers).forEach((key: string) => {
        Object.assign(this.registeredLoggers[key], newOptions);
      });
    } else {
      // if logger already registered
      if (this.registeredLoggers[moduleName]) {
        // update its options
        Object.assign(this.registeredLoggers[moduleName], newOptions);
      } else {
        // if logger not yet registered - save options that will be used for its creation
        this.registeredOptions[moduleName] = {
          ...this.defaultOptions,
          ...newOptions
        };
      }
    }
  }

  getOptions(moduleName?: string): LoggerOptions {
    if (!moduleName) {
      return this.defaultOptions;
    } else {
      if (this.registeredLoggers[moduleName]) {
        // safe typecast in this case...
        return this.registeredLoggers[moduleName] as LoggerOptions;
      } else if (this.registeredOptions[moduleName]) {
        return this.registeredOptions[moduleName];
      } else {
        return this.defaultOptions;
      }
    }
  }

  logLevel(level: LogLevel, moduleName?: string) {
    this.setOptions({ level }, moduleName);
  }

  create(moduleName = 'SWC'): Logger {
    // in case of passing '__dirname' as moduleName - leaves only the file name without extension.
    const normalizedModuleName = path.basename(moduleName, path.extname(moduleName));
    if (!this.registeredLoggers[normalizedModuleName]) {
      const logger = createLogger({
        ...this.getOptions(normalizedModuleName),
        // note: profiler this not currently honor defaultMeta - https://github.com/winstonjs/winston/pull/1935
        defaultMeta: { module: normalizedModuleName }
      });
      // note: winston by default logs profile message with info level (to high IMO),
      // with no option to set different default - so we're forcing level by
      // overwriting default function...
      const originalProfile = logger.profile.bind(logger);
      logger.profile = (id: string | number, meta?: LogEntry) => {
        return originalProfile(id, meta || { message: '', level: 'debug' });
      };
      this.registeredLoggers[normalizedModuleName] = logger;
    }

    return this.registeredLoggers[normalizedModuleName];
  }
}
