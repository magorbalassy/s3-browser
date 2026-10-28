import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SourceIn } from '../api/models';
import { source } from '../testing/fixtures';
import { SourcesStore } from './sources-store';

const BODY: SourceIn = { name: 'B', access_key: 'k', secret_key: 's' };

describe('SourcesStore', () => {
  let store: SourcesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SourcesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the list once', async () => {
    const first = store.load();
    const second = store.load();
    http.expectOne({ method: 'GET', url: '/api/sources' }).flush({ sources: [source('a')] });
    await Promise.all([first, second]);
    expect(store.loaded()).toBe(true);
    expect(store.byId('a')?.name).toBe('a');
    await store.load(); // cached: no request
    const forced = store.load(true);
    http.expectOne('/api/sources').flush({ sources: [] });
    await forced;
    expect(store.sources()).toEqual([]);
  });

  it('creates, updates and removes, keeping the list sorted', async () => {
    const loading = store.load();
    http.expectOne('/api/sources').flush({ sources: [source('c', 'Charlie')] });
    await loading;

    const creating = store.create(BODY);
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/sources');
    expect(req.request.params.get('test')).toBe('true');
    expect(req.request.body).toEqual(BODY);
    req.flush(source('b', 'bravo'));
    await creating;
    expect(store.sources().map((s) => s.id)).toEqual(['b', 'c']);

    const updating = store.update('b', BODY, false);
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/sources/b');
    expect(put.request.params.get('test')).toBe('false');
    put.flush(source('b', 'Zulu'));
    await updating;
    expect(store.sources().map((s) => s.name)).toEqual(['Charlie', 'Zulu']);

    const removing = store.remove('c');
    http.expectOne({ method: 'DELETE', url: '/api/sources/c' }).flush(null);
    await removing;
    expect(store.sources().map((s) => s.id)).toEqual(['b']);
  });

  it('tests settings, optionally reusing a stored secret', async () => {
    const testing = store.test(BODY, 'b');
    const req = http.expectOne((r) => r.url === '/api/sources/test');
    expect(req.request.params.get('source_id')).toBe('b');
    req.flush({ ok: true, buckets: ['x'] });
    expect((await testing).ok).toBe(true);
  });

  it('loads buckets per source and remembers errors', async () => {
    const state = store.bucketsOf('a');
    const loading = store.loadBuckets('a');
    expect(state()?.loading).toBe(true);
    store.loadBuckets('a'); // already loading: no second request
    http.expectOne('/api/sources/a/buckets').flush({ buckets: ['photos'] });
    await loading;
    expect(state()).toEqual({ loading: false, buckets: ['photos'] });
    await store.loadBuckets('a'); // loaded: cached

    const failing = store.loadBuckets('b');
    http
      .expectOne('/api/sources/b/buckets')
      .flush(
        { code: 'endpoint_unreachable', message: 'Could not connect.' },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await failing;
    expect(store.bucketsOf('b')()?.error?.message).toBe('Could not connect.');
    // An error is retried on the next call.
    const retry = store.loadBuckets('b');
    http.expectOne('/api/sources/b/buckets').flush({ buckets: [] });
    await retry;
    expect(store.bucketsOf('b')()?.error).toBeUndefined();
  });
});
