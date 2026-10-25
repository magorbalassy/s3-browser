import { Pipe, PipeTransform } from '@angular/core';

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

/** Human-readable binary size, e.g. 1536 -> "1.5 KiB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

@Pipe({
  name: 'bytes',
})
export class BytesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '' : formatBytes(value);
  }
}
