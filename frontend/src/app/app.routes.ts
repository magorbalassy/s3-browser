import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { homeRedirect, sourceExistsGuard } from './core/source-guards';

/**
 * Matches /s/<source>/<bucket>/<any/folder/path>. The folder path becomes the `path` param
 * ("" at the bucket root), so the URL mirrors the S3 prefix and deep links just work.
 */
export function bucketPathMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length < 3 || segments[0].path !== 's') {
    return null;
  }
  const [, source, bucket, ...folders] = segments;
  const path = new UrlSegment(folders.map((s) => s.path).join('/'), {});
  return { consumed: segments, posParams: { source, bucket, path } };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  {
    path: 'sources',
    title: 'Sources · S3 Browser',
    loadComponent: () => import('./pages/sources/sources').then((m) => m.Sources),
  },
  {
    path: 'sources/new',
    title: 'Add source · S3 Browser',
    loadComponent: () => import('./pages/source-form/source-form').then((m) => m.SourceForm),
  },
  {
    path: 'sources/:id',
    title: 'Edit source · S3 Browser',
    loadComponent: () => import('./pages/source-form/source-form').then((m) => m.SourceForm),
  },
  {
    path: 's/:source',
    canActivate: [sourceExistsGuard],
    loadComponent: () => import('./pages/buckets/buckets').then((m) => m.Buckets),
  },
  {
    matcher: bucketPathMatcher,
    canActivate: [sourceExistsGuard],
    loadComponent: () => import('./pages/browser/browser').then((m) => m.Browser),
  },
  { path: '**', redirectTo: '' },
];
