import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BucketsState, SourcesStore } from '../../core/sources-store';
import { source } from '../../testing/fixtures';
import { Buckets } from './buckets';

describe('Buckets', () => {
  let fixture: ComponentFixture<Buckets>;
  const state = signal<BucketsState | undefined>(undefined);
  const store = {
    sources: signal([source('lab', 'Lab MinIO')]),
    bucketsOf: () => state,
    loadBuckets: vi.fn(),
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const listed = () =>
    [...el().querySelectorAll('a[mat-list-item] [matListItemTitle]')].map((a) =>
      a.textContent?.trim(),
    );

  beforeEach(async () => {
    state.set({ loading: false, buckets: ['app-logs', 'backups', 'photos'] });
    store.loadBuckets.mockClear();
    TestBed.configureTestingModule({
      imports: [Buckets],
      providers: [provideRouter([]), { provide: SourcesStore, useValue: store }],
    });
    fixture = TestBed.createComponent(Buckets);
    fixture.componentRef.setInput('source', 'lab');
    await fixture.whenStable();
  });

  it('loads and links the buckets of the source', () => {
    expect(store.loadBuckets).toHaveBeenCalledWith('lab');
    expect(el().querySelector('h1')?.textContent).toBe('Lab MinIO');
    expect(listed()).toEqual(['app-logs', 'backups', 'photos']);
    expect(el().querySelector('a[mat-list-item]')?.getAttribute('href')).toBe('/s/lab/app-logs');
  });

  it('filters by name', async () => {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = 'BACK';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(listed()).toEqual(['backups']);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el().querySelector('.empty')?.textContent).toContain('No bucket matches');
  });

  it('shows connection errors with a way to fix the source', async () => {
    state.set({
      loading: false,
      buckets: [],
      error: { status: 502, code: 'endpoint_unreachable', message: 'Could not connect.' },
    });
    await fixture.whenStable();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Could not connect.');
    const edit = [...el().querySelectorAll('[role=alert] a')].map((a) => a.getAttribute('href'));
    expect(edit).toContain('/sources/lab');
  });
});
