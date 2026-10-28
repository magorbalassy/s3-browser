import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Source } from '../../api/models';
import { FolderSizes } from '../../core/folder-sizes';
import { Notifier } from '../../core/notifier';
import { SourcesStore } from '../../core/sources-store';
import { ApiError, toApiError } from '../../shared/api-error';
import { endpointLabel, tlsBadge } from '../../shared/tls';

/** All saved sources, with their connection status. */
@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  selector: 'app-sources',
  styleUrl: './sources.scss',
  templateUrl: './sources.html',
})
export class Sources {
  protected readonly store = inject(SourcesStore);
  private readonly sizes = inject(FolderSizes);
  private readonly notifier = inject(Notifier);

  protected readonly loadError = signal<ApiError | undefined>(undefined);
  /** Id of the source whose delete button was clicked once (asks for confirmation). */
  protected readonly confirmDelete = signal('');
  protected readonly deleting = signal('');

  protected readonly rows = computed(() =>
    this.store.sources().map((source) => ({
      source,
      endpoint: endpointLabel(source),
      tls: tlsBadge(source),
      buckets: this.store.bucketsOf(source.id)(),
    })),
  );

  constructor() {
    this.store.load(true).catch((error) => this.loadError.set(toApiError(error)));
    // Check every source's connection (cheap: one ListBuckets call each).
    effect(() => {
      const ids = this.store.sources().map((s) => s.id);
      untracked(() => ids.forEach((id) => this.store.loadBuckets(id)));
    });
  }

  protected recheck(source: Source): void {
    this.store.loadBuckets(source.id, true);
  }

  protected async remove(source: Source): Promise<void> {
    if (this.confirmDelete() !== source.id) {
      this.confirmDelete.set(source.id);
      return;
    }
    this.deleting.set(source.id);
    try {
      await this.store.remove(source.id);
      this.sizes.clear(source.id);
      this.notifier.info(`Deleted ${source.name}`);
    } catch (error) {
      this.notifier.error(toApiError(error).message);
    } finally {
      this.deleting.set('');
      this.confirmDelete.set('');
    }
  }
}
