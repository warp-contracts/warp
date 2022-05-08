export class CustomError<T> extends Error {
  constructor(public kind: T, message?: string, public originalError?: unknown) {
    super(`${kind}${message ? `: ${message}` : ''}`);
    this.name = 'CustomError';
    Error.captureStackTrace(this, CustomError);
  }
}
