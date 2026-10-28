import { Source } from '../api/models';

export interface TlsBadge {
  icon: string;
  label: string;
  insecure: boolean;
}

/** How a source's connection is secured, for badges and tooltips. */
export function tlsBadge(source: Pick<Source, 'endpoint' | 'verify_tls' | 'ca_cert'>): TlsBadge {
  if (source.endpoint.toLowerCase().startsWith('http://')) {
    return { icon: 'no_encryption', label: 'Plain HTTP (not encrypted)', insecure: true };
  }
  if (!source.verify_tls) {
    return { icon: 'gpp_bad', label: 'TLS verification is off', insecure: true };
  }
  if (source.ca_cert) {
    return { icon: 'verified_user', label: 'Trusted via custom CA', insecure: false };
  }
  return { icon: 'lock', label: 'TLS with public CAs', insecure: false };
}

export function endpointLabel(source: Pick<Source, 'endpoint'>): string {
  return source.endpoint || 'AWS S3';
}
