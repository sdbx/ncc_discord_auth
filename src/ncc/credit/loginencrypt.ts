/**
 * https://github.com/yoo2001818/node-ncc-es6/blob/master/src/loginEncrypt.js
 */

import { Ber } from "asn1";
import { RSA_PKCS1_PADDING } from "constants";
import * as crypto from "crypto";

function linebrk(str, maxLen) {
  let res = "";
  let i = 0;
  while (i + maxLen < str.length) {
    res += str.substring(i, i + maxLen) + "\n";
    i += maxLen;
  }
  return res + str.substring(i, str.length);
}

function getEncChar(value) {
  return String.fromCharCode(value.length) + value;
}

export default function encryptKey(keyString:string, username:string, password:string) {
  const [sessionKey, keyName, nValue, eValue] = keyString.split(",");
  // Parse eValue, nValue
  const keyN = Buffer.from(nValue, "hex");
  const keyE = parseInt(eValue, 16);
  const size = keyN.length + 512;
  // Create PEM encoded RSA public key
  const bodyWriter = new Ber.Writer({ size });
  bodyWriter.startSequence();
  bodyWriter.writeBuffer(keyN, 2);
  bodyWriter.writeInt(keyE);
  bodyWriter.endSequence();
  let key = "-----BEGIN RSA PUBLIC KEY-----\n";
  key += linebrk(bodyWriter.buffer.toString("base64"), 64);
  key += "\n-----END RSA PUBLIC KEY-----\n";
  // Encode credentials using PEM key
  const encryptBuffer = Buffer.from(getEncChar(sessionKey) +
    getEncChar(username) + getEncChar(password));
  const encrypted = crypto.publicEncrypt({
    key, padding: RSA_PKCS1_PADDING
  }, encryptBuffer);
  return {
    keyName, key: encrypted.toString("hex")
  };
}