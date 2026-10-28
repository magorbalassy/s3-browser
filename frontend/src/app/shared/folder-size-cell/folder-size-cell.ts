import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FolderSizes } from '../../core/folder-sizes';
import { BytesPipe } from '../bytes-pipe';

/** Size of a folder, calculated on demand and streamed while it is being counted. */
@Component({
  imports: [
    BytesPipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  selector: 'app-folder-size-cell',
  styleUrl: './folder-size-cell.scss',
  templateUrl: './folder-size-cell.html',
})
export class FolderSizeCell {
  private readonly sizes = inject(FolderSizes);

  readonly source = input.required<string>();
  readonly bucket = input.required<string>();
  readonly prefix = input.required<string>();
  /** Show a labelled button instead of an icon (used for the current folder's total). */
  readonly labelled = input(false);

  protected readonly state = computed(() =>
    this.sizes.state(this.source(), this.bucket(), this.prefix())(),
  );

  protected start(): void {
    this.sizes.start(this.source(), this.bucket(), this.prefix());
  }

  protected cancel(): void {
    this.sizes.cancel(this.source(), this.bucket(), this.prefix());
  }
}
