import { LoggerSettings, LogLevel, lvlToOrder, RedStoneLogger } from '@smartweave';

//ts-line
export class ConsoleLogger implements RedStoneLogger {
  constructor(private readonly moduleName: string, public settings: LoggerSettings) {}

  trace(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('trace')) {
      // note: no 'trace' for console logger
      // eslint-disable-next-line no-console
      console.debug(this.message('trace', message), optionalParams);
    }
  }

  error(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(this.message('error', message), optionalParams);
    }
  }

  info(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(this.message('info', message), optionalParams);
    }
  }

  silly(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('silly')) {
      // note: no silly level for console logger
      // eslint-disable-next-line no-console
      console.debug(this.message('silly', message), optionalParams);
    }
  }

  debug(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(this.message('debug', message), optionalParams);
    }
  }

  warn(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(this.message('warn', message), optionalParams);
    }
  }

  log(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(this.message('info', message), optionalParams);
    }
  }

  fatal(message?: string, ...optionalParams: unknown[]): void {
    if (this.shouldLog('fatal')) {
      // eslint-disable-next-line no-console
      console.error(this.message('fatal', message), optionalParams);
    }
  }

  shouldLog(logLevel: LogLevel): boolean {
    return lvlToOrder(logLevel) >= lvlToOrder(this.settings.minLevel);
  }

  setSettings(settings: LoggerSettings): void {
    this.settings = settings;
  }

  message(lvl: LogLevel, message: string): string {
    return `${new Date().toISOString()} ${lvl.toUpperCase()} [${this.moduleName}] ${message}`;
  }
}
