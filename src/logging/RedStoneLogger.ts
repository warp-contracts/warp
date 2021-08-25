export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silly';

export interface RedStoneLogger {
  fatal(message?: any, ...optionalParams: any[]);

  error(message?: any, ...optionalParams: any[]);

  warn(message?: any, ...optionalParams: any[]);

  info(message?: any, ...optionalParams: any[]);

  debug(message?: any, ...optionalParams: any[]);

  trace(message?: any, ...optionalParams: any[]);

  silly(message?: any, ...optionalParams: any[]);
}
