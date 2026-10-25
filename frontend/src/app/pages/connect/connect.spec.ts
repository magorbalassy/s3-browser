import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionStore } from '../../core/session-store';
import { Connect } from './connect';

describe('Connect', () => {
  let fixture: ComponentFixture<Connect>;
  let connect: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;

  function type(label: string, value: string): void {
    const input = el().querySelector(`input[autocomplete="${label}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    connect = vi.fn();
    TestBed.configureTestingModule({
      imports: [Connect],
      providers: [provideRouter([]), { provide: SessionStore, useValue: { connect } }],
    });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Connect);
    await fixture.whenStable();
  });

  it('does not submit without credentials', async () => {
    await submit();
    expect(connect).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Access key is required');
  });

  it('connects, remembers the non-secret fields and opens the only bucket', async () => {
    connect.mockResolvedValue({ endpoint: '', region: 'us-east-1', buckets: ['photos'] });
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(connect).toHaveBeenCalledWith({
      endpoint: '',
      access_key: 'AKIA',
      secret_key: 'secret',
      region: 'us-east-1',
    });
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/b/photos');
    const saved = localStorage.getItem('s3b.connection')!;
    expect(JSON.parse(saved)).toEqual({ endpoint: '', accessKey: 'AKIA', region: 'us-east-1' });
    expect(saved).not.toContain('secret');
  });

  it('shows the server error', async () => {
    connect.mockRejectedValue(new Error('Could not connect'));
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Could not connect');
  });

  it('rejects endpoints without a scheme', async () => {
    type('url', 'minio:9000');
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(connect).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Must start with http://');
  });
});
