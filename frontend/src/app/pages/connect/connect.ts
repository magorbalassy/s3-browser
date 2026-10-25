import { Component, inject, input, signal } from '@angular/core';
import { form, FormField, pattern, required, submit } from '@angular/forms/signals';
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
  remember: boolean;
}

/** Saved between visits: everything except the secret key. */
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
    remember: true,
    ...readRemembered(),
  });

  protected readonly connectForm = form(this.model, (s) => {
    pattern(s.endpoint, /^(https?:\/\/\S+)?$/, {
      message: 'Must start with http:// or https:// (or leave empty for AWS S3)',
    });
    required(s.accessKey, { message: 'Access key is required' });
    required(s.secretKey, { message: 'Secret key is required' });
    required(s.region, { message: 'Region is required' });
  });

  protected readonly connecting = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);
  protected readonly showSecret = signal(false);

  protected onSubmit(): void {
    submit(this.connectForm, async () => {
      const value = this.model();
      this.connecting.set(true);
      this.error.set(undefined);
      try {
        const info = await this.session.connect({
          endpoint: value.endpoint.trim(),
          access_key: value.accessKey.trim(),
          secret_key: value.secretKey,
          region: value.region.trim(),
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
}

function readRemembered(): Partial<ConnectModel> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Remembered | null;
    if (saved && typeof saved === 'object') {
      return {
        endpoint: String(saved.endpoint ?? ''),
        accessKey: String(saved.accessKey ?? ''),
        region: String(saved.region || 'us-east-1'),
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
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: nothing to remember.
  }
}
