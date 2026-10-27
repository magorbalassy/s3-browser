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
      verify_tls: true,
      ca_cert: '',
    });
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/b/photos');
    const saved = localStorage.getItem('s3b.connection')!;
    expect(JSON.parse(saved)).toEqual({
      endpoint: '',
      accessKey: 'AKIA',
      region: 'us-east-1',
      skipTlsVerify: false,
      caCert: '',
    });
    expect(saved).not.toContain('secret');
  });

  it('shows the server error', async () => {
    connect.mockRejectedValue(new Error('Could not connect'));
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Could not connect');
  });

  it('assumes https:// when the endpoint has no scheme', async () => {
    connect.mockResolvedValue({ buckets: [] });
    type('url', 's3.corp.lan:9000');
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://s3.corp.lan:9000' }),
    );
  });

  it('rejects other URL schemes', async () => {
    type('url', 'ftp://files.lan');
    type('username', 'AKIA');
    type('current-password', 'secret');
    await submit();
    expect(connect).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Only http:// and https://');
  });

  describe('TLS options', () => {
    const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

    async function fillHttps(): Promise<void> {
      type('url', 'https://minio.lan:9000');
      type('username', 'AKIA');
      type('current-password', 'secret');
      await fixture.whenStable();
    }

    it('are always visible, and disabled only for http:// endpoints', async () => {
      const ca = () => el().querySelector('fieldset.tls textarea') as HTMLTextAreaElement;
      expect(el().querySelector('fieldset.tls')).toBeTruthy();
      expect(ca().disabled).toBe(false);
      type('url', 'http://minio.lan:9000');
      await fixture.whenStable();
      expect(ca().disabled).toBe(true);
      expect(el().querySelector('.tls-off')?.textContent).toContain('plain http://');
    });

    it('sends a custom CA certificate', async () => {
      connect.mockResolvedValue({ buckets: [] });
      await fillHttps();
      const ca = el().querySelector('textarea') as HTMLTextAreaElement;
      ca.value = PEM;
      ca.dispatchEvent(new Event('input'));
      await submit();
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({ verify_tls: true, ca_cert: PEM }),
      );
    });

    it('rejects text that is not a PEM certificate', async () => {
      await fillHttps();
      const ca = el().querySelector('textarea') as HTMLTextAreaElement;
      ca.value = 'hello';
      ca.dispatchEvent(new Event('input'));
      await submit();
      expect(connect).not.toHaveBeenCalled();
      expect(el().textContent).toContain('Paste a PEM certificate');
    });

    it('can skip verification, with a warning', async () => {
      connect.mockResolvedValue({ buckets: [] });
      await fillHttps();
      const skip = el().querySelector('fieldset.tls input[type=checkbox]') as HTMLInputElement;
      skip.click();
      await fixture.whenStable();
      expect(el().querySelector('.warning')?.textContent).toContain('identity is not checked');
      expect(el().querySelector('textarea')).toBeNull();
      await submit();
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({ verify_tls: false, ca_cert: '' }),
      );
    });

    it('loads the CA from a file', async () => {
      await fillHttps();
      const input = el().querySelector('input[type=file]') as HTMLInputElement;
      const file = new File([PEM + '\n'], 'ca.pem', { type: 'application/x-pem-file' });
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      expect((el().querySelector('textarea') as HTMLTextAreaElement).value).toBe(PEM);
    });
  });
});
