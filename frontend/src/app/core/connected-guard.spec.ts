import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { connectedGuard, disconnectedGuard } from './connected-guard';
import { SessionStore } from './session-store';

describe('session guards', () => {
  let connected: boolean;
  const run = (guard: CanActivateFn, url = '/b/photos') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: { restore: () => Promise.resolve(connected) } },
      ],
    });
  });

  it('lets connected users through', async () => {
    connected = true;
    expect(await run(connectedGuard)).toBe(true);
  });

  it('sends disconnected users to /connect, remembering where they were going', async () => {
    connected = false;
    const result = (await run(connectedGuard, '/b/photos/2024')) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/connect?returnUrl=%2Fb%2Fphotos%2F2024',
    );
  });

  it('skips the connect page when already connected', async () => {
    connected = true;
    const result = (await run(disconnectedGuard)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/b');
    connected = false;
    expect(await run(disconnectedGuard)).toBe(true);
  });
});
