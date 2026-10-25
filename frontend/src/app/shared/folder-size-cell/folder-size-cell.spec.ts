import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FolderSizes, FolderSizeState } from '../../core/folder-sizes';
import { FolderSizeCell } from './folder-size-cell';

describe('FolderSizeCell', () => {
  let fixture: ComponentFixture<FolderSizeCell>;
  const state = signal<FolderSizeState | undefined>(undefined);
  const sizes = { state: () => state, start: vi.fn(), cancel: vi.fn() };
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');

  beforeEach(async () => {
    state.set(undefined);
    TestBed.configureTestingModule({
      imports: [FolderSizeCell],
      providers: [{ provide: FolderSizes, useValue: sizes }],
    });
    fixture = TestBed.createComponent(FolderSizeCell);
    fixture.componentRef.setInput('bucket', 'photos');
    fixture.componentRef.setInput('prefix', '2024/');
    fixture.componentRef.setInput('labelled', true);
    await fixture.whenStable();
  });

  it('starts a calculation on click', () => {
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(sizes.start).toHaveBeenCalledWith('photos', '2024/');
  });

  it('shows progress, the result and errors', async () => {
    state.set({ bytes: 1024, objects: 3, done: false });
    await fixture.whenStable();
    expect(text()).toContain('1.00 KiB');
    expect(text()).toContain('3 objects');

    state.set({ bytes: 4096, objects: 7, done: true });
    await fixture.whenStable();
    expect(text()).toContain('4.00 KiB');
    expect(text()).toContain('in 7 objects');

    state.set({ bytes: 0, objects: 0, done: true, error: 'Bucket not found.' });
    await fixture.whenStable();
    expect(text()).toContain('Bucket not found.');
  });
});
