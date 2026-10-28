import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Notifier } from './notifier';
import { sourceMissingInterceptor } from './source-missing-interceptor';
import { SourcesStore } from './sources-store';

describe('sourceMissingInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: { load: ReturnType<typeof vi.fn> };
  let notifier: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    store = { load: vi.fn().mockResolvedValue(undefined) };
    notifier = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sourceMissingInterceptor])),
        provideHttpClientTesting(),
        { provide: SourcesStore, useValue: store },
        { provide: Notifier, useValue: notifier },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  const call = () => firstValueFrom(http.get('/api/sources/gone/buckets')).catch((e) => e);

  it('refreshes the list and goes to /sources when a source disappeared', async () => {
    const result = call();
    backend
      .expectOne('/api/sources/gone/buckets')
      .flush(
        { code: 'source_not_found', message: "Source 'gone' does not exist." },
        { status: 404, statusText: 'Not Found' },
      );
    expect((await result).status).toBe(404);
    expect(notifier.error).toHaveBeenCalledWith("Source 'gone' does not exist.");
    expect(store.load).toHaveBeenCalledWith(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/sources']);
  });

  it('leaves other errors to the caller', async () => {
    const result = call();
    backend
      .expectOne('/api/sources/gone/buckets')
      .flush({ code: 'bucket_not_found', message: 'x' }, { status: 404, statusText: 'Not Found' });
    await result;
    expect(store.load).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
});
