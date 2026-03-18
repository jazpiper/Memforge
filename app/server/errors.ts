export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function assertPresent<T>(value: T | null | undefined, message: string, details?: unknown): T {
  if (value === null || value === undefined) {
    throw new AppError(404, "NOT_FOUND", message, details);
  }

  return value;
}

