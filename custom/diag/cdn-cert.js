// Upload the origin's own certificate (certbot-managed) to Tencent SSL and bind it to the CDN domain,
// so both the origin and the CDN edge serve the same host name with one certificate.
const fs = require('fs');
const path = require('path');
const { ssl, cdn } = require('./tc.js');

const DOMAIN = process.env.CDN_DOMAIN || 'sp.example.com';
const DIR = path.join(__dirname, 'tmp');

(async () => {
  const pub = fs.readFileSync(path.join(DIR, 'fullchain.pem'), 'utf8');
  const key = fs.readFileSync(path.join(DIR, 'privkey.pem'), 'utf8');

  const up = await ssl('UploadCertificate', {
    CertificatePublicKey: pub,
    CertificatePrivateKey: key,
    Alias: process.env.CDN_ALIAS || 'sp-example-com',
    ProjectId: 0,
  });
  if (up.Response.Error) {
    console.log('upload failed:', JSON.stringify(up.Response.Error));
    process.exit(1);
  }
  const certId = up.Response.CertificateId || up.Response.CertId;
  console.log('uploaded cert:', certId);

  // 注意：证书绑定必须写成 Https.CertInfo: { CertId }。
  // Https.ServerCertificate / Https.CertId / Https.CertInfo.Deploy 这几种写法 API 都不认。
  const bind = await cdn('UpdateDomainConfig', {
    Domain: DOMAIN,
    ProjectId: 0,
    Https: {
      Switch: 'on',
      Http2: 'on',
      OcspStapling: 'on',
      Spdy: 'off',
      VerifyClient: 'off',
      CertInfo: { CertId: certId },
    },
  });
  console.log('bind:', JSON.stringify(bind.Response));

  const force = await cdn('UpdateDomainConfig', {
    Domain: DOMAIN,
    ProjectId: 0,
    ForceRedirect: { Switch: 'on', RedirectType: 'https', RedirectStatusCode: 301 },
  });
  console.log('force https:', JSON.stringify(force.Response).slice(0, 200));
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
