'use client';

// Stock Take now lives inside the Stock page (a toggle next to Daily
// Register), matching the "keep it in the Stock section" request — this
// route is kept working for anyone with an old bookmark/link, just
// delegating to the same panel component instead of duplicating the UI.
import StockTakePanel from '../stock/StockTakePanel';

export default function StockTakeRoute() {
  return <StockTakePanel />;
}
