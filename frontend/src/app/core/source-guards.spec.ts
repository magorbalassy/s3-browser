import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { homeRedirect, sourceExistsGuard } from './source-guards';
import { SourcesStore } from './sources-store';

describe('source guards', () => {
  let ids: string[];
  const run = (guard: CanActivateFn, params: Record<string, string> = {}) =>
    TestBed.runInInjectionContext(() =>
      guard({ params } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  const url = (tree: boolean | UrlTree) => TestBed.inject(Router).serializeUrl(tree as UrlTree);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SourcesStore,
          useValue: {
            load: () => Promise.resolve(),
            sources: () => ids.map((id) => ({ id })),
            byId: (id: string) => (ids.includes(id) ? { id } : undefined),
          },
        },
      ],
    });
  });

  it('home opens the first source', async () => {
    ids = ['lab', 'prod'];
    expect(url(await run(homeRedirect))).toBe('/s/lab');
  });

  it('home asks for a first source when there are none', async () => {
    ids = [];
    expect(url(await run(homeRedirect))).toBe('/sources/new');
  });

  it('only lets known sources through', async () => {
    ids = ['lab'];
    expect(await run(sourceExistsGuard, { source: 'lab' })).toBe(true);
    expect(url(await run(sourceExistsGuard, { source: 'gone' }))).toBe('/sources');
  });
});
