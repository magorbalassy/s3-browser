import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SourcesStore } from './sources-store';

/** "/" opens the first source, or the "add source" form when there are none yet. */
export const homeRedirect: CanActivateFn = async () => {
  const store = inject(SourcesStore);
  const router = inject(Router);
  await store.load();
  const first = store.sources()[0];
  return router.createUrlTree(first ? ['/s', first.id] : ['/sources', 'new']);
};

/** /s/<source>/... only for sources that exist; otherwise go to the sources page. */
export const sourceExistsGuard: CanActivateFn = async (route) => {
  const store = inject(SourcesStore);
  const router = inject(Router);
  await store.load();
  const id = route.params['source'] as string | undefined;
  return id && store.byId(id) ? true : router.createUrlTree(['/sources']);
};
