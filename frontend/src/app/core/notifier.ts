import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);

  info(message: string): void {
    this.snackBar.open(message, undefined, { duration: 3000 });
  }

  error(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 8000, panelClass: 'error-snackbar' });
  }
}
