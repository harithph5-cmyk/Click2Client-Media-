// Payment architecture.
//
// Today: manual UPI. The customer scans the admin-configured QR, sends a
// screenshot on WhatsApp, and an admin verifies the payment in the portal.
// Nothing is marked paid automatically.
//
// Later: add a gateway adapter (Razorpay / Cashfree / PayU / Stripe for
// international cards) implementing the interface below, set PAYMENT_GATEWAY,
// and verify webhooks with the provider's signing secret before calling
// markVerified(). Keys stay in environment variables.

export const MANUAL = 'manual_upi';

/**
 * @typedef {Object} GatewayAdapter
 * @property {(order:{id:string, amount:number, currency:string, email:string}) => Promise<{checkoutUrl:string, providerOrderId:string}>} createCheckout
 * @property {(rawBody:Buffer, headers:object) => {valid:boolean, orderId?:string, transactionId?:string}} verifyWebhook
 */

/** @type {Record<string, GatewayAdapter>} */
export const gateways = {};

export function activeGateway() {
  return gateways[process.env.PAYMENT_GATEWAY] || null;
}

/** Builds a standard UPI deep link. The amount always comes from the server. */
export function upiLink({ upiId, payeeName, amount, note }) {
  if (!upiId) return null;
  const p = new URLSearchParams({ pa: upiId, pn: payeeName || '', am: String(amount), cu: 'INR', tn: note || '' });
  return `upi://pay?${p}`;
}
