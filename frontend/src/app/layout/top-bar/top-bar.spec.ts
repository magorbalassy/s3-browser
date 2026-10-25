import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FolderSizes } from '../../core/folder-sizes';
import { SessionStore } from '../../core/session-store';
import { TopBar } from './top-bar';

describe('TopBar', () => {
  let fixture: ComponentFixture<TopBar>;
  const connected = signal(false);
  const session = {
    connected,
    info: computed(() =>
      connected() ? { endpoint: '', region: 'us-east-1', buckets: [] } : undefined,
    ),
    endpointLabel: () => 'AWS S3',
    buckets: () => ['photos'],
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const sizes = { clear: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    connected.set(false);
    TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: session },
        { provide: FolderSizes, useValue: sizes },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(TopBar);
    await fixture.whenStable();
  });

  it('hides session controls until connected', async () => {
    expect(el().querySelector('[aria-label=Disconnect]')).toBeNull();
    connected.set(true);
    await fixture.whenStable();
    expect(el().textContent).toContain('AWS S3');
    expect(el().querySelector('mat-select')).toBeTruthy();
  });

  it('disconnects and clears cached sizes', async () => {
    connected.set(true);
    await fixture.whenStable();
    (el().querySelector('[aria-label=Disconnect]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(sizes.clear).toHaveBeenCalled();
    expect(session.disconnect).toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/connect']);
  });
});
