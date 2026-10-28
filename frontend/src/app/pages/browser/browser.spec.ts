import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ObjectPage } from '../../api/models';
import { Browser } from './browser';

/** Let the resource start its request (whenStable() would wait for the response). */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const file = (key: string, size: number) => ({
  key,
  name: key.split('/').pop()!,
  size,
  last_modified: '2025-01-01T00:00:00Z',
});

describe('Browser', () => {
  let fixture: ComponentFixture<Browser>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const names = () =>
    [...el().querySelectorAll('td.name-cell .name span')].map((n) => n.textContent?.trim());

  async function open(path: string, page: ObjectPage): Promise<void> {
    fixture.componentRef.setInput('source', 'lab');
    fixture.componentRef.setInput('bucket', 'photos');
    fixture.componentRef.setInput('path', path);
    fixture.detectChanges();
    await settle();
    const req = http.expectOne((r) => r.url === '/api/sources/lab/buckets/photos/objects');
    expect(req.request.params.get('prefix')).toBe(page.prefix);
    req.flush(page);
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Browser],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Browser);
  });

  afterEach(() => http.verify());

  it('lists folders first, then files, with readable sizes', async () => {
    await open('2024', {
      bucket: 'photos',
      prefix: '2024/',
      folders: [{ prefix: '2024/jan/', name: 'jan' }],
      files: [file('2024/b.jpg', 2048), file('2024/a.jpg', 10)],
      next_token: null,
    });
    expect(names()).toEqual(['jan', 'a.jpg', 'b.jpg']);
    expect(el().querySelector('.summary')?.textContent).toContain('1 folder, 2 files');
    expect(el().textContent).toContain('2.00 KiB');
    const folderLink = el().querySelector('td.name-cell a') as HTMLAnchorElement;
    expect(folderLink.getAttribute('href')).toBe('/s/lab/photos/2024/jan');
    const download = el().querySelector('a[download]') as HTMLAnchorElement;
    expect(download.getAttribute('href')).toBe(
      '/api/sources/lab/buckets/photos/download?key=2024%2Fa.jpg',
    );
    expect(el().querySelector('.load-more')).toBeNull();
  });

  it('loads further pages on demand', async () => {
    await open('', {
      bucket: 'photos',
      prefix: '',
      folders: [],
      files: [file('a.txt', 1)],
      next_token: 'next-1',
    });
    const button = el().querySelector('.load-more button') as HTMLButtonElement;
    button.click();
    const req = http.expectOne((r) => r.params.get('token') === 'next-1');
    req.flush({
      bucket: 'photos',
      prefix: '',
      folders: [],
      files: [file('b.txt', 1)],
      next_token: null,
    });
    await fixture.whenStable();
    expect(names()).toEqual(['a.txt', 'b.txt']);
    expect(el().querySelector('.load-more')).toBeNull();
  });

  it('shows the server error message', async () => {
    fixture.componentRef.setInput('source', 'lab');
    fixture.componentRef.setInput('bucket', 'photos');
    fixture.detectChanges();
    await settle();
    http
      .expectOne((r) => r.url === '/api/sources/lab/buckets/photos/objects')
      .flush(
        { code: 'bucket_not_found', message: 'Bucket not found.' },
        { status: 404, statusText: 'Not Found' },
      );
    await fixture.whenStable();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Bucket not found.');
  });
});
