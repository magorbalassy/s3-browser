import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Source } from '../../api/models';
import { BucketsState, SourcesStore } from '../../core/sources-store';
import { source } from '../../testing/fixtures';
import { TopBar } from './top-bar';

describe('TopBar', () => {
  let fixture: ComponentFixture<TopBar>;
  const sources = signal<Source[]>([]);
  const buckets = signal<BucketsState | undefined>(undefined);
  const store = {
    sources,
    load: vi.fn().mockResolvedValue(undefined),
    bucketsOf: () => buckets,
    loadBuckets: vi.fn(),
  };
  const el = () => fixture.nativeElement as HTMLElement;

  async function at(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sources.set([]);
    buckets.set(undefined);
    store.loadBuckets.mockClear();
    TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: SourcesStore, useValue: store },
      ],
    });
    fixture = TestBed.createComponent(TopBar);
    await fixture.whenStable();
  });

  it('shows no pickers before any source exists', () => {
    expect(el().querySelector('mat-select')).toBeNull();
    expect(el().querySelector('[aria-label=Sources]')).toBeTruthy();
  });

  it('shows the source picker, and the bucket picker inside a source', async () => {
    sources.set([source('lab', 'Lab MinIO')]);
    await at('/sources');
    expect(el().querySelectorAll('mat-select').length).toBe(1);

    buckets.set({ loading: false, buckets: ['photos'] });
    await at('/s/lab/photos');
    expect(el().querySelectorAll('mat-select').length).toBe(2);
    expect(store.loadBuckets).toHaveBeenCalledWith('lab');
    expect(el().textContent).toContain('Lab MinIO');
  });

  it('flags sources without TLS verification', async () => {
    sources.set([source('lab', 'Lab', { endpoint: 'https://x', verify_tls: false })]);
    await at('/s/lab');
    const badge = el().querySelector('.endpoint.insecure');
    expect(badge?.getAttribute('aria-label')).toContain('TLS verification is off');
  });

  it('shows a custom CA as trusted', async () => {
    sources.set([source('lab', 'Lab', { endpoint: 'https://x', ca_cert: 'PEM' })]);
    await at('/s/lab');
    expect(el().querySelector('.endpoint.insecure')).toBeNull();
    expect(el().querySelector('.endpoint')?.getAttribute('aria-label')).toContain('custom CA');
  });
});
