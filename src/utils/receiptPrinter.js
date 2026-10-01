/**
 * Receipt printing - bridge only.
 *
 * The local Windows bridge (printer-bridge/) drives the RETSOL RTP-81 over raw
 * ESC/POS: silent, instant, feeds and partial-cuts. It is the ONLY print path.
 *
 * There is deliberately no browser-print fallback. The browser dialog prints to
 * whatever Windows has set as the default printer, which on a POS machine is
 * rarely the receipt printer, and it cannot cut the paper. A receipt that comes
 * out of the wrong device is worse than a clear "the printer is not running",
 * so when the bridge is down printReceipt throws and the caller says so.
 *
 * A failed print never loses a sale: the sale is written to the database first,
 * and can be reprinted from Sales Reports once the bridge is back.
 */
const PRINTER_BRIDGE_URL = "http://127.0.0.1:9101";

// Generous, because nothing masks a slow printer now that the fallback is gone:
// this covers the bridge spooling the job to the device, not just accepting it.
const PRINT_TIMEOUT_MS = 15000;
const HEALTH_TIMEOUT_MS = 1500;

const BRIDGE_DOWN_HINT =
  'The printer bridge is not running. Start it on this machine with "npm run printer-bridge", then reprint from Sales Reports.';

/* ------------------------------------------------------------------ bridge */

export async function printReceipt(bill, settings, reprint = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${PRINTER_BRIDGE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        saleId: bill.transactionId || `${bill.billNumber}-${bill.createdDate}`,
        shopName: settings.shopName || "",
        shopAddress: settings.address || "",
        shopPhone: settings.phone || "",
        gstNumber: settings.gstNumber || "",
        upiId: settings.upiId || "",
        billNumber: bill.billNumber,
        billDate: bill.createdDate,
        customerName: bill.customerName || "",
        reprint,
        paymentMode: bill.paymentMode,
        subtotal: bill.subtotal,
        gstAmount: bill.gstAmount,
        discountAmount: bill.discountAmount,
        grandTotal: bill.grandTotal,
        collectedAmount: bill.collectedAmount,
        items: (bill.items || []).map(({ name, price, quantity }) => ({ name, price, quantity })),
      }),
    });
  } catch (error) {
    // fetch rejects for an aborted request and for "nothing is listening".
    // Both mean the same thing to the person at the till.
    throw new Error(
      error.name === "AbortError"
        ? `The printer did not respond within ${PRINT_TIMEOUT_MS / 1000} seconds. Check that it is on and has paper.`
        : BRIDGE_DOWN_HINT,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim() || `The printer bridge returned an error (${response.status}).`);
  }

  return { printed: true };
}

/** True when the local bridge is reachable - used to show a status pill. */
export async function checkBridge() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${PRINTER_BRIDGE_URL}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
