import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
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
import { Router, RouterLink } from '@angular/router';
import { SourceIn } from '../../api/models';
import { FolderSizes } from '../../core/folder-sizes';
import { SourcesStore } from '../../core/sources-store';
import { ApiError, toApiError } from '../../shared/api-error';

interface SourceModel {
  name: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  skipTlsVerify: boolean;
  caCert: string;
}

const EMPTY: SourceModel = {
  name: '',
  endpoint: '',
  region: 'us-east-1',
  accessKey: '',
  secretKey: '',
  skipTlsVerify: false,
  caCert: '',
};

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

/** Errors that mean "could not talk to S3", as opposed to invalid input. */
const CONNECTION_ERRORS = new Set([
  'endpoint_unreachable',
  'endpoint_timeout',
  'tls_error',
  'invalid_credentials',
  'access_denied',
  's3_error',
]);

/** "s3.example.com:9000" means "https://s3.example.com:9000"; empty stays empty (AWS S3). */
export function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  return !value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

/** Everything except an explicit http:// endpoint uses TLS (AWS S3 included). */
const usesTls = (endpoint: string) =>
  !normalizeEndpoint(endpoint).toLowerCase().startsWith('http://');

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; what: 'test' | 'save' }
  | { kind: 'ok'; buckets: number }
  | { kind: 'error'; error: ApiError; canForce: boolean };

/** Add (/sources/new) or edit (/sources/<id>) a source. */
@Component({
  imports: [
    FormField,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  selector: 'app-source-form',
  styleUrl: './source-form.scss',
  templateUrl: './source-form.html',
})
export class SourceForm {
  private readonly store = inject(SourcesStore);
  private readonly sizes = inject(FolderSizes);
  private readonly router = inject(Router);

  /** Route param; empty when adding a new source. */
  readonly id = input('');
  protected readonly editing = computed(() => !!this.id());
  protected readonly existing = computed(() =>
    this.store.sources().find((s) => s.id === this.id()),
  );
  protected readonly notFound = computed(
    () => this.editing() && this.store.loaded() && !this.existing(),
  );

  protected readonly model = signal<SourceModel>({ ...EMPTY });

  protected readonly sourceForm = form(this.model, (s) => {
    required(s.name, { message: 'Give the source a name' });
    pattern(s.endpoint, /^\S*$/, { message: 'The endpoint cannot contain spaces' });
    validate(s.endpoint, ({ value }) =>
      value().trim() && !/^https?:\/\/.+/i.test(normalizeEndpoint(value()))
        ? { kind: 'scheme', message: 'Only http:// and https:// endpoints are supported' }
        : undefined,
    );
    required(s.accessKey, { message: 'Access key is required' });
    // When editing, an empty secret keeps the stored one.
    required(s.secretKey, { message: 'Secret key is required', when: () => !this.editing() });
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
  protected readonly status = signal<Status>({ kind: 'idle' });
  protected readonly busy = computed(() => this.status().kind === 'busy');
  protected readonly failure = computed(() => {
    const s = this.status();
    return s.kind === 'error' ? s : undefined;
  });
  protected readonly testedBuckets = computed(() => {
    const s = this.status();
    return s.kind === 'ok' ? s.buckets : undefined;
  });
  protected readonly showSecret = signal(false);

  constructor() {
    this.store.load().catch((error) => this.fail(error, false));
    // Fill the form once the source being edited is known.
    effect(() => {
      const source = this.existing();
      if (source) {
        untracked(() =>
          this.model.set({
            name: source.name,
            endpoint: source.endpoint,
            region: source.region,
            accessKey: source.access_key,
            secretKey: '',
            skipTlsVerify: !source.verify_tls,
            caCert: source.ca_cert.trim(),
          }),
        );
      }
    });
  }

  protected onTest(): void {
    submit(this.sourceForm, async () => {
      this.status.set({ kind: 'busy', what: 'test' });
      try {
        const result = await this.store.test(this.body(), this.id() || undefined);
        this.status.set(
          result.ok
            ? { kind: 'ok', buckets: result.buckets?.length ?? 0 }
            : {
                kind: 'error',
                error: { status: 0, code: result.error!.code, message: result.error!.message },
                canForce: false,
              },
        );
      } catch (error) {
        this.fail(error, false);
      }
    });
  }

  protected onSave(force = false): void {
    submit(this.sourceForm, async () => {
      this.status.set({ kind: 'busy', what: 'save' });
      try {
        const test = !force;
        const source = this.editing()
          ? await this.store.update(this.id(), this.body(), test)
          : await this.store.create(this.body(), test);
        this.sizes.clear(source.id);
        await this.router.navigate(['/s', source.id]);
      } catch (error) {
        this.fail(error, true);
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

  private body(): SourceIn {
    const value = this.model();
    const tls = this.tls();
    return {
      name: value.name.trim(),
      endpoint: normalizeEndpoint(value.endpoint),
      region: value.region.trim(),
      access_key: value.accessKey.trim(),
      secret_key: value.secretKey ? value.secretKey : null,
      verify_tls: !(tls && value.skipTlsVerify),
      ca_cert: tls && !value.skipTlsVerify ? value.caCert.trim() : '',
    };
  }

  private fail(error: unknown, offerForce: boolean): void {
    const apiError = toApiError(error);
    this.status.set({
      kind: 'error',
      error: apiError,
      canForce: offerForce && CONNECTION_ERRORS.has(apiError.code),
    });
  }
}
