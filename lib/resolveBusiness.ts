import { getCache, setCache } from './cache';
import { ApiError } from './errors';
import { BusinessSummary, fetchBusinesses } from './wave';

const BUSINESSES_TTL = 15 * 60 * 1000;

export async function resolveBusiness(
  { businessId, businessName }: { businessId?: string; businessName?: string },
  requestId?: string,
): Promise<{ business: BusinessSummary; multiple: BusinessSummary[] | null }> {
  const cacheKey = 'businesses';
  let businesses = getCache<BusinessSummary[]>(cacheKey);
  if (!businesses) {
    businesses = await fetchBusinesses(requestId);
    setCache(cacheKey, businesses, BUSINESSES_TTL);
  }

  if (businessId) {
    const found = businesses.find((b) => b.id === businessId);
    if (!found) throw new ApiError(404, 'Business not found');
    return { business: found, multiple: null };
  }

  if (businessName) {
    const matches = businesses.filter((b) => b.name.toLowerCase() === businessName.toLowerCase());
    if (matches.length === 1) {
      return { business: matches[0], multiple: null };
    }
    if (matches.length > 1) {
      throw new ApiError(300, 'Multiple businesses match name', { options: matches });
    }
  }

  const active = businesses.filter((b) => b.isActive);
  if (active.length === 1) {
    return { business: active[0], multiple: null };
  }
  throw new ApiError(300, 'Multiple businesses available, please choose', { options: active });
}
