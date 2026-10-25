import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from '../api/api';
import { connect, disconnect, getSession } from '../api/functions';
import { ConnectRequest, SessionInfo } from '../api/models';

export type SessionStatus = 'unknown' | 'connected' | 'disconnected';

/** The current S3 connection. Credentials live on the server; this only holds what it returns. */
@Injectable({
  providedIn: 'root',
})
export class SessionStore {
  private readonly api = inject(Api);
  private readonly _info = signal<SessionInfo | undefined>(undefined);
  private readonly _status = signal<SessionStatus>('unknown');
  private restoring?: Promise<boolean>;

  readonly info = this._info.asReadonly();
  readonly status = this._status.asReadonly();
  readonly connected = computed(() => this._status() === 'connected');
  readonly buckets = computed(() => this._info()?.buckets ?? []);
  readonly endpointLabel = computed(() => this._info()?.endpoint || 'AWS S3');

  /** Ask the server whether a session cookie is still valid (once per page load). */
  restore(): Promise<boolean> {
    if (this._status() !== 'unknown') {
      return Promise.resolve(this.connected());
    }
    this.restoring ??= this.api
      .invoke(getSession)
      .then(
        (info) => {
          this.set(info);
          return true;
        },
        () => {
          this.clear();
          return false;
        },
      )
      .finally(() => (this.restoring = undefined));
    return this.restoring;
  }

  async connect(request: ConnectRequest): Promise<SessionInfo> {
    const info = await this.api.invoke(connect, { body: request });
    this.set(info);
    return info;
  }

  async refresh(): Promise<void> {
    this.set(await this.api.invoke(getSession));
  }

  async disconnect(): Promise<void> {
    try {
      await this.api.invoke(disconnect);
    } finally {
      this.clear();
    }
  }

  /** Forget the session locally, e.g. after the server reported it expired. */
  clear(): void {
    this._info.set(undefined);
    this._status.set('disconnected');
  }

  private set(info: SessionInfo): void {
    this._info.set(info);
    this._status.set('connected');
  }
}
