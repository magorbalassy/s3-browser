import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { connectedGuard, disconnectedGuard } from './core/connected-guard';

/**
 * Matches /b/<bucket>/<any/folder/path>. The folder path becomes the `path` param
 * ("" at the bucket root), so the URL mirrors the S3 prefix and deep links just work.
 */
export function bucketPathMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length < 2 || segments[0].path !== 'b') {
    return null;
  }
  const [, bucket, ...folders] = segments;
  const path = new UrlSegment(folders.map((s) => s.path).join('/'), {});
  return { consumed: segments, posParams: { bucket, path } };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'b' },
  {
    path: 'connect',
    title: 'Connect · S3 Browser',
    canActivate: [disconnectedGuard],
    loadComponent: () => import('./pages/connect/connect').then((m) => m.Connect),
  },
  {
    path: 'b',
    title: 'Buckets · S3 Browser',
    canActivate: [connectedGuard],
    loadComponent: () => import('./pages/buckets/buckets').then((m) => m.Buckets),
  },
  {
    matcher: bucketPathMatcher,
    canActivate: [connectedGuard],
    loadComponent: () => import('./pages/browser/browser').then((m) => m.Browser),
  },
  { path: '**', redirectTo: 'b' },
];
