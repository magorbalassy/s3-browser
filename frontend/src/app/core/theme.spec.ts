import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

describe('Theme', () => {
  beforeEach(() => localStorage.clear());

  it('follows the system by default and cycles light -> dark -> system', () => {
    const theme = TestBed.inject(Theme);
    TestBed.tick();
    expect(theme.mode()).toBe('system');
    expect(document.documentElement.style.colorScheme).toBe('light dark');

    theme.cycle();
    TestBed.tick();
    expect(theme.mode()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem('s3b.theme')).toBe('light');

    theme.cycle();
    TestBed.tick();
    expect(theme.icon()).toBe('dark_mode');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    theme.cycle();
    expect(theme.mode()).toBe('system');
  });

  it('restores the stored choice', () => {
    localStorage.setItem('s3b.theme', 'dark');
    expect(TestBed.inject(Theme).mode()).toBe('dark');
  });
});
