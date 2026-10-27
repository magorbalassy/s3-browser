import { Component, computed, inject, input, signal } from '@angular/core';
import {
  applyWhen,
  disabled,
  form,
  FormField,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { SessionStore } from '../../core/session-store';
import { ApiError, toApiError } from '../../shared/api-error';

const STORAGE_KEY = 's3b.connection';

interface ConnectModel {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
  skipTlsVerify: boolean;
  caCert: string;
  remember: boolean;
}

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';
/** "s3.example.com:9000" means "https://s3.example.com:9000"; empty stays empty (AWS S3). */
export function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  return !value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

/** Everything except an explicit http:// endpoint uses TLS (AWS S3 included). */
const usesTls = (endpoint: string) =>
  !normalizeEndpoint(endpoint).toLowerCase().startsWith('http://');

/** Saved between visits: everything except the secret key (a CA certificate is public). */
type Remembered = Omit<ConnectModel, 'secretKey' | 'remember'>;

@Component({
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  selector: 'app-connect',
  styleUrl: './connect.scss',
  templateUrl: './connect.html',
})
export class Connect {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Where to go after connecting (set by the guard). */
  readonly returnUrl = input<string>('');

  protected readonly model = signal<ConnectModel>({
    endpoint: '',
    accessKey: '',
    secretKey: '',
    region: 'us-east-1',
    skipTlsVerify: false,
    caCert: '',
    remember: true,
    ...readRemembered(),
  });

  protected readonly connectForm = form(this.model, (s) => {
    pattern(s.endpoint, /^\S*$/, { message: 'The endpoint cannot contain spaces' });
    validate(s.endpoint, ({ value }) =>
      /^https?:\/\/.+/i.test(normalizeEndpoint(value()))
        ? undefined
        : value().trim()
          ? { kind: 'scheme', message: 'Only http:// and https:// endpoints are supported' }
          : undefined,
    );
    required(s.accessKey, { message: 'Access key is required' });
    required(s.secretKey, { message: 'Secret key is required' });
    required(s.region, { message: 'Region is required' });
    // TLS options don't apply to http://, and a custom CA is moot when nothing is verified.
    disabled(s.skipTlsVerify, ({ valueOf }) => !usesTls(valueOf(s.endpoint)));
    disabled(s.caCert, ({ valueOf }) => valueOf(s.skipTlsVerify) || !usesTls(valueOf(s.endpoint)));
    applyWhen(
      s.caCert,
      ({ valueOf }) => usesTls(valueOf(s.endpoint)) && !valueOf(s.skipTlsVerify),
      (ca) =>
        validate(ca, ({ value }) =>
          value().trim() && !value().includes(PEM_HEADER)
            ? { kind: 'pem', message: `Paste a PEM certificate starting with ${PEM_HEADER}` }
            : undefined,
        ),
    );
  });

  /** False for plain http:// endpoints, where the TLS options don't apply. */
  protected readonly tls = computed(() => usesTls(this.model().endpoint));

  protected readonly connecting = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);
  protected readonly showSecret = signal(false);

  protected onSubmit(): void {
    submit(this.connectForm, async () => {
      const value = this.model();
      this.connecting.set(true);
      this.error.set(undefined);
      try {
        const tls = this.tls();
        const info = await this.session.connect({
          endpoint: normalizeEndpoint(value.endpoint),
          access_key: value.accessKey.trim(),
          secret_key: value.secretKey,
          region: value.region.trim(),
          verify_tls: !(tls && value.skipTlsVerify),
          ca_cert: tls && !value.skipTlsVerify ? value.caCert.trim() : '',
        });
        remember(value);
        const target =
          this.returnUrl() || (info.buckets.length === 1 ? `/b/${info.buckets[0]}` : '/b');
        await this.router.navigateByUrl(target);
      } catch (error) {
        this.error.set(toApiError(error));
      } finally {
        this.connecting.set(false);
      }
    });
  }

  protected async loadCaFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) {
      return;
    }
    const text = await file.text();
    this.model.update((m) => ({ ...m, caCert: text.trim() }));
  }
}

function readRemembered(): Partial<ConnectModel> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Remembered | null;
    if (saved && typeof saved === 'object') {
      return {
        endpoint: String(saved.endpoint ?? ''),
        accessKey: String(saved.accessKey ?? ''),
        region: String(saved.region || 'us-east-1'),
        skipTlsVerify: saved.skipTlsVerify === true,
        caCert: String(saved.caCert ?? ''),
      };
    }
  } catch {
    // Ignore unreadable storage.
  }
  return {};
}

function remember(value: ConnectModel): void {
  try {
    if (value.remember) {
      const saved: Remembered = {
        endpoint: value.endpoint,
        accessKey: value.accessKey,
        region: value.region,
        skipTlsVerify: value.skipTlsVerify,
        caCert: value.caCert,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: nothing to remember.
  }
}
