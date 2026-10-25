import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Notifier } from './notifier';

describe('Notifier', () => {
  it('styles errors differently from info messages', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatSnackBar, useValue: { open } }] });
    const notifier = TestBed.inject(Notifier);

    notifier.info('Saved');
    expect(open).toHaveBeenLastCalledWith('Saved', undefined, { duration: 3000 });

    notifier.error('Broken');
    expect(open).toHaveBeenLastCalledWith('Broken', 'Dismiss', {
      duration: 8000,
      panelClass: 'error-snackbar',
    });
  });
});
