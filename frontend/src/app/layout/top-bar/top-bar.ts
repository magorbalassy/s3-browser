import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { FolderSizes } from '../../core/folder-sizes';
import { SessionStore } from '../../core/session-store';
import { Theme } from '../../core/theme';

@Component({
  imports: [
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  selector: 'app-top-bar',
  styleUrl: './top-bar.scss',
  templateUrl: './top-bar.html',
})
export class TopBar {
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(Theme);
  private readonly sizes = inject(FolderSizes);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The bucket being browsed, read from the URL (/b/<bucket>/...). */
  protected readonly bucket = computed(() => {
    const segments = this.router.parseUrl(this.url()).root.children['primary']?.segments ?? [];
    return segments.length >= 2 && segments[0].path === 'b' ? segments[1].path : '';
  });

  protected readonly themeLabel = computed(() => `Theme: ${this.theme.mode()}`);

  protected openBucket(bucket: string): void {
    this.router.navigate(['/b', bucket]);
  }

  protected async logout(): Promise<void> {
    this.sizes.clear();
    await this.session.disconnect();
    this.router.navigate(['/connect']);
  }
}
