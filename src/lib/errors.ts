export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, code = 'APP_ERROR', status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Unwraps a Supabase response tuple, throwing a typed AppError if an error occurred
 */
export function unwrap<T>(result: { data: T | null; error: { message: string; code?: string; details?: unknown } | null }): T {
  if (result.error) {
    throw new AppError(result.error.message, result.error.code || 'DB_ERROR', 500, result.error.details);
  }
  if (result.data === null || result.data === undefined) {
    throw new AppError('Expected data was not returned', 'NOT_FOUND', 404);
  }
  return result.data;
}
