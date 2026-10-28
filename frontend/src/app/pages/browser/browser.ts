import { CdkCopyToClipboard } from '@angular/cdk/clipboard';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { listObjects } from '../../api/functions';
import { ObjectPage } from '../../api/models';
import { Notifier } from '../../core/notifier';
import { SourcesStore } from '../../core/sources-store';
import { toApiError } from '../../shared/api-error';
import { Breadcrumbs } from '../../shared/breadcrumbs/breadcrumbs';
import { BytesPipe } from '../../shared/bytes-pipe';
import { FolderSizeCell } from '../../shared/folder-size-cell/folder-size-cell';

const PAGE_SIZE = 500;

export type Row =
  | { kind: 'folder'; name: string; key: string; link: string[] }
  | { kind: 'file'; name: string; key: string; size: number; modified: Date; download: string };

interface Listing {
  page: ObjectPage | undefined;
  folders: ObjectPage['folders'];
  files: ObjectPage['files'];
  nextToken: string | null;
}

/** Browse one folder (S3 prefix) of a bucket. The URL is /s/<source>/<bucket>/<folder path>. */
@Component({
  imports: [
    Breadcrumbs,
    BytesPipe,
    CdkCopyToClipboard,
    DatePipe,
    DecimalPipe,
    FolderSizeCell,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    RouterLink,
  ],
  selector: 'app-browser',
  styleUrl: './browser.scss',
  templateUrl: './browser.html',
})
export class Browser {
  private readonly api = inject(Api);
  private readonly notifier = inject(Notifier);
  private readonly title = inject(Title);
  private readonly store = inject(SourcesStore);

  /** Route params (see bucketPathMatcher). */
  readonly source = input.required<string>();
  readonly bucket = input.required<string>();
  readonly path = input('');

  protected readonly prefix = computed(() => (this.path() ? `${this.path()}/` : ''));
  protected readonly sourceName = computed(() => this.store.byId(this.source())?.name ?? '');
  protected readonly parentLink = computed(() => {
    const folders = this.path().split('/').filter(Boolean);
    return folders.length
      ? ['/s', this.source(), this.bucket(), ...folders.slice(0, -1)]
      : ['/s', this.source()];
  });

  /** The first page of the current folder; reloads whenever the URL changes. */
  private readonly firstPage = resource({
    params: () => ({ source: this.source(), bucket: this.bucket(), prefix: this.prefix() }),
    loader: ({ params }) =>
      this.api.invoke(listObjects, {
        source_id: params.source,
        bucket: params.bucket,
        prefix: params.prefix,
        limit: PAGE_SIZE,
      }),
  });

  /** Everything loaded so far: the first page plus any "load more" pages. */
  private readonly listing = linkedSignal<ObjectPage | undefined, Listing>({
    source: () => (this.firstPage.hasValue() ? this.firstPage.value() : undefined),
    computation: (page) => ({
      page,
      folders: page?.folders ?? [],
      files: page?.files ?? [],
      nextToken: page?.next_token ?? null,
    }),
  });

  protected readonly loading = computed(() => this.firstPage.isLoading());
  protected readonly loadingMore = signal(false);
  protected readonly loaded = computed(() => this.listing().page !== undefined);
  protected readonly error = computed(() => {
    const error = this.firstPage.error();
    return error ? toApiError(error.cause ?? error) : undefined;
  });
  protected readonly hasMore = computed(() => this.listing().nextToken !== null);
  protected readonly folderCount = computed(() => this.listing().folders.length);
  protected readonly fileCount = computed(() => this.listing().files.length);
  protected readonly loadedBytes = computed(() =>
    this.listing().files.reduce((sum, f) => sum + f.size, 0),
  );

  /** Name filter; a new folder starts unfiltered. */
  protected readonly filter = linkedSignal({
    source: () => `${this.source()}/${this.bucket()}/${this.prefix()}`,
    computation: () => '',
  });
  protected readonly sort = signal<Sort>({ active: 'name', direction: 'asc' });
  protected readonly columns = ['name', 'size', 'modified', 'actions'];

  protected readonly rows = computed<Row[]>(() => {
    const { folders, files } = this.listing();
    const source = this.source();
    const bucket = this.bucket();
    const term = this.filter().trim().toLowerCase();
    const matches = (name: string) => !term || name.toLowerCase().includes(term);

    const folderRows: Row[] = folders
      .filter((f) => matches(f.name))
      .map((f) => ({
        kind: 'folder',
        name: f.name,
        key: f.prefix,
        link: ['/s', source, bucket, ...f.prefix.split('/').filter(Boolean)],
      }));
    const fileRows: Row[] = files
      .filter((f) => matches(f.name))
      .map((f) => ({
        kind: 'file',
        name: f.name,
        key: f.key,
        size: f.size,
        modified: new Date(f.last_modified),
        download:
          `/api/sources/${encodeURIComponent(source)}/buckets/${encodeURIComponent(bucket)}` +
          `/download` +
          `?key=${encodeURIComponent(f.key)}`,
      }));

    // Folders always stay on top; sorting applies within each group.
    const { active, direction } = this.sort();
    const factor = direction === 'desc' ? -1 : 1;
    const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const compare = (a: Row, b: Row): number => {
      if (direction && a.kind === 'file' && b.kind === 'file') {
        if (active === 'size') return factor * (a.size - b.size);
        if (active === 'modified') return factor * (a.modified.getTime() - b.modified.getTime());
      }
      return (direction && active === 'name' ? factor : 1) * byName(a, b);
    };
    return [...folderRows.sort(compare), ...fileRows.sort(compare)];
  });

  constructor() {
    effect(() => {
      const location = `${this.sourceName() || this.source()}: ${this.bucket()}/${this.prefix()}`;
      this.title.setTitle(`${location} · S3 Browser`);
    });
  }

  protected reload(): void {
    this.firstPage.reload();
  }

  protected async loadMore(): Promise<void> {
    const current = this.listing();
    if (!current.nextToken || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const page = await this.api.invoke(listObjects, {
        source_id: this.source(),
        bucket: this.bucket(),
        prefix: this.prefix(),
        token: current.nextToken,
        limit: PAGE_SIZE,
      });
      // Ignore the reply if the user navigated elsewhere meanwhile.
      if (this.listing().page === current.page) {
        this.listing.update((l) => ({
          ...l,
          folders: [...l.folders, ...page.folders],
          files: [...l.files, ...page.files],
          nextToken: page.next_token ?? null,
        }));
      }
    } catch (error) {
      this.notifier.error(toApiError(error).message);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected copied(what: string): void {
    this.notifier.info(`Copied ${what} to the clipboard`);
  }

  protected trackRow(_: number, row: Row): string {
    return row.key;
  }
}
