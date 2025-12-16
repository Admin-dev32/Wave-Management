import { AccountSummary } from './wave';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function contains(haystack: string, needle: string) {
  return normalize(haystack).includes(normalize(needle));
}

export function rankExpenseAccounts(accounts: AccountSummary[], context: { text?: string; vendor?: string; categoryHint?: string; topK?: number }) {
  const { text, vendor, categoryHint, topK = 5 } = context;
  const signals = [text, vendor, categoryHint].filter(Boolean) as string[];
  const normalizedSignals = signals.map(normalize).filter(Boolean);

  const scored = accounts
    .filter((a) => a.type === 'EXPENSE')
    .map((account) => {
      const nameNorm = normalize(account.name);
      let score = 0;
      const reasons: string[] = [];
      normalizedSignals.forEach((signal) => {
        if (nameNorm.includes(signal)) {
          score += 3;
          reasons.push(`name matches ${signal}`);
        } else if (account.subtype && contains(account.subtype, signal)) {
          score += 2;
          reasons.push(`subtype matches ${signal}`);
        } else {
          const words = signal.split(' ');
          const overlap = words.filter((w) => w && nameNorm.includes(w)).length;
          if (overlap > 0) {
            score += overlap;
            reasons.push(`partial match on ${overlap} tokens`);
          }
        }
      });
      return { account, score, reason: reasons.join('; ') || 'default' };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s) => ({ accountId: s.account.id, name: s.account.name, type: s.account.type, score: s.score, reason: s.reason }));
}

export function suggestAnchor(accounts: AccountSummary[]) {
  const preferredKeywords = ['bank', 'cash', 'checking', 'savings', 'card', 'credit'];
  const anchors = accounts.filter((a) => a.type === 'ASSET' || a.type === 'LIABILITY');
  const scored = anchors
    .map((account) => {
      const nameNorm = normalize(account.name);
      const score = preferredKeywords.filter((k) => nameNorm.includes(k)).length;
      return { account, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => ({ accountId: s.account.id, name: s.account.name, type: s.account.type, score: s.score }));
}
