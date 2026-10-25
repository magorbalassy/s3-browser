import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionInfo } from '../api/models';
import { SessionStore } from './session-store';

const INFO: SessionInfo = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  buckets: ['a', 'b'],
};

describe('SessionStore', () => {
  let store: SessionStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('restores an existing session once', async () => {
    const first = store.restore();
    const second = store.restore();
    http.expectOne({ method: 'GET', url: '/api/session' }).flush(INFO);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(store.connected()).toBe(true);
    expect(store.buckets()).toEqual(['a', 'b']);
    expect(store.endpointLabel()).toBe('http://minio:9000');
    // Already known: no further request.
    expect(await store.restore()).toBe(true);
  });

  it('is disconnected when the server has no session', async () => {
    const restored = store.restore();
    http
      .expectOne('/api/session')
      .flush({ code: 'not_connected', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    expect(await restored).toBe(false);
    expect(store.status()).toBe('disconnected');
  });

  it('connects and disconnects', async () => {
    const connecting = store.connect({
      endpoint: '',
      access_key: 'k',
      secret_key: 's',
      region: 'us-east-1',
    });
    const req = http.expectOne({ method: 'POST', url: '/api/session' });
    expect(req.request.body).toEqual({
      endpoint: '',
      access_key: 'k',
      secret_key: 's',
      region: 'us-east-1',
    });
    req.flush({ ...INFO, endpoint: '' });
    await connecting;
    expect(store.endpointLabel()).toBe('AWS S3');

    const disconnecting = store.disconnect();
    http
      .expectOne({ method: 'DELETE', url: '/api/session' })
      .flush(null, { status: 204, statusText: '' });
    await disconnecting;
    expect(store.connected()).toBe(false);
    expect(store.buckets()).toEqual([]);
  });
});
