const { PLATFORM_DOMAIN, CUSTOM_DOMAIN_TARGET, SERVER_IP, stripHost } = require('./config');

const RESERVED_SUBDOMAINS = new Set([
  'www', 'www1', 'www2', 'admin', 'administrator', 'api', 'apis', 'app', 'apps',
  'mail', 'email', 'smtp', 'imap', 'pop', 'webmail', 'mx', 'ftp', 'sftp',
  'dashboard', 'panel', 'portal', 'console', 'control', 'manage', 'management',
  'support', 'help', 'status', 'docs', 'billing', 'pay', 'payments', 'checkout',
  'secure', 'login', 'logout', 'signup', 'register', 'auth', 'accounts', 'account',
  'ns', 'ns1', 'ns2', 'ns3', 'dns', 'cdn', 'static', 'assets', 'media', 'img',
  'images', 'files', 'download', 'uploads', 'custom', 'verify', 'verification',
  'test', 'testing', 'staging', 'dev', 'development', 'internal', 'system',
  'blog', 'blogs', 'site', 'sites', 'www-blog', 'root', 'localhost',
  'abuse', 'postmaster', 'hostmaster', 'webmaster', 'noreply', 'no-reply'
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function validateSubdomain(input) {
  const slug = String(input || '').trim().toLowerCase();
  if (!slug) return { valid: false, error: 'Subdomain is required.' };
  if (slug.length < 3 || slug.length > 30) {
    return { valid: false, error: 'Subdomain must be between 3 and 30 characters.' };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { valid: false, error: 'Use lowercase letters, digits and hyphens only.' };
  }
  if (!SLUG_RE.test(slug)) {
    return { valid: false, error: 'Subdomain cannot start or end with a hyphen.' };
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { valid: false, error: 'That subdomain is reserved. Please choose another.' };
  }
  return { valid: true, slug, hostname: PLATFORM_DOMAIN ? `${slug}.${PLATFORM_DOMAIN}` : slug };
}

function validateHostname(input) {
  let hostname = stripHost(input);
  if (!hostname) return { valid: false, error: 'Domain is required.' };
  if (hostname.startsWith('*.')) return { valid: false, error: 'Wildcard domains are not supported.' };
  if (hostname.includes('://')) return { valid: false, error: 'Enter a hostname, not a URL.' };
  if (hostname.includes('/')) return { valid: false, error: 'Enter a hostname, not a URL path.' };
  if (hostname.length > 253) return { valid: false, error: 'Domain is too long.' };
  if (IPV4_RE.test(hostname) || hostname.includes(':')) {
    return { valid: false, error: 'IP addresses cannot be connected as custom domains.' };
  }
  const labels = hostname.split('.');
  if (labels.length < 2) return { valid: false, error: 'Enter a full domain, e.g. blog.example.com.' };
  for (const label of labels) {
    if (!label || label.length > 63 || !LABEL_RE.test(label)) {
      return { valid: false, error: 'Domain contains invalid characters.' };
    }
  }
  if (labels[labels.length - 1].length < 2) {
    return { valid: false, error: 'Domain must end in a valid TLD.' };
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { valid: false, error: 'Local hostnames cannot be connected.' };
  }
  if (isPlatformHostname(hostname)) {
    return { valid: false, error: 'This domain belongs to the platform. Choose your own domain.' };
  }
  if (CUSTOM_DOMAIN_TARGET && hostname === CUSTOM_DOMAIN_TARGET) {
    return { valid: false, error: 'This hostname is reserved by the platform.' };
  }
  return { valid: true, hostname };
}

function isPlatformHostname(hostname) {
  const host = stripHost(hostname);
  if (!PLATFORM_DOMAIN) return false;
  return host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`);
}

function dnsInstructions(hostname, verificationToken) {
  const target = CUSTOM_DOMAIN_TARGET || (PLATFORM_DOMAIN ? `custom.${PLATFORM_DOMAIN}` : '');
  const labels = String(hostname || '').split('.');
  const isApex = labels.length <= 2;
  return {
    hostname,
    target,
    serverIp: SERVER_IP,
    records: [
      {
        type: 'CNAME',
        name: hostname,
        value: target,
        purpose: 'Recommended for subdomains such as blog.example.com.',
        required: !isApex
      },
      {
        type: 'A',
        name: '@',
        value: SERVER_IP,
        purpose: 'Use for apex domains, or an ALIAS/ANAME record if your DNS provider supports it.',
        required: isApex
      },
      {
        type: 'TXT',
        name: `_verify.${hostname}`,
        value: verificationToken,
        purpose: 'Proves you control the domain. Required.',
        required: true
      }
    ],
    verification: { txtName: `_verify.${hostname}`, txtValue: verificationToken }
  };
}

module.exports = {
  RESERVED_SUBDOMAINS,
  validateSubdomain,
  validateHostname,
  isPlatformHostname,
  dnsInstructions
};
