import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Notifier } from '../../core/notifier';
import { SessionStore } from '../../core/session-store';
import { toApiError } from '../../shared/api-error';

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
  protected readonly session = inject(SessionStore);
  private readonly notifier = inject(Notifier);

  protected readonly filter = signal('');
  protected readonly refreshing = signal(false);
  protected readonly visible = computed(() => {
    const term = this.filter().trim().toLowerCase();
    return this.session.buckets().filter((name) => name.toLowerCase().includes(term));
  });

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.session.refresh();
    } catch (error) {
      this.notifier.error(toApiError(error).message);
    } finally {
      this.refreshing.set(false);
    }
  }
}
