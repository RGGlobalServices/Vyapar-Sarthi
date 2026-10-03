import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { getThresholds, parseThresholds, saveThresholds, DEFAULT_THRESHOLDS } from '@/lib/server/qualityConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Quality / Lab flag limits of this shop.
 * GET -> { thresholds, defaults, custom, canCustomize }
 * PUT { thresholds } -> save this shop's own limits; PUT { reset: true } -> back to the defaults.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  return json({ ...(await getThresholds(shop.id)), defaults: DEFAULT_THRESHOLDS });
});

export const PUT = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  if (body?.reset) await saveThresholds(shop.id, null);
  else await saveThresholds(shop.id, parseThresholds(body?.thresholds));
  return json({ ...(await getThresholds(shop.id)), defaults: DEFAULT_THRESHOLDS });
});
