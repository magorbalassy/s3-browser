import { Source } from '../api/models';

/** A saved source for tests. */
export const source = (id: string, name = id, extra: Partial<Source> = {}): Source => ({
  id,
  name,
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  access_key: 'AKIA',
  verify_tls: true,
  ca_cert: '',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...extra,
});
