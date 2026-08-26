import crypto from "crypto";

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a random base62 string of specified length.
 * @param {number} length - Default length 7
 * @returns {string}
 */
export const generateShortCode = (length = 7) => {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_ALPHABET[bytes[i] % BASE62_ALPHABET.length];
  }
  return result;
};
