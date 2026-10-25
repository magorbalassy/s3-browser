import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Notifier } from './notifier';
import { SessionStore } from './session-store';
import { unauthorizedInterceptor } from './unauthorized-interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: { connected: () => boolean; clear: ReturnType<typeof vi.fn> };
  let notifier: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    session = { connected: () => true, clear: vi.fn() };
    notifier = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: SessionStore, useValue: session },
        { provide: Notifier, useValue: notifier },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  const call = () => firstValueFrom(http.get('/api/buckets')).catch((e) => e);

  it('drops the session and redirects when the server says it expired', async () => {
    const result = call();
    backend
      .expectOne('/api/buckets')
      .flush({ code: 'not_connected', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    expect((await result).status).toBe(401);
    expect(session.clear).toHaveBeenCalled();
    expect(notifier.error).toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/connect'], expect.anything());
  });

  it('leaves other errors (e.g. wrong credentials) to the caller', async () => {
    const result = call();
    backend
      .expectOne('/api/buckets')
      .flush(
        { code: 'invalid_credentials', message: 'x' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await result;
    expect(session.clear).not.toHaveBeenCalled();
  });
});
