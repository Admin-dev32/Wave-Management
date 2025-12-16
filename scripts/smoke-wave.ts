/*
 * Simple smoke test for local dev server.
 * Requires INTERNAL_API_SECRET and optional BASE_URL (defaults to http://localhost:3000).
 */

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const secret = process.env.INTERNAL_API_SECRET;

if (!secret) {
  console.error('Missing INTERNAL_API_SECRET environment variable');
  process.exit(1);
}

async function fetchJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'x-internal-secret': secret,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('Running smoke tests against', baseUrl);
  const businesses = await fetchJson('/api/wave/businesses');
  console.log('Businesses response:', businesses);
  const firstBusiness = businesses.businesses?.[0];
  if (!firstBusiness) {
    console.error('No businesses returned');
    process.exit(1);
  }
  const accounts = await fetchJson(`/api/wave/accounts?types=EXPENSE&businessId=${encodeURIComponent(firstBusiness.id)}`);
  console.log('Accounts response:', accounts);
  console.log('Smoke test complete');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});

export {};
