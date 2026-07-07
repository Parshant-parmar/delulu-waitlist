// Minimal WebCrypto-based E2EE helper used by the profile completion page.
// Mirrors the API surface the main Delulu app's login.js expects:
//   generateECDHKeypair() -> { publicKey, privateKey } (CryptoKey pair)
//   deriveKeyFromPassword(password, salt) -> CryptoKey (AES-GCM key)
//   encryptPrivateKey(privateKey, aesKey) -> { ciphertext, iv } (base64 strings)
//   decryptPrivateKey(ciphertext, iv, aesKey) -> CryptoKey (ECDH private key)
//   exportKeyToJwk(key) -> JWK object
window.E2EECrypto = (function () {
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function generateECDHKeypair() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    return keyPair;
  }

  async function deriveKeyFromPassword(password, saltString) {
    const enc = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(saltString || ''),
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptPrivateKey(privateKey, aesKey) {
    const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      enc.encode(JSON.stringify(jwk))
    );
    return {
      ciphertext: bufToB64(ciphertextBuf),
      iv: bufToB64(iv)
    };
  }

  async function decryptPrivateKey(ciphertextB64, ivB64, aesKey) {
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(ivB64)) },
      aesKey,
      b64ToBuf(ciphertextB64)
    );
    const dec = new TextDecoder();
    const jwk = JSON.parse(dec.decode(plainBuf));
    return window.crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
  }

  async function exportKeyToJwk(key) {
    return window.crypto.subtle.exportKey('jwk', key);
  }

  return {
    generateECDHKeypair,
    deriveKeyFromPassword,
    encryptPrivateKey,
    decryptPrivateKey,
    exportKeyToJwk
  };
})();
