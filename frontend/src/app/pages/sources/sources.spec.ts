import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Source } from '../../api/models';
import { FolderSizes } from '../../core/folder-sizes';
import { Notifier } from '../../core/notifier';
import { BucketsState, SourcesStore } from '../../core/sources-store';
import { source } from '../../testing/fixtures';
import { Sources } from './sources';

describe('Sources', () => {
  let fixture: ComponentFixture<Sources>;
  const sources = signal<Source[]>([]);
  const states: Record<string, BucketsState> = {};
  const store = {
    sources,
    loaded: signal(true),
    load: vi.fn().mockResolvedValue(undefined),
    bucketsOf: (id: string) => () => states[id],
    loadBuckets: vi.fn(),
    remove: vi.fn(),
  };
  const sizes = { clear: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';

  beforeEach(async () => {
    sources.set([
      source('lab', 'Lab MinIO', { endpoint: 'http://minio:9000' }),
      source('prod', 'Prod', { endpoint: 'https://s3.corp', ca_cert: 'PEM' }),
    ]);
    states['lab'] = { loading: false, buckets: ['a', 'b'] };
    states['prod'] = {
      loading: false,
      buckets: [],
      error: { status: 502, code: 'tls_error', message: 'TLS certificate verification failed' },
    };
    store.loadBuckets.mockClear();
    store.remove.mockReset().mockImplementation(async (id: string) => {
      sources.update((list) => list.filter((s) => s.id !== id));
    });
    TestBed.configureTestingModule({
      imports: [Sources],
      providers: [
        provideRouter([]),
        { provide: SourcesStore, useValue: store },
        { provide: FolderSizes, useValue: sizes },
        { provide: Notifier, useValue: { info: vi.fn(), error: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(Sources);
    await fixture.whenStable();
  });

  it('lists every source with its endpoint and connection status', () => {
    expect(store.load).toHaveBeenCalledWith(true);
    expect(store.loadBuckets).toHaveBeenCalledWith('lab');
    expect(store.loadBuckets).toHaveBeenCalledWith('prod');
    expect(text()).toContain('Lab MinIO');
    expect(text()).toContain('http://minio:9000');
    expect(text()).toContain('2 buckets');
    expect(text()).toContain('TLS certificate verification failed');
    const links = [...el().querySelectorAll('a.main')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/s/lab', '/s/prod']);
  });

  it('asks for confirmation before deleting', async () => {
    const del = () => el().querySelector('[aria-label="Delete Lab MinIO"]') as HTMLButtonElement;
    del().click();
    await fixture.whenStable();
    expect(store.remove).not.toHaveBeenCalled();
    const confirm = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Delete?'),
    )!;
    confirm.click();
    await fixture.whenStable();
    expect(store.remove).toHaveBeenCalledWith('lab');
    expect(sizes.clear).toHaveBeenCalledWith('lab');
    expect(text()).not.toContain('Lab MinIO');
  });

  it('invites to add a first source', async () => {
    sources.set([]);
    await fixture.whenStable();
    expect(el().querySelector('.empty')?.textContent).toContain('No sources yet');
  });
});
