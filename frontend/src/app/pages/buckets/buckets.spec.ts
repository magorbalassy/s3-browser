import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionStore } from '../../core/session-store';
import { Buckets } from './buckets';

describe('Buckets', () => {
  let fixture: ComponentFixture<Buckets>;
  const buckets = signal(['app-logs', 'backups', 'photos']);
  const el = () => fixture.nativeElement as HTMLElement;
  const listed = () =>
    [...el().querySelectorAll('a[mat-list-item]')].map((a) => a.textContent?.trim());

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Buckets],
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { buckets, endpointLabel: () => 'AWS S3', refresh: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(Buckets);
    await fixture.whenStable();
  });

  it('links every bucket', () => {
    expect(
      listed().map((t) => t?.replace('chevron_right', '').replace('deployed_code', '').trim()),
    ).toEqual(['app-logs', 'backups', 'photos']);
    expect(el().querySelector('a[mat-list-item]')?.getAttribute('href')).toBe('/b/app-logs');
  });

  it('filters by name', async () => {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = 'BACK';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(listed().length).toBe(1);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el().querySelector('.empty')?.textContent).toContain('No bucket matches');
  });
});
