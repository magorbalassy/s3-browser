import { inject, Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { Api } from '../api/api';
import {
  createSource,
  deleteSource,
  listBuckets,
  listSources,
  testSource,
  updateSource,
} from '../api/functions';
import { ConnectionTest, Source, SourceIn } from '../api/models';
import { ApiError, toApiError } from '../shared/api-error';

export interface BucketsState {
  loading: boolean;
  buckets: string[];
  error?: ApiError;
}

/** The saved S3 sources (kept on the server) and, per source, its bucket list. */
@Injectable({
  providedIn: 'root',
})
export class SourcesStore {
  private readonly api = inject(Api);
  private readonly _sources = signal<Source[]>([]);
  private readonly _loaded = signal(false);
  private loading?: Promise<void>;
  private readonly buckets = new Map<string, WritableSignal<BucketsState | undefined>>();

  readonly sources = this._sources.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /** Load the list once; later calls reuse it unless `force` is set. */
  load(force = false): Promise<void> {
    if (this._loaded() && !force) {
      return Promise.resolve();
    }
    this.loading ??= this.api
      .invoke(listSources)
      .then((list) => {
        this._sources.set(list.sources);
        this._loaded.set(true);
      })
      .finally(() => (this.loading = undefined));
    return this.loading;
  }

  byId(id: string): Source | undefined {
    return this._sources().find((s) => s.id === id);
  }

  async create(body: SourceIn, test = true): Promise<Source> {
    const source = await this.api.invoke(createSource, { body, test });
    this._sources.update((list) => sortByName([...list, source]));
    this.bucketsSlot(source.id).set(undefined);
    return source;
  }

  async update(id: string, body: SourceIn, test = true): Promise<Source> {
    const source = await this.api.invoke(updateSource, { source_id: id, body, test });
    this._sources.update((list) => sortByName(list.map((s) => (s.id === id ? source : s))));
    this.bucketsSlot(id).set(undefined);
    return source;
  }

  async remove(id: string): Promise<void> {
    await this.api.invoke(deleteSource, { source_id: id });
    this._sources.update((list) => list.filter((s) => s.id !== id));
    this.buckets.delete(id);
  }

  /** Try settings without saving; with `sourceId`, an empty secret reuses the stored one. */
  test(body: SourceIn, sourceId?: string): Promise<ConnectionTest> {
    return this.api.invoke(testSource, { body, source_id: sourceId });
  }

  /** Bucket list of a source, loaded on first use (see loadBuckets). */
  bucketsOf(id: string): Signal<BucketsState | undefined> {
    return this.bucketsSlot(id).asReadonly();
  }

  async loadBuckets(id: string, force = false): Promise<void> {
    const slot = this.bucketsSlot(id);
    const current = slot();
    if (current && !force && (current.loading || !current.error)) {
      return;
    }
    slot.set({ loading: true, buckets: current?.buckets ?? [] });
    try {
      const { buckets } = await this.api.invoke(listBuckets, { source_id: id });
      slot.set({ loading: false, buckets });
    } catch (error) {
      slot.set({ loading: false, buckets: [], error: toApiError(error) });
    }
  }

  private bucketsSlot(id: string): WritableSignal<BucketsState | undefined> {
    let slot = this.buckets.get(id);
    if (!slot) {
      slot = signal<BucketsState | undefined>(undefined);
      this.buckets.set(id, slot);
    }
    return slot;
  }
}

function sortByName(list: Source[]): Source[] {
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
