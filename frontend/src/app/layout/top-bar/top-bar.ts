import { Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { SourcesStore } from '../../core/sources-store';
import { Theme } from '../../core/theme';
import { endpointLabel, tlsBadge } from '../../shared/tls';

/** Value of the "Manage sources…" entry in the source picker. */
const MANAGE = '\u0000manage';

@Component({
  imports: [
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  selector: 'app-top-bar',
  styleUrl: './top-bar.scss',
  templateUrl: './top-bar.html',
})
export class TopBar {
  protected readonly store = inject(SourcesStore);
  protected readonly theme = inject(Theme);
  private readonly router = inject(Router);
  protected readonly manage = MANAGE;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Source and bucket being browsed, read from the URL (/s/<source>/<bucket>/...). */
  private readonly location = computed(() => {
    const segments = this.router.parseUrl(this.url()).root.children['primary']?.segments ?? [];
    const inSource = segments.length >= 2 && segments[0].path === 's';
    return {
      source: inSource ? segments[1].path : '',
      bucket: inSource && segments.length >= 3 ? segments[2].path : '',
    };
  });
  protected readonly sourceId = computed(() => this.location().source);
  protected readonly bucket = computed(() => this.location().bucket);
  protected readonly source = computed(() =>
    this.store.sources().find((s) => s.id === this.sourceId()),
  );
  protected readonly buckets = computed(() => {
    const id = this.sourceId();
    return id ? (this.store.bucketsOf(id)()?.buckets ?? []) : [];
  });
  protected readonly tls = computed(() => {
    const source = this.source();
    if (!source) {
      return undefined;
    }
    const badge = tlsBadge(source);
    return { ...badge, tooltip: `${endpointLabel(source)} · ${badge.label}` };
  });

  protected readonly themeLabel = computed(() => `Theme: ${this.theme.mode()}`);

  constructor() {
    this.store.load().catch(() => undefined);
    effect(() => {
      const id = this.sourceId();
      if (id) {
        untracked(() => this.store.loadBuckets(id));
      }
    });
  }

  protected openSource(id: string): void {
    this.router.navigate(id === MANAGE ? ['/sources'] : ['/s', id]);
  }

  protected openBucket(bucket: string): void {
    this.router.navigate(['/s', this.sourceId(), bucket]);
  }
}
