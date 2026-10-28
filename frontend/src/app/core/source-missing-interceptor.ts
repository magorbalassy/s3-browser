import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Notifier } from './notifier';
import { SourcesStore } from './sources-store';

/**
 * When a source disappears (e.g. deleted in another tab), refresh the list and go to the
 * sources page instead of showing errors everywhere.
 */
export const sourceMissingInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(SourcesStore);
  const router = inject(Router);
  const notifier = inject(Notifier);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.error?.code === 'source_not_found') {
        notifier.error(error.error.message ?? 'This source no longer exists.');
        store.load(true).catch(() => undefined);
        router.navigate(['/sources']);
      }
      return throwError(() => error);
    }),
  );
};
