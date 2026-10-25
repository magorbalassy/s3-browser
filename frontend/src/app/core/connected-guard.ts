import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session-store';

/** Pages that need an S3 connection; otherwise go to /connect and come back afterwards. */
export const connectedGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  if (await inject(SessionStore).restore()) {
    return true;
  }
  return router.createUrlTree(['/connect'], { queryParams: { returnUrl: state.url } });
};

/** The connect page is skipped when a session is already active. */
export const disconnectedGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (await inject(SessionStore).restore()) ? router.createUrlTree(['/b']) : true;
};
