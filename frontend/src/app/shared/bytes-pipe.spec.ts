import { BytesPipe, formatBytes } from './bytes-pipe';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.00 KiB'],
    [1536, '1.50 KiB'],
    [15 * 1024, '15.0 KiB'],
    [150 * 1024, '150 KiB'],
    [3.5 * 1024 ** 3, '3.50 GiB'],
    [2 * 1024 ** 5, '2.00 PiB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('returns an empty string for invalid input', () => {
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(Number.NaN)).toBe('');
  });
});

describe('BytesPipe', () => {
  it('formats numbers and tolerates missing values', () => {
    const pipe = new BytesPipe();
    expect(pipe.transform(2048)).toBe('2.00 KiB');
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
