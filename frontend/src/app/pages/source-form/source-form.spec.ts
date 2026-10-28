import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Source } from '../../api/models';
import { FolderSizes } from '../../core/folder-sizes';
import { SourcesStore } from '../../core/sources-store';
import { source } from '../../testing/fixtures';
import { normalizeEndpoint, SourceForm } from './source-form';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('normalizeEndpoint', () => {
  it('assumes https:// when no scheme is given', () => {
    expect(normalizeEndpoint(' s3.corp:9000 ')).toBe('https://s3.corp:9000');
    expect(normalizeEndpoint('http://minio:9000')).toBe('http://minio:9000');
    expect(normalizeEndpoint('')).toBe('');
  });
});

describe('SourceForm', () => {
  let fixture: ComponentFixture<SourceForm>;
  const sources = signal<Source[]>([]);
  const store = {
    sources,
    loaded: signal(true),
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    test: vi.fn(),
  };
  const sizes = { clear: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';

  function type(placeholderOrSelector: string, value: string): void {
    const input = el().querySelector(placeholderOrSelector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function fillRequired(): void {
    type('input[placeholder="e.g. Production MinIO"]', 'Prod');
    type('input[placeholder="https://s3.example.com:9000"]', 's3.corp:9000');
    type('input[autocomplete=off]:not([placeholder])', 'AKIA'); // access key
    type('input[autocomplete=new-password]', 'secret');
  }

  async function click(label: string): Promise<void> {
    const button = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    )!;
    button.click();
    await fixture.whenStable();
  }

  async function create(id = ''): Promise<void> {
    fixture = TestBed.createComponent(SourceForm);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
  }

  beforeEach(() => {
    sources.set([]);
    for (const fn of [store.create, store.update, store.test, sizes.clear]) {
      fn.mockReset();
    }
    TestBed.configureTestingModule({
      imports: [SourceForm],
      providers: [
        provideRouter([]),
        { provide: SourcesStore, useValue: store },
        { provide: FolderSizes, useValue: sizes },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('requires a name and credentials', async () => {
    await create();
    await click('Add source');
    expect(store.create).not.toHaveBeenCalled();
    expect(text()).toContain('Give the source a name');
    expect(text()).toContain('Secret key is required');
  });

  it('adds a source (https:// assumed) and opens it', async () => {
    store.create.mockResolvedValue(source('prod', 'Prod'));
    await create();
    fillRequired();
    await click('Add source');
    expect(store.create).toHaveBeenCalledWith(
      {
        name: 'Prod',
        endpoint: 'https://s3.corp:9000',
        region: 'us-east-1',
        access_key: 'AKIA',
        secret_key: 'secret',
        verify_tls: true,
        ca_cert: '',
      },
      true,
    );
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/s', 'prod']);
  });

  it('tests a connection without saving', async () => {
    store.test.mockResolvedValue({ ok: true, buckets: ['a', 'b'] });
    await create();
    fillRequired();
    await click('Test connection');
    expect(store.create).not.toHaveBeenCalled();
    expect(el().querySelector('.success')?.textContent).toContain('2 buckets');
  });

  it('offers to save without testing when the endpoint is unreachable', async () => {
    store.create
      .mockRejectedValueOnce(
        new HttpErrorResponse({
          status: 502,
          error: { code: 'endpoint_unreachable', message: 'Could not connect.' },
        }),
      )
      .mockResolvedValueOnce(source('prod'));
    await create();
    fillRequired();
    await click('Add source');
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Could not connect.');
    await click('Save without testing');
    expect(store.create).toHaveBeenLastCalledWith(expect.anything(), false);
  });

  it('edits a source, keeping the secret when left empty', async () => {
    sources.set([source('prod', 'Prod', { endpoint: 'https://s3.corp', ca_cert: PEM + '\n' })]);
    store.update.mockResolvedValue(source('prod', 'Prod 2'));
    await create('prod');
    expect((el().querySelector('textarea') as HTMLTextAreaElement).value).toBe(PEM);
    type('input[placeholder="e.g. Production MinIO"]', 'Prod 2');
    await click('Save');
    expect(store.update).toHaveBeenCalledWith(
      'prod',
      expect.objectContaining({ name: 'Prod 2', secret_key: null, ca_cert: PEM }),
      true,
    );
    expect(sizes.clear).toHaveBeenCalledWith('prod');
  });

  it('reports an unknown source', async () => {
    await create('gone');
    expect(text()).toContain('This source does not exist');
  });

  describe('TLS options', () => {
    it('are always visible, and disabled only for http:// endpoints', async () => {
      await create();
      const ca = () => el().querySelector('fieldset.tls textarea') as HTMLTextAreaElement;
      expect(ca().disabled).toBe(false);
      type('input[placeholder="https://s3.example.com:9000"]', 'http://minio.lan:9000');
      await fixture.whenStable();
      expect(ca().disabled).toBe(true);
      expect(el().querySelector('.tls-off')?.textContent).toContain('plain http://');
    });

    it('rejects text that is not a PEM certificate', async () => {
      await create();
      fillRequired();
      type('textarea', 'hello');
      await click('Add source');
      expect(store.create).not.toHaveBeenCalled();
      expect(text()).toContain('Paste a PEM certificate');
    });

    it('can skip verification, with a warning', async () => {
      store.create.mockResolvedValue(source('prod'));
      await create();
      fillRequired();
      (el().querySelector('fieldset.tls input[type=checkbox]') as HTMLInputElement).click();
      await fixture.whenStable();
      expect(el().querySelector('.warning')?.textContent).toContain('identity is not checked');
      await click('Add source');
      expect(store.create).toHaveBeenCalledWith(
        expect.objectContaining({ verify_tls: false, ca_cert: '' }),
        true,
      );
    });

    it('loads the CA from a file', async () => {
      await create();
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
