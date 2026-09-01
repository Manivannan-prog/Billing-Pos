const PRINTER_BRIDGE_URL = "http://127.0.0.1:9101";

export const printThermalReceipt = async (bill, settings, reprint = false) => {
  const response = await fetch(`${PRINTER_BRIDGE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      saleId: `${bill.billNumber}-${bill.createdDate}`,
      shopName: settings.shopName || "Biriyani Billing Software",
      shopAddress: settings.address || "",
      shopPhone: settings.phone || "",
      gstNumber: settings.gstNumber || "",
      billNumber: bill.billNumber,
      billDate: bill.createdDate,
      reprint,
      paymentMode: bill.paymentMode,
      subtotal: bill.subtotal,
      gstAmount: bill.gstAmount,
      discountAmount: bill.discountAmount,
      grandTotal: bill.grandTotal,
      items: (bill.items || []).map(({ name, price, quantity }) => ({ name, price, quantity })),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "The local receipt printer bridge is unavailable.");
  }
};

export const printerBridgeError = (error) =>
  `Receipt was saved, but it was not printed. Start the local printer bridge and retry. ${error.message}`;
