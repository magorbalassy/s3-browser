import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { SizeProgress } from '../api/models';

export interface FolderSizeState {
  bytes: number;
  objects: number;
  done: boolean;
  error?: string;
}

/**
 * Folder sizes, streamed from the server as Server-Sent Events and cached for the session,
 * so a size computed once stays visible while browsing.
 */
@Injectable({
  providedIn: 'root',
})
export class FolderSizes {
  private readonly states = new Map<string, WritableSignal<FolderSizeState | undefined>>();
  private readonly streams = new Map<string, EventSource>();

  state(source: string, bucket: string, prefix: string): Signal<FolderSizeState | undefined> {
    return this.slot(source, bucket, prefix).asReadonly();
  }

  start(source: string, bucket: string, prefix: string): void {
    const key = keyOf(source, bucket, prefix);
    this.stop(key);
    const state = this.slot(source, bucket, prefix);
    state.set({ bytes: 0, objects: 0, done: false });

    const url =
      `/api/sources/${encodeURIComponent(source)}/buckets/${encodeURIComponent(bucket)}/size` +
      (prefix ? `?prefix=${encodeURIComponent(prefix)}` : '');
    const stream = new EventSource(url);
    this.streams.set(key, stream);

    stream.onmessage = (event: MessageEvent<string>) => {
      const progress = JSON.parse(event.data) as SizeProgress;
      state.set({
        bytes: progress.bytes,
        objects: progress.objects,
        done: progress.done,
        error: progress.error?.message,
      });
      if (progress.done) {
        this.stop(key);
      }
    };
    stream.onerror = () => {
      // Fires on network loss or a non-200 reply (e.g. the session expired).
      state.update((s) => ({
        bytes: s?.bytes ?? 0,
        objects: s?.objects ?? 0,
        done: true,
        error: 'The size calculation was interrupted.',
      }));
      this.stop(key);
    };
  }

  cancel(source: string, bucket: string, prefix: string): void {
    this.stop(keyOf(source, bucket, prefix));
    this.slot(source, bucket, prefix).set(undefined);
  }

  /** Forget the sizes of one source (e.g. after it was edited), or of all sources. */
  clear(source?: string): void {
    const matches = (key: string) => source === undefined || key.startsWith(source + SEP);
    for (const key of [...this.streams.keys()].filter(matches)) {
      this.stop(key);
    }
    for (const [key, state] of this.states) {
      if (matches(key)) {
        state.set(undefined);
      }
    }
  }

  private slot(
    source: string,
    bucket: string,
    prefix: string,
  ): WritableSignal<FolderSizeState | undefined> {
    const key = keyOf(source, bucket, prefix);
    let state = this.states.get(key);
    if (!state) {
      state = signal<FolderSizeState | undefined>(undefined);
      this.states.set(key, state);
    }
    return state;
  }

  private stop(key: string): void {
    this.streams.get(key)?.close();
    this.streams.delete(key);
  }
}

const SEP = '\u0000';

function keyOf(source: string, bucket: string, prefix: string): string {
  return [source, bucket, prefix].join(SEP);
}
