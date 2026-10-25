import { TestBed } from '@angular/core/testing';
import { FolderSizes } from './folder-sizes';

/** Minimal stand-in for the browser's EventSource. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(data: object): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  close(): void {
    this.closed = true;
  }
}

describe('FolderSizes', () => {
  let sizes: FolderSizes;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    sizes = TestBed.inject(FolderSizes);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('streams progress until done, then closes the connection', () => {
    const state = sizes.state('photos', '2024/');
    sizes.start('photos', '2024/');
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('/api/buckets/photos/size?prefix=2024%2F');
    expect(state()).toEqual({ bytes: 0, objects: 0, done: false });

    source.emit({ bytes: 100, objects: 1, done: false, error: null });
    expect(state()).toEqual({ bytes: 100, objects: 1, done: false, error: undefined });

    source.emit({ bytes: 300, objects: 2, done: true, error: null });
    expect(state()?.done).toBe(true);
    expect(source.closed).toBe(true);
  });

  it('reports server-side errors', () => {
    sizes.start('nope', '');
    FakeEventSource.instances[0].emit({
      bytes: 0,
      objects: 0,
      done: true,
      error: { code: 'bucket_not_found', message: 'Bucket not found.' },
    });
    expect(sizes.state('nope', '')()?.error).toBe('Bucket not found.');
  });

  it('marks a dropped connection as an error but keeps the partial total', () => {
    sizes.start('photos', '');
    const source = FakeEventSource.instances[0];
    source.emit({ bytes: 50, objects: 5, done: false, error: null });
    source.onerror?.();
    expect(sizes.state('photos', '')()).toEqual({
      bytes: 50,
      objects: 5,
      done: true,
      error: 'The size calculation was interrupted.',
    });
    expect(source.closed).toBe(true);
  });

  it('cancels and clears', () => {
    sizes.start('photos', 'a/');
    sizes.cancel('photos', 'a/');
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(sizes.state('photos', 'a/')()).toBeUndefined();

    sizes.start('photos', 'b/');
    sizes.clear();
    expect(FakeEventSource.instances[1].closed).toBe(true);
    expect(sizes.state('photos', 'b/')()).toBeUndefined();
  });
});
