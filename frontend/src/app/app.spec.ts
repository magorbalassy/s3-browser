import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlSegment } from '@angular/router';
import { App } from './app';
import { bucketPathMatcher } from './app.routes';

const segments = (...paths: string[]) => paths.map((p) => new UrlSegment(p, {}));

describe('App', () => {
  it('renders the top bar and the router outlet', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-top-bar')?.textContent).toContain('S3 Browser');
    expect(el.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('bucketPathMatcher', () => {
  it('ignores URLs outside /b/<bucket>', () => {
    expect(bucketPathMatcher(segments('b'))).toBeNull();
    expect(bucketPathMatcher(segments('connect', 'x'))).toBeNull();
  });

  it('matches the bucket root with an empty path', () => {
    const result = bucketPathMatcher(segments('b', 'photos'))!;
    expect(result.posParams!['bucket'].path).toBe('photos');
    expect(result.posParams!['path'].path).toBe('');
  });

  it('joins nested folders into the path param', () => {
    const result = bucketPathMatcher(segments('b', 'photos', '2024', 'jan'))!;
    expect(result.consumed.length).toBe(4);
    expect(result.posParams!['path'].path).toBe('2024/jan');
  });
});
