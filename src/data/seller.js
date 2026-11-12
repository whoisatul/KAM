// STEP 1 - Mock data. The first block is from the assignment; the rest are
// ASSUMPTIONS (state them in your note).
module.exports = {
    seller: { name: "Ravi Kumar", store: "Kumar Home Essentials", category: "Home & Kitchen", listings: 60 },
    // From the assignment
    metrics: {
      sales: { last: 200000, now: 135000 },
      orders: { last: 400, now: 270 },
      cancellationRatePct: { last: 8, now: 14 },
      avgSellingPrice: { last: 500, now: 500 },
      outOfStock: { last: 5, now: 18 },
    },
    // Assumptions
    assumptions: {
      sellerRating: { last: 4.3, now: 3.9 },
      adSpend: { last: 4000, now: 0 },
      competitorPriceGap: "within 3 percent either way",
    },
    outOfStockItems: [
      { sku: "Steel water bottle 1L", monthlyOrders: 38 },
      { sku: "Non-stick tawa", monthlyOrders: 31 },
      { sku: "Silicone spatula set", monthlyOrders: 26 },
      { sku: "Glass lunch box", monthlyOrders: 22 },
      { sku: "Storage jar set", monthlyOrders: 19 },
    ],
    cancellationReasons: [
      { reason: "Seller could not fulfil (out of stock)", pct: 62 },
      { reason: "Delayed dispatch", pct: 23 },
      { reason: "Customer changed mind", pct: 15 },
    ],
  };
  