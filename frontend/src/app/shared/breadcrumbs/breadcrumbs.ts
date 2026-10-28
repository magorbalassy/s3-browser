import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

interface Crumb {
  label: string;
  link: string[];
}

/** source › bucket › folder › sub-folder, each a link except the current one. */
@Component({
  imports: [RouterLink, MatIconModule],
  selector: 'app-breadcrumbs',
  styleUrl: './breadcrumbs.scss',
  templateUrl: './breadcrumbs.html',
})
export class Breadcrumbs {
  readonly source = input.required<string>();
  /** Display name of the source (defaults to its id). */
  readonly sourceName = input('');
  readonly bucket = input.required<string>();
  readonly prefix = input('');

  protected readonly crumbs = computed<Crumb[]>(() => {
    const base = ['/s', this.source()];
    const crumbs: Crumb[] = [
      { label: this.sourceName() || this.source(), link: base },
      { label: this.bucket(), link: [...base, this.bucket()] },
    ];
    const folders = this.prefix().split('/').filter(Boolean);
    folders.forEach((label, i) =>
      crumbs.push({ label, link: [...base, this.bucket(), ...folders.slice(0, i + 1)] }),
    );
    return crumbs;
  });
}
