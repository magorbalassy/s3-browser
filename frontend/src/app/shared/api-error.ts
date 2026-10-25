import { HttpErrorResponse } from '@angular/common/http';

/** An error from the backend, which always replies with `{code, message}`. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && body.code && body.message) {
      return { status: error.status, code: body.code, message: body.message };
    }
    if (error.status === 0) {
      return { status: 0, code: 'network_error', message: 'Cannot reach the S3 Browser server.' };
    }
    return { status: error.status, code: 'http_error', message: error.message };
  }
  return {
    status: 0,
    code: 'unknown',
    message: error instanceof Error ? error.message : 'Unexpected error.',
  };
}
