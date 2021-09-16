export interface RedStoneLogger {
  fatal(message?: string, ...optionalParams: unknown[]): void;

  error(message?: string, ...optionalParams: unknown[]): void;

  warn(message?: string, ...optionalParams: unknown[]): void;

  info(message?: string, ...optionalParams: unknown[]): void;

  debug(message?: string, ...optionalParams: unknown[]): void;

  trace(message?: string, ...optionalParams: unknown[]): void;

  silly(message?: string, ...optionalParams: unknown[]): void;
}
