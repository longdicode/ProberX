export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}
