import { Component, computed, effect, inject, input, linkedSignal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SourcesStore } from '../../core/sources-store';
import { endpointLabel, tlsBadge } from '../../shared/tls';

/** The buckets of one source: /s/<source>. */
@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  selector: 'app-buckets',
  styleUrl: './buckets.scss',
  templateUrl: './buckets.html',
})
export class Buckets {
  private readonly store = inject(SourcesStore);
  private readonly title = inject(Title);

  /** Route param. */
  readonly source = input.required<string>();

  protected readonly info = computed(() =>
    this.store.sources().find((s) => s.id === this.source()),
  );
  protected readonly endpoint = computed(() => {
    const info = this.info();
    return info ? endpointLabel(info) : '';
  });
  protected readonly tls = computed(() => {
    const info = this.info();
    return info ? tlsBadge(info) : undefined;
  });
  protected readonly state = computed(() => this.store.bucketsOf(this.source())());
  protected readonly buckets = computed(() => this.state()?.buckets ?? []);

  /** Name filter; reset when switching sources. */
  protected readonly filter = linkedSignal({ source: this.source, computation: () => '' });
  protected readonly visible = computed(() => {
    const term = this.filter().trim().toLowerCase();
    return this.buckets().filter((name) => name.toLowerCase().includes(term));
  });

  constructor() {
    effect(() => {
      const id = this.source();
      // Only the route param is a trigger, not the bucket state that loadBuckets reads.
      untracked(() => this.store.loadBuckets(id));
    });
    effect(() => {
      this.title.setTitle(`${this.info()?.name ?? this.source()} · S3 Browser`);
    });
  }

  protected refresh(): void {
    this.store.loadBuckets(this.source(), true);
  }
}
