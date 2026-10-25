import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Notifier } from './notifier';
import { SessionStore } from './session-store';

/**
 * When the server says the session is gone (idle timeout, server restart), send the user
 * back to the connect page instead of showing errors everywhere.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const notifier = inject(Notifier);

  return next(req).pipe(
    catchError((error: unknown) => {
      const expired =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        error.error?.code === 'not_connected';
      if (expired && session.connected()) {
        session.clear();
        notifier.error('Your session has expired. Please connect again.');
        router.navigate(['/connect'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
