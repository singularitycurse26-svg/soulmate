/**
 * DNSHE Domain Auto-Renewal Script
 * 
 * Checks soulmateos.de5.net expiration date and renews it automatically
 * if within the renewal window (180 days before expiration).
 * 
 * Schedule: Run weekly via Windows Task Scheduler
 * 
 * Setup:
 *   schtasks /create /tn "DNSHE Auto Renew" /tr "node C:\Users\hawpe\CascadeProjects\soulmate\scripts\dnshe-auto-renew.mjs" /sc weekly /d MON /st 03:00 /rl HIGHEST
 */

import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_FILE = join(__dirname, 'dnshe-renewal.log');

const API_KEY = 'cfsd_a541f496f7ae73cac43d26001a5a0547';
const API_SECRET = 'd1b683f991058ac8084968dfe4f96fea6fe254709ae5f9e35ca40fc44de1a937';
const API_BASE = 'https://api005.dnshe.com/index.php?m=domain_hub';
const SUBDOMAIN_ID = 6112039233;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

function apiRequest(endpoint, action, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}&endpoint=${endpoint}&action=${action}`);
    const headers = {
      'X-API-Key': API_KEY,
      'X-API-Secret': API_SECRET,
      'User-Agent': 'DNSHE-AutoRenew/1.0',
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  log('=== DNSHE Auto-Renewal Check ===');

  // Step 1: Get subdomain details
  const details = await apiRequest('subdomains', `get&subdomain_id=${SUBDOMAIN_ID}`, 'GET');
  
  if (!details.success) {
    log(`ERROR: Failed to get domain details: ${JSON.stringify(details)}`);
    process.exit(1);
  }

  const subdomain = details.subdomain;
  log(`Domain: ${subdomain.full_domain}`);
  log(`Status: ${subdomain.status}`);
  
  // Get expiration info from list endpoint (includes expires_at)
  const listResult = await apiRequest('subdomains', 'list', 'GET');
  if (listResult.success && listResult.subdomains) {
    const ourDomain = listResult.subdomains.find(s => s.id === SUBDOMAIN_ID);
    if (ourDomain) {
      const expiresAt = new Date(ourDomain.expires_at);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
      
      log(`Expires at: ${ourDomain.expires_at}`);
      log(`Days until expiry: ${daysUntilExpiry}`);
      log(`Never expires: ${ourDomain.never_expires}`);
      
      if (ourDomain.never_expires) {
        log('Domain is marked as never-expires. No renewal needed.');
        return;
      }
      
      // Renew if within 180 days of expiration
      if (daysUntilExpiry <= 180 && daysUntilExpiry > 0) {
        log(`Within renewal window (${daysUntilExpiry} days left). Renewing...`);
        
        const renewResult = await apiRequest('subdomains', 'renew', 'POST', JSON.stringify({ subdomain_id: SUBDOMAIN_ID }));
        
        if (renewResult.success) {
          log(`RENEWAL SUCCESS! New expiration: ${renewResult.new_expires_at}`);
          log(`Charged: ${renewResult.charged_amount} (0 = free)`);
        } else {
          log(`RENEWAL FAILED: ${JSON.stringify(renewResult)}`);
          
          // If renewal not yet available, that's fine - try again next week
          if (renewResult.error_code === 'renewal_not_yet_available') {
            log('Renewal window not open yet. Will retry next week.');
          } else {
            process.exit(1);
          }
        }
      } else if (daysUntilExpiry <= 0) {
        log(`WARNING: Domain has EXPIRED! Manual intervention needed.`);
        process.exit(1);
      } else {
        log(`Plenty of time left (${daysUntilExpiry} days). No renewal needed yet.`);
      }
    } else {
      log(`ERROR: Could not find domain ID ${SUBDOMAIN_ID} in list`);
      process.exit(1);
    }
  } else {
    log(`ERROR: Failed to list subdomains: ${JSON.stringify(listResult)}`);
    process.exit(1);
  }

  log('=== Check Complete ===');
}

main().catch((e) => {
  log(`FATAL ERROR: ${e.message}`);
  process.exit(1);
});
