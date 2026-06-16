// Single source of truth for fee logic, platform constants, and the
// product catalog. Mirrored at theflexfacility/lib/platform-config.js
// (CommonJS over there to match that repo's module style).
//
// NEVER hardcode fee values anywhere else — import from here.
//
// FEE MODEL — every checkout has exactly two fees beyond the list
// price:
//   1. SERVICE FEE  — flat $3 (SERVICE_FEE_CENTS), shown to the
//      customer at checkout. Covers Stripe's per-transaction processing
//      cost plus a small operational margin. Always stays on the
//      platform side via application_fee_amount.
//   2. PLATFORM FEE — 10% of the list price (PLATFORM_FEE_PCT). Also
//      stays on the platform side via application_fee_amount; this is
//      GoElev8's revenue share.
//
// Customer pays   = list + service fee.
// Kenny nets      = list − platformFee (= 90% of list).

export const PLATFORM_FEE_PCT = 0.10;
export const GO_ELEV8_STRIPE_ACCOUNT_ID = process.env.GO_ELEV8_STRIPE_ACCOUNT_ID;

// Flat per-order fee shown to the customer at checkout. Env var allows
// adjusting without redeploying code; default $3.
export const SERVICE_FEE_CENTS = parseInt(process.env.SERVICE_FEE_CENTS || '300', 10);

// Service fee charged to the customer on top of the list price.
// Internal callers still use the calcTransactionFee name for backward
// compatibility with existing code paths; the customer-facing label
// is "Service fee".
export function calcTransactionFee(_listPriceCents) {
  return SERVICE_FEE_CENTS;
}

// 10% of the list price (not the grossed-up total). Passed to Stripe
// as part of application_fee_amount on the payment intent, deducted
// from the merchant's payout via Stripe Connect.
export function calcPlatformFee(listPriceCents) {
  return Math.round(listPriceCents * PLATFORM_FEE_PCT);
}

export function calcCustomerTotal(listPriceCents) {
  return listPriceCents + calcTransactionFee(listPriceCents);
}

export const PRODUCTS = {
  hoodie: {
    name: 'Flex Training Sleeveless Hoodie',
    listPriceCents: 4500,
    type: 'merch',
  },
  ebook: {
    name: 'Road to the Stage — Full Body Training Program',
    listPriceCents: 6500,
    type: 'ebook',
  },
};
