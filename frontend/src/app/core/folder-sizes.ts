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

  state(bucket: string, prefix: string): Signal<FolderSizeState | undefined> {
    return this.slot(bucket, prefix).asReadonly();
  }

  start(bucket: string, prefix: string): void {
    const key = keyOf(bucket, prefix);
    this.stop(key);
    const state = this.slot(bucket, prefix);
    state.set({ bytes: 0, objects: 0, done: false });

    const url =
      `/api/buckets/${encodeURIComponent(bucket)}/size` +
      (prefix ? `?prefix=${encodeURIComponent(prefix)}` : '');
    const source = new EventSource(url);
    this.streams.set(key, source);

    source.onmessage = (event: MessageEvent<string>) => {
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
    source.onerror = () => {
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

  cancel(bucket: string, prefix: string): void {
    this.stop(keyOf(bucket, prefix));
    this.slot(bucket, prefix).set(undefined);
  }

  /** Drop everything, e.g. when disconnecting. */
  clear(): void {
    for (const key of [...this.streams.keys()]) {
      this.stop(key);
    }
    for (const state of this.states.values()) {
      state.set(undefined);
    }
  }

  private slot(bucket: string, prefix: string): WritableSignal<FolderSizeState | undefined> {
    const key = keyOf(bucket, prefix);
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

function keyOf(bucket: string, prefix: string): string {
  return `${bucket}\u0000${prefix}`;
}
