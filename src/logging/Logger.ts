export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export interface Logger {
  profile(id: any);

  error(message?: any, ...optionalParams: any[]);

  warn(message?: any, ...optionalParams: any[]);

  info(message?: any, ...optionalParams: any[]);

  verbose(message?: any, ...optionalParams: any[]);

  debug(message?: any, ...optionalParams: any[]);

  silly(message?: any, ...optionalParams: any[]);

  log(message?: any, ...optionalParams: any[]);
}
