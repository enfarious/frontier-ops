/**
 * Client-side AES-256-GCM encryption for Dead Drop payloads.
 * Uses Web Crypto API — zero dependencies, browser-native.
 *
 * Wire format: [12-byte IV][ciphertext + GCM auth tag]
 * Single blob, ready to store as vector<u8> on-chain.
 */

/** Generate a random 256-bit AES key. */
export async function generateKey(): Promise<Uint8Array> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a single blob: [12-byte IV][ciphertext + GCM tag].
 */
export async function encrypt(
  plaintext: string,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> },
    key,
    encoded,
  );

  // Combine: [IV (12 bytes)][ciphertext + auth tag]
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return combined;
}

/**
 * Decrypt an AES-256-GCM blob (IV-prefixed format).
 * Returns the original plaintext string.
 */
export async function decrypt(
  combined: Uint8Array,
  keyBytes: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/** SHA-256 hash of a key (for on-chain commitment verification). */
export async function hashKey(keyBytes: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", keyBytes.buffer as ArrayBuffer);
  return new Uint8Array(hash);
}

/** Encode key bytes as base64 (for local storage / clipboard). */
export function keyToBase64(keyBytes: Uint8Array): string {
  let binary = "";
  for (const byte of keyBytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decode a base64 key back to bytes. */
export function keyFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
