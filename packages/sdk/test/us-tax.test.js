import { test } from "node:test";
import assert from "node:assert/strict";
import {
  usSalesTaxTask,
  usFederalTaxTask,
  STATE_TAX,
  BRACKETS_2024,
  STANDARD_DEDUCTION_2024,
} from "../src/tasks/us-tax.js";
import { getTask, listTasks } from "../src/tasks.js";

// ─── shared helpers ───────────────────────────────────────────────────

function cart(items, sellerState, buyerState = "NY", taxType = "sales") {
  return [JSON.stringify(items), { context: { sellerState, buyerState, taxType } }];
}

function singleItem(category, unitPrice = 100, qty = 1) {
  return [{ name: "Test item", qty, unitPrice, category }];
}

// ─── task: us-sales-tax ───────────────────────────────────────────────

test("us-sales-tax: general merchandise is taxed at full state rate", () => {
  const [input, opts] = cart(singleItem("general", 100), "CA");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.source, "rule");
  assert.equal(r.confidence, 1.0);
  // CA state rate is 7.25%
  assert.ok(r.fields.stateTax > 0);
  assert.equal(r.fields.breakdown[0].stateRate, 0.0725);
  assert.equal(r.fields.breakdown[0].exempt, false);
});

test("us-sales-tax: groceries are exempt in California", () => {
  const [input, opts] = cart(singleItem("grocery", 100), "CA");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].stateRate, 0);
  assert.equal(r.fields.breakdown[0].exempt, true);
  assert.equal(r.fields.stateTax, 0);
  assert.equal(r.fields.totalTax, 0);
});

test("us-sales-tax: groceries are exempt in New York", () => {
  const [input, opts] = cart(singleItem("grocery", 100), "NY");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].exempt, true);
  assert.equal(r.fields.totalTax, 0);
});

test("us-sales-tax: groceries are taxed in Mississippi (no exemption)", () => {
  const [input, opts] = cart(singleItem("grocery", 100), "MS");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].exempt, false);
  assert.ok(r.fields.stateTax > 0);
});

test("us-sales-tax: clothing is exempt in Pennsylvania", () => {
  const [input, opts] = cart(singleItem("clothing", 100), "PA");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].exempt, true);
  assert.equal(r.fields.totalTax, 0);
});

test("us-sales-tax: clothing is exempt in Minnesota", () => {
  const [input, opts] = cart(singleItem("clothing", 100), "MN");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].exempt, true);
});

test("us-sales-tax: clothing is taxable in Texas", () => {
  const [input, opts] = cart(singleItem("clothing", 100), "TX");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].exempt, false);
  assert.ok(r.fields.stateTax > 0);
});

test("us-sales-tax: medicine is exempt in all standard states", () => {
  for (const code of ["CA", "TX", "NY", "FL", "WA", "OR", "PA"]) {
    const [input, opts] = cart(singleItem("medicine", 100), code);
    const r = usSalesTaxTask.fast(input, opts.context);
    assert.ok(r, `${code} should return a result`);
    assert.equal(r.fields.breakdown[0].exempt, true, `medicine should be exempt in ${code}`);
  }
});

test("us-sales-tax: Oregon and New Hampshire have no sales tax", () => {
  for (const code of ["OR", "NH"]) {
    const [input, opts] = cart(singleItem("general", 100), code);
    const r = usSalesTaxTask.fast(input, opts.context);
    assert.ok(r);
    assert.equal(r.fields.stateRate, 0);
    assert.equal(r.fields.totalTax, 0);
  }
});

test("us-sales-tax: Arkansas groceries use reduced rate (not full 6.5%)", () => {
  const [input, opts] = cart(singleItem("grocery", 100), "AR");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  // Full AR rate is 6.5%; reduced grocery rate is 0.125%
  assert.ok(r.fields.breakdown[0].stateRate < 0.065);
  assert.ok(r.fields.breakdown[0].stateRate > 0);
});

test("us-sales-tax: Illinois medicine uses reduced rate (1%, not 6.25%)", () => {
  const [input, opts] = cart(singleItem("medicine", 100), "IL");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.breakdown[0].stateRate, 0.01);
  assert.ok(r.fields.stateTax > 0);
});

test("us-sales-tax: multi-item cart aggregates correctly", () => {
  const items = [
    { name: "Laptop",  qty: 1, unitPrice: 1000, category: "general" },
    { name: "Milk",    qty: 2, unitPrice: 5,    category: "grocery" },  // exempt in CA
    { name: "Aspirin", qty: 1, unitPrice: 10,   category: "medicine" }, // exempt
  ];
  const [input, opts] = cart(items, "CA");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.equal(r.fields.subtotal, 1020); // 1000 + 10 + 10
  // Only the laptop ($1000) is taxable at 7.25%
  assert.ok(Math.abs(r.fields.stateTax - 72.50) < 0.01);
  assert.equal(r.fields.grandTotal, r.fields.subtotal + r.fields.totalTax);
});

test("us-sales-tax: grand total equals subtotal + total tax", () => {
  const items = [
    { name: "Widget A", qty: 3, unitPrice: 49.99, category: "general" },
    { name: "Widget B", qty: 1, unitPrice: 199.00, category: "digital" },
  ];
  const [input, opts] = cart(items, "TX");
  const r = usSalesTaxTask.fast(input, opts.context);
  assert.ok(r);
  assert.ok(Math.abs(r.fields.grandTotal - (r.fields.subtotal + r.fields.totalTax)) < 0.01);
});

test("us-sales-tax: use tax applies buyer-state rates", () => {
  const items = singleItem("general", 100);
  // Sales tax: seller state CA (7.25%)
  const rSales = usSalesTaxTask.fast(JSON.stringify(items), { sellerState: "CA", buyerState: "OR", taxType: "sales" });
  // Use tax: buyer state OR (0%)
  const rUse   = usSalesTaxTask.fast(JSON.stringify(items), { sellerState: "CA", buyerState: "OR", taxType: "use" });

  assert.ok(rSales);
  assert.ok(rUse);
  assert.ok(rSales.fields.stateTax > 0);  // CA taxes it
  assert.equal(rUse.fields.stateTax, 0);   // OR has no sales tax
});

test("us-sales-tax: empty cart returns zeroed result", () => {
  const r = usSalesTaxTask.fast("[]", { sellerState: "CA" });
  assert.ok(r);
  assert.equal(r.fields.subtotal, 0);
  assert.equal(r.fields.totalTax, 0);
  assert.equal(r.fields.grandTotal, 0);
  assert.deepEqual(r.fields.breakdown, []);
});

test("us-sales-tax: unknown state returns null", () => {
  const r = usSalesTaxTask.fast("[]", { sellerState: "XX" });
  assert.equal(r, null);
});

test("us-sales-tax: invalid JSON returns null", () => {
  const r = usSalesTaxTask.fast("not json", { sellerState: "CA" });
  assert.equal(r, null);
});

test("us-sales-tax: all 50 states + DC are in STATE_TAX", () => {
  const expected = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
  ];
  for (const code of expected) {
    assert.ok(STATE_TAX.has(code), `${code} missing from STATE_TAX`);
  }
  assert.equal(STATE_TAX.size, 51); // 50 states + DC
});

test("us-sales-tax: slow() returns null when engine lacks complete()", async () => {
  const r = await usSalesTaxTask.slow("[]", { sellerState: "CA" }, {});
  assert.equal(r, null);
});

test("us-sales-tax: slow() parses JSON from model reply", async () => {
  const engine = {
    async complete() {
      return 'Here is the breakdown: {"subtotal":100,"stateTax":7.25,"countyTax":1.57,"totalTax":8.82,"grandTotal":108.82}';
    },
  };
  const r = await usSalesTaxTask.slow(
    JSON.stringify(singleItem("general", 100)),
    { sellerState: "CA" },
    engine,
  );
  assert.ok(r);
  assert.equal(r.source, "model");
  assert.equal(r.fields.grandTotal, 108.82);
});

// ─── task: us-federal-tax ────────────────────────────────────────────

test("us-federal-tax: single filer, 75k gross income", () => {
  const r = usFederalTaxTask.fast("75000", { filingStatus: "single" });
  assert.ok(r);
  assert.equal(r.source, "rule");
  assert.equal(r.confidence, 1.0);
  // Standard deduction 2024 single: $14,600
  assert.equal(r.fields.standardDeduction, 14600);
  assert.equal(r.fields.taxableIncome, 75000 - 14600); // 60400
  // Marginal bracket: 22% (47,150–100,525)
  assert.equal(r.fields.marginalRate, 0.22);
  assert.ok(r.fields.taxOwed > 0);
  assert.ok(r.fields.effectiveRate > 0 && r.fields.effectiveRate < 0.22);
});

test("us-federal-tax: marginal brackets are split correctly", () => {
  // $50,000 gross → $35,400 taxable (single)
  // 10% on first $11,600 = $1,160
  // 12% on $11,601–$35,400 = 12% × (35400-11600) = 12% × 23800 = $2,856
  // Total: $4,016
  const r = usFederalTaxTask.fast("50000", { filingStatus: "single" });
  assert.ok(r);
  const taxable = 50000 - 14600; // 35400
  assert.equal(r.fields.taxableIncome, taxable);
  const expected =
    11600 * 0.10 +
    (taxable - 11600) * 0.12;
  assert.ok(Math.abs(r.fields.taxOwed - expected) < 0.01);
  assert.equal(r.fields.marginalRate, 0.12);
});

test("us-federal-tax: married filing jointly has double thresholds", () => {
  // At $50k gross, single hits 12% bracket; MFJ stays in 10% bracket
  const rSingle = usFederalTaxTask.fast("50000", { filingStatus: "single" });
  const rMFJ    = usFederalTaxTask.fast("50000", { filingStatus: "married_jointly" });
  assert.ok(rSingle);
  assert.ok(rMFJ);
  // MFJ standard deduction: $29,200 → taxable: $20,800 → stays in 10%
  assert.equal(rMFJ.fields.standardDeduction, 29200);
  assert.equal(rMFJ.fields.marginalRate, 0.10);
  // MFJ owes less than single at same income
  assert.ok(rMFJ.fields.taxOwed < rSingle.fields.taxOwed);
});

test("us-federal-tax: income below standard deduction → zero tax", () => {
  const r = usFederalTaxTask.fast("10000", { filingStatus: "single" });
  assert.ok(r);
  assert.equal(r.fields.taxableIncome, 0);
  assert.equal(r.fields.taxOwed, 0);
  assert.equal(r.fields.effectiveRate, 0);
});

test("us-federal-tax: high income hits 37% bracket (single)", () => {
  const r = usFederalTaxTask.fast("700000", { filingStatus: "single" });
  assert.ok(r);
  assert.equal(r.fields.marginalRate, 0.37);
});

test("us-federal-tax: effective rate is always < marginal rate", () => {
  for (const income of ["50000", "100000", "250000", "500000"]) {
    const r = usFederalTaxTask.fast(income, { filingStatus: "single" });
    assert.ok(r);
    if (r.fields.taxOwed > 0) {
      assert.ok(
        r.fields.effectiveRate < r.fields.marginalRate,
        `effectiveRate (${r.fields.effectiveRate}) should be < marginalRate (${r.fields.marginalRate}) at $${income}`
      );
    }
  }
});

test("us-federal-tax: head of household has intermediate thresholds", () => {
  const rS   = usFederalTaxTask.fast("100000", { filingStatus: "single" });
  const rHOH = usFederalTaxTask.fast("100000", { filingStatus: "head_of_household" });
  const rMFJ = usFederalTaxTask.fast("100000", { filingStatus: "married_jointly" });
  assert.ok(rS && rHOH && rMFJ);
  // HOH deduction: $21,900; between single ($14,600) and MFJ ($29,200)
  assert.equal(rHOH.fields.standardDeduction, 21900);
  assert.ok(rHOH.fields.taxOwed < rS.fields.taxOwed);
  assert.ok(rHOH.fields.taxOwed > rMFJ.fields.taxOwed);
});

test("us-federal-tax: brackets array covers all income", () => {
  const r = usFederalTaxTask.fast("500000", { filingStatus: "single" });
  assert.ok(r);
  // Sum of taxable amounts across brackets should equal taxableIncome
  const sumTaxable = r.fields.brackets.reduce((s, b) => s + b.taxableAmount, 0);
  assert.ok(Math.abs(sumTaxable - r.fields.taxableIncome) < 0.01);
  // Sum of tax amounts should equal taxOwed
  const sumTax = r.fields.brackets.reduce((s, b) => s + b.taxAmount, 0);
  assert.ok(Math.abs(sumTax - r.fields.taxOwed) < 0.01);
});

test("us-federal-tax: zero income returns zeroed result", () => {
  const r = usFederalTaxTask.fast("0", { filingStatus: "single" });
  assert.ok(r);
  assert.equal(r.fields.taxOwed, 0);
  assert.equal(r.fields.effectiveRate, 0);
  assert.equal(r.fields.grossIncome, 0);
});

test("us-federal-tax: negative or non-numeric input returns null", () => {
  assert.equal(usFederalTaxTask.fast("-1000", { filingStatus: "single" }), null);
  assert.equal(usFederalTaxTask.fast("abc", { filingStatus: "single" }), null);
  assert.equal(usFederalTaxTask.fast("", { filingStatus: "single" }), null);
});

test("us-federal-tax: invalid filing status returns null", () => {
  const r = usFederalTaxTask.fast("75000", { filingStatus: "unknown_status" });
  assert.equal(r, null);
});

test("us-federal-tax: defaults to single when filingStatus is omitted", () => {
  const rDefault = usFederalTaxTask.fast("75000", {});
  const rSingle  = usFederalTaxTask.fast("75000", { filingStatus: "single" });
  assert.ok(rDefault);
  assert.equal(rDefault.fields.taxOwed, rSingle.fields.taxOwed);
});

test("us-federal-tax: BRACKETS_2024 and STANDARD_DEDUCTION_2024 are exported correctly", () => {
  assert.ok(BRACKETS_2024.single);
  assert.ok(BRACKETS_2024.married_jointly);
  assert.ok(BRACKETS_2024.head_of_household);
  assert.equal(STANDARD_DEDUCTION_2024.single, 14600);
  assert.equal(STANDARD_DEDUCTION_2024.married_jointly, 29200);
  assert.equal(STANDARD_DEDUCTION_2024.head_of_household, 21900);
});

test("us-federal-tax: slow() returns null when engine lacks complete()", async () => {
  const r = await usFederalTaxTask.slow("75000", { filingStatus: "single" }, {});
  assert.equal(r, null);
});

test("us-federal-tax: slow() parses JSON from model reply", async () => {
  const engine = {
    async complete() {
      return 'Tax calculation: {"grossIncome":75000,"standardDeduction":14600,"taxableIncome":60400,"taxOwed":8832,"effectiveRate":0.1178,"marginalRate":0.22}';
    },
  };
  const r = await usFederalTaxTask.slow("75000", { filingStatus: "single" }, engine);
  assert.ok(r);
  assert.equal(r.source, "model");
  assert.equal(r.fields.taxOwed, 8832);
});

// ─── registry ─────────────────────────────────────────────────────────

test("registry: us-sales-tax and us-federal-tax are registered", () => {
  assert.ok(getTask("us-sales-tax"));
  assert.ok(getTask("us-federal-tax"));
});

test("registry: listTasks includes the new US tax tasks", () => {
  const ids = listTasks().map((t) => t.id);
  assert.ok(ids.includes("us-sales-tax"));
  assert.ok(ids.includes("us-federal-tax"));
});
