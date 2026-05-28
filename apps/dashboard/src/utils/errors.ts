export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(resource: string, id?: string): AppError {
    const msg = id ? (resource + " with id '" + id + "' not found") : (resource + " not found");
    return new AppError(404, "NOT_FOUND", msg);
  }

  static forbidden(message = "Access denied"): AppError {
    return new AppError(403, "FORBIDDEN", message);
  }

  static unauthorized(message = "Invalid credentials"): AppError {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, "CONFLICT", message);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static tooMany(message = "Too many requests"): AppError {
    return new AppError(429, "TOO_MANY_REQUESTS", message);
  }
}