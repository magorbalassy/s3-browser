import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

interface Crumb {
  label: string;
  link: string[];
}

/** Buckets › bucket › folder › sub-folder, each a link except the current one. */
@Component({
  imports: [RouterLink, MatIconModule],
  selector: 'app-breadcrumbs',
  styleUrl: './breadcrumbs.scss',
  templateUrl: './breadcrumbs.html',
})
export class Breadcrumbs {
  readonly bucket = input.required<string>();
  readonly prefix = input('');

  protected readonly crumbs = computed<Crumb[]>(() => {
    const crumbs: Crumb[] = [{ label: this.bucket(), link: ['/b', this.bucket()] }];
    const folders = this.prefix().split('/').filter(Boolean);
    folders.forEach((label, i) =>
      crumbs.push({ label, link: ['/b', this.bucket(), ...folders.slice(0, i + 1)] }),
    );
    return crumbs;
  });
}
