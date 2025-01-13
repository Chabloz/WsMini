export function bytesBase64Encode(str) {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function bytesBase64Decode(base64str) {
  const padding = '='.repeat((4 - base64str.length % 4) % 4);
  const base64strWithPadding = base64str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    + padding;
  const binString = atob(base64strWithPadding);
  const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
  return new TextDecoder().decode(bytes);
}
