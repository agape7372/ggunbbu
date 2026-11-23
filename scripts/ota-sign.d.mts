export type Signable = { version: string; url: string; checksum: string; sig?: string };
export const OTA_KEY: string;
export function otaMessage(m: Signable): string;
export function signManifest<T extends Signable>(m: T, pem: string): T & { sig: string };
export function verifyManifest(m: Signable, spkiB64: string): boolean;
export function publicKeyOf(pem: string): string;
