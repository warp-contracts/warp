/**
 * A helper type to avoid having to type `{ type: "..." }` for every error detail types.
 */
export type Err<T extends string> = { type: T };

/**
 * The custom error type that every error originating from the library should extend.
 */
export class CustomError<T extends { type: string }> extends Error {
  constructor(public detail: T, message?: string, public originalError?: unknown) {
    super(`${detail.type}${message ? `: ${message}` : ''}`);
    this.name = 'CustomError';
    Error.captureStackTrace(this, CustomError);
  }
}
