// Minimal Tencent Cloud API client: TC3-HMAC-SHA256 signing, no SDK required.
// Credentials come from the environment so they never land in this file.
const crypto = require('crypto');
const https = require('https');

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();

function call(service, host, action, version, region, payload) {
  return new Promise((resolve, reject) => {
    if (!SECRET_ID || !SECRET_KEY) return reject(new Error('missing TENCENT_SECRET_ID / TENCENT_SECRET_KEY'));

    const endpoint = host;
    const algorithm = 'TC3-HMAC-SHA256';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload || {});

    const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedPayload = sha256(body);
    const canonicalRequest = [
      'POST', '/', '',
      canonicalHeaders, signedHeaders, hashedPayload,
    ].join('\n');

    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = [
      algorithm, timestamp, credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    const secretDate = hmac(`TC3${SECRET_KEY}`, date);
    const secretService = hmac(secretDate, service);
    const secretSigning = hmac(secretService, 'tc3_request');
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const auth = [
      `${algorithm} Credential=${SECRET_ID}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const headers = {
      'Content-Type': 'application/json',
      Host: endpoint,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      Authorization: auth,
    };
    if (region) headers['X-TC-Region'] = region;

    const req = https.request({ host: endpoint, method: 'POST', path: '/', headers }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch {
          resolve({ __raw: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const cdn = (action, payload, version = '2018-06-06', region = '') =>
  call('cdn', 'cdn.tencentcloudapi.com', action, version, region, payload);

const ssl = (action, payload, version = '2019-12-05', region = 'ap-guangzhou') =>
  call('ssl', 'ssl.tencentcloudapi.com', action, version, region, payload);

const billing = (action, payload, version = '2018-07-09') =>
  call('billing', 'billing.tencentcloudapi.com', action, version, '', payload);

module.exports = { cdn, ssl, billing, call };
