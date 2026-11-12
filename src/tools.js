// STEP 2 - Tools. Plain functions the LLM can call. All maths lives HERE,
// never in the LLM, so numbers cannot be hallucinated.
const d = require("./data/seller");

const pct = (a, b) => Math.round(((b - a) / a) * 1000) / 10;

function getSalesMetrics() {
  const m = d.metrics;
  const lostOrders = m.orders.last - m.orders.now;
  const priceChanged = m.avgSellingPrice.last !== m.avgSellingPrice.now;
  const oosOrders = d.outOfStockItems.reduce((s, i) => s + i.monthlyOrders, 0);
  return {
    sales: { ...m.sales, changePct: pct(m.sales.last, m.sales.now) },
    orders: { ...m.orders, changePct: pct(m.orders.last, m.orders.now) },
    cancellationRatePct: m.cancellationRatePct,
    avgSellingPrice: m.avgSellingPrice,
    outOfStockProducts: m.outOfStock,
    sellerRating: d.assumptions.sellerRating,
    adSpend: d.assumptions.adSpend,
    competitorPriceGap: d.assumptions.competitorPriceGap,
    diagnosis: {
      priceIsDriver: priceChanged,
      lostOrders,
      topOutOfStockMonthlyOrders: oosOrders,
      rankedCauses: [
        "Stock-outs: out-of-stock products went from 5 to 18, hitting best sellers",
        "Cancellations: rate went from 8% to 14%, mostly because the seller could not fulfil",
        "Visibility: rating fell and ad spend went to zero",
      ],
      note: priceChanged ? "Price changed" : "Average price unchanged, so do not recommend price cuts unless the seller says otherwise",
    },
  };
}

function getOutOfStockItems() {
  return d.outOfStockItems.map((i) => ({ ...i, monthlyRevenueAtStake: i.monthlyOrders * d.metrics.avgSellingPrice.now }));
}

function getCancellationReasons() {
  return d.cancellationReasons;
}

function defaultSummary(escalated = false) {
  return {
    issues: [
      "Sales and orders are both down 32.5 percent while average price is steady at 500 rupees, so this is a volume problem, not a pricing problem.",
      "Out-of-stock products rose from 5 to 18, and the top five missing items sold about 136 orders a month.",
      "Cancellations rose from 8 to 14 percent, mostly stock-related, and the seller rating fell to 3.9.",
    ],
    actions: [
      "Restock the top five items first: steel bottle, tawa, spatula set, lunch box and jar set.",
      "Update inventory daily and set a realistic dispatch time to bring cancellations under 8 percent.",
      "Once restocked, run a small promotion of about 4,000 rupees to regain search visibility.",
    ],
    nextSteps: escalated
      ? ["A human account manager will call you back within one working day.", "Your case notes have been saved."]
      : ["Submit your restock plan within 3 days.", "Check-in call with the Virtual KAM on Friday to review orders and cancellations."],
  };
}

// Registry used by the LLM layer
const registry = {
  get_sales_metrics: () => getSalesMetrics(),
  get_out_of_stock_items: () => getOutOfStockItems(),
  get_cancellation_reasons: () => getCancellationReasons(),
};

module.exports = { getSalesMetrics, getOutOfStockItems, getCancellationReasons, defaultSummary, registry, pct };
