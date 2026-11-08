import { market } from "@/config/market";
import { IndonesiaHome } from "./id/home";
import { MalaysiaHome } from "./my/home";
import type { HomeData } from "./types";

/**
 * Picks the composition for whichever market this build serves.
 *
 * A plain lookup rather than a dynamic import: the market is fixed at build
 * time by `NEXT_PUBLIC_MARKET`, so the bundler can drop the other market's
 * component entirely. A dynamic import would defer that decision to runtime
 * and ship both.
 */
const HOMES: Record<string, (data: HomeData) => Promise<React.JSX.Element>> = {
  ID: IndonesiaHome,
  MY: MalaysiaHome,
};

export const MarketHome = HOMES[market.country];

export type { HomeData };
