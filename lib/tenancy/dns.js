const dns = require('node:dns').promises;
const { CUSTOM_DOMAIN_TARGET, SERVER_IP } = require('./config');

// CAs used by Cloudflare for SaaS and by common self-hosted setups. A CAA
// record that permits none of these will block certificate issuance even when
// DNS verification succeeds.
const KNOWN_CA_ISSUERS = [
  'letsencrypt.org',
  'digicert.com',
  'pki.goog',
  'sectigo.com',
  'cloudflare.com',
  'globalsign.com',
  'amazon.com',
  'amazontrust.com'
];

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

async function safeResolve(resolver, method, ...args) {
  if (!resolver || typeof resolver[method] !== 'function') return null;
  try {
    return await resolver[method](...args);
  } catch {
    return null;
  }
}

function caaIssuers(records) {
  const issuers = [];
  for (const record of records || []) {
    for (const field of ['issue', 'issuewild']) {
      const value = record && record[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      const issuer = normalize(value.split(';')[0]);
      if (issuer) issuers.push(issuer);
    }
  }
  return [...new Set(issuers)];
}

/**
 * Verifies the TXT challenge plus either the CNAME target or the A record.
 * A domain is verified once both the TXT token and one routing record match.
 *
 * Also returns per-record diagnostics (AAAA/CAA) so the dashboard can explain
 * why verification or certificate issuance is not progressing yet.
 */
async function verifyDomainDns({ hostname, token, target, serverIp, resolver } = {}) {
  const r = resolver || dns;
  const host = normalize(hostname);
  const expectedTarget = normalize(target || CUSTOM_DOMAIN_TARGET);
  const expectedIp = String(serverIp || SERVER_IP || '').trim();

  const txtRecords = await safeResolve(r, 'resolveTxt', `_verify.${host}`);
  const txtValues = (txtRecords || []).map(record => {
    const parts = Array.isArray(record) ? record : [record];
    return normalize(parts.join(''));
  });
  const txtOk = Boolean(token) && txtValues.includes(normalize(token));

  const cnames = await safeResolve(r, 'resolveCname', host);
  const cnameValues = (cnames || []).map(normalize);
  const cnameOk = Boolean(expectedTarget) && cnameValues.some(value =>
    value === expectedTarget || value.endsWith(`.${expectedTarget}`)
  );

  const addresses = await safeResolve(r, 'resolve4', host);
  const aValues = (addresses || []).map(value => String(value).trim());
  const aOk = Boolean(expectedIp) && aValues.includes(expectedIp);

  const addresses6 = await safeResolve(r, 'resolve6', host);
  const aaaaValues = (addresses6 || []).map(value => String(value).trim());

  const caaRecords = await safeResolve(r, 'resolveCaa', host);
  const caa = (caaRecords || []).map(record => ({
    critical: record && record.critical ? record.critical : undefined,
    issue: record && record.issue ? record.issue : undefined,
    issuewild: record && record.issuewild ? record.issuewild : undefined,
    iodef: record && record.iodef ? record.iodef : undefined
  }));
  const issuers = caaIssuers(caaRecords);
  const caaRestricts = issuers.length > 0;
  const caaOk = !caaRestricts || issuers.some(issuer =>
    KNOWN_CA_ISSUERS.some(known => issuer === known || issuer.endsWith(`.${known}`))
  );

  const routingOk = cnameOk || aOk;
  const verified = txtOk && routingOk;

  const txtStatus = txtOk ? 'ok' : (txtValues.length ? 'mismatch' : 'missing');
  const routingStatus = routingOk ? 'ok' : ((cnameValues.length || aValues.length) ? 'mismatch' : 'missing');
  const status = verified ? 'verified' : (txtStatus === 'mismatch' || routingStatus === 'mismatch' ? 'mismatch' : 'pending');

  const checks = [
    {
      id: 'txt',
      label: 'TXT verification',
      status: txtStatus,
      ok: txtOk,
      name: `_verify.${host}`,
      expected: token || null,
      observed: txtValues
    },
    {
      id: 'routing',
      label: 'CNAME/A routing',
      status: routingStatus,
      ok: routingOk,
      expected: { cname: expectedTarget || null, a: expectedIp || null },
      observed: { cname: cnameValues, a: aValues }
    },
    {
      id: 'aaaa',
      label: 'AAAA records',
      status: aaaaValues.length ? 'warning' : 'ok',
      ok: true,
      observed: aaaaValues
    },
    {
      id: 'caa',
      label: 'CAA restrictions',
      status: caaOk ? 'ok' : 'warning',
      ok: caaOk,
      observed: caa
    }
  ];

  const diagnostics = [];
  if (txtStatus === 'missing') {
    diagnostics.push(`No TXT record found at _verify.${host}. Create it with the token shown in the dashboard.`);
  } else if (txtStatus === 'mismatch') {
    diagnostics.push(`The TXT record at _verify.${host} does not contain the expected token.`);
  }
  if (routingStatus === 'missing') {
    diagnostics.push('No CNAME or A record is visible yet. Add one and allow a few minutes for propagation.');
  } else if (routingStatus === 'mismatch') {
    diagnostics.push(`CNAME/A records exist but do not point at ${expectedTarget || expectedIp || 'this platform'}.`);
  }
  if (aaaaValues.length) {
    diagnostics.push(`AAAA records are present (${aaaaValues.join(', ')}). Make sure they point at the same host, or IPv6 visitors may bypass your proxy.`);
  }
  if (!caaOk) {
    diagnostics.push(`CAA records restrict certificate issuance to ${issuers.join(', ')}. Add your certificate authority (for example letsencrypt.org or digicert.com) or HTTPS issuance will fail.`);
  }

  return {
    verified,
    status,
    txtOk,
    cnameOk,
    aOk,
    routingOk,
    caaOk,
    checks,
    diagnostics,
    expected: { target: expectedTarget || null, serverIp: expectedIp || null, txtName: `_verify.${host}` },
    observed: { txt: txtValues, cname: cnameValues, a: aValues, aaaa: aaaaValues, caa }
  };
}

module.exports = { verifyDomainDns };
