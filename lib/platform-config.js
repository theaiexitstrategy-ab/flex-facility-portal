// Single source of truth for fee logic, platform constants, and the
// product catalog. Mirrored at theflexfacility/lib/platform-config.js
// (CommonJS over there to match that repo's module style).
//
// NEVER hardcode fee values anywhere else — import from here.

export const PLATFORM_FEE_PCT = 0.07;
export const GO_ELEV8_STRIPE_ACCOUNT_ID = process.env.GO_ELEV8_STRIPE_ACCOUNT_ID;

// Covers Stripe's 2.9% + $0.30 processing fee. Charged to the customer
// as a separate line item on top of the list price (NOT absorbed by
// the merchant).
export function calcTransactionFee(listPriceCents) {
  return Math.round(listPriceCents * 0.029) + 30;
}

// 7% of the list price (not the grossed-up total). Passed to Stripe
// as application_fee_amount on the payment intent, deducted from the
// merchant's payout via Stripe Connect.
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
