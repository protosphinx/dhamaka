// US Tax tasks — sales tax and federal income tax.
//
// Two tasks ship here:
//
//   us-sales-tax    : rules-first (static state rates → product exemptions → LLM for edge cases)
//   us-federal-tax  : rules-first (2024 bracket table → filing status → LLM for deduction edge cases)
//
// Both tasks are rules-first. The fast() path covers the deterministic head
// using static data (50-state sales tax table, 2024 IRS bracket table). The
// slow() path falls through to the LLM for complex exemptions, multi-state
// nexus, itemized deductions, credits, AMT, etc.

import { registerTask } from "../tasks.js";

// ─── State sales tax data (2024) ──────────────────────────────────────
//
// stateRate and avgLocalRate are decimal fractions (0.06 = 6%).
// exemptions: true = category is fully exempt (0%); false = taxable at stateRate.
// reducedRates: when a category is not fully exempt but taxed at a reduced rate,
// that rate is listed here (overrides stateRate for that category).
// Source: Tax Foundation 2024 State Sales Tax Rates.

const STATE_TAX = new Map([
  ["AL", { name: "Alabama",              stateRate: 0.04,    avgLocalRate: 0.0524, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }                                       }],
  ["AK", { name: "Alaska",               stateRate: 0.00,    avgLocalRate: 0.0182, exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["AZ", { name: "Arizona",              stateRate: 0.056,   avgLocalRate: 0.0277, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["AR", { name: "Arkansas",             stateRate: 0.065,   avgLocalRate: 0.0293, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }, reducedRates: { grocery: 0.00125 }   }],
  ["CA", { name: "California",           stateRate: 0.0725,  avgLocalRate: 0.0157, exemptions: { grocery: true,  clothing: false, digital: true,  medicine: true  }                                       }],
  ["CO", { name: "Colorado",             stateRate: 0.029,   avgLocalRate: 0.0487, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["CT", { name: "Connecticut",          stateRate: 0.0635,  avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["DE", { name: "Delaware",             stateRate: 0.00,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["FL", { name: "Florida",              stateRate: 0.06,    avgLocalRate: 0.0106, exemptions: { grocery: true,  clothing: false, digital: true,  medicine: true  }                                       }],
  ["GA", { name: "Georgia",              stateRate: 0.04,    avgLocalRate: 0.0335, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["HI", { name: "Hawaii",               stateRate: 0.04,    avgLocalRate: 0.0044, exemptions: { grocery: false, clothing: false, digital: false, medicine: false }                                       }],
  ["ID", { name: "Idaho",                stateRate: 0.06,    avgLocalRate: 0.0003, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }                                       }],
  ["IL", { name: "Illinois",             stateRate: 0.0625,  avgLocalRate: 0.0249, exemptions: { grocery: false, clothing: false, digital: false, medicine: false }, reducedRates: { grocery: 0.01, medicine: 0.01 } }],
  ["IN", { name: "Indiana",              stateRate: 0.07,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["IA", { name: "Iowa",                 stateRate: 0.06,    avgLocalRate: 0.0094, exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["KS", { name: "Kansas",               stateRate: 0.065,   avgLocalRate: 0.0219, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["KY", { name: "Kentucky",             stateRate: 0.06,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["LA", { name: "Louisiana",            stateRate: 0.0445,  avgLocalRate: 0.051,  exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["ME", { name: "Maine",                stateRate: 0.055,   avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["MD", { name: "Maryland",             stateRate: 0.06,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["MA", { name: "Massachusetts",        stateRate: 0.0625,  avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["MI", { name: "Michigan",             stateRate: 0.06,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["MN", { name: "Minnesota",            stateRate: 0.06875, avgLocalRate: 0.0057, exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["MS", { name: "Mississippi",          stateRate: 0.07,    avgLocalRate: 0.0007, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }                                       }],
  ["MO", { name: "Missouri",             stateRate: 0.04225, avgLocalRate: 0.039,  exemptions: { grocery: false, clothing: false, digital: true,  medicine: true  }, reducedRates: { grocery: 0.01225 }   }],
  ["MT", { name: "Montana",              stateRate: 0.00,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["NE", { name: "Nebraska",             stateRate: 0.055,   avgLocalRate: 0.0144, exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["NV", { name: "Nevada",               stateRate: 0.0685,  avgLocalRate: 0.0138, exemptions: { grocery: true,  clothing: false, digital: true,  medicine: true  }                                       }],
  ["NH", { name: "New Hampshire",        stateRate: 0.00,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["NJ", { name: "New Jersey",           stateRate: 0.06625, avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["NM", { name: "New Mexico",           stateRate: 0.05,    avgLocalRate: 0.0272, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["NY", { name: "New York",             stateRate: 0.04,    avgLocalRate: 0.0452, exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["NC", { name: "North Carolina",       stateRate: 0.0475,  avgLocalRate: 0.0222, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }, reducedRates: { grocery: 0.02 }      }],
  ["ND", { name: "North Dakota",         stateRate: 0.05,    avgLocalRate: 0.0196, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["OH", { name: "Ohio",                 stateRate: 0.0575,  avgLocalRate: 0.0143, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["OK", { name: "Oklahoma",             stateRate: 0.045,   avgLocalRate: 0.0447, exemptions: { grocery: false, clothing: false, digital: true,  medicine: true  }                                       }],
  ["OR", { name: "Oregon",               stateRate: 0.00,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["PA", { name: "Pennsylvania",         stateRate: 0.06,    avgLocalRate: 0.0034, exemptions: { grocery: true,  clothing: true,  digital: true,  medicine: true  }                                       }],
  ["RI", { name: "Rhode Island",         stateRate: 0.07,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["SC", { name: "South Carolina",       stateRate: 0.06,    avgLocalRate: 0.0143, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["SD", { name: "South Dakota",         stateRate: 0.042,   avgLocalRate: 0.019,  exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }                                       }],
  ["TN", { name: "Tennessee",            stateRate: 0.07,    avgLocalRate: 0.0255, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }, reducedRates: { grocery: 0.04 }      }],
  ["TX", { name: "Texas",                stateRate: 0.0625,  avgLocalRate: 0.0195, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["UT", { name: "Utah",                 stateRate: 0.0485,  avgLocalRate: 0.0224, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }, reducedRates: { grocery: 0.03 }      }],
  ["VT", { name: "Vermont",              stateRate: 0.06,    avgLocalRate: 0.0024, exemptions: { grocery: true,  clothing: true,  digital: false, medicine: true  }                                       }],
  ["VA", { name: "Virginia",             stateRate: 0.053,   avgLocalRate: 0.0043, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }, reducedRates: { grocery: 0.025 }     }],
  ["WA", { name: "Washington",           stateRate: 0.065,   avgLocalRate: 0.0273, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["WV", { name: "West Virginia",        stateRate: 0.06,    avgLocalRate: 0.0038, exemptions: { grocery: false, clothing: false, digital: false, medicine: true  }                                       }],
  ["WI", { name: "Wisconsin",            stateRate: 0.05,    avgLocalRate: 0.0044, exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
  ["WY", { name: "Wyoming",              stateRate: 0.04,    avgLocalRate: 0.0136, exemptions: { grocery: true,  clothing: false, digital: true,  medicine: true  }                                       }],
  ["DC", { name: "District of Columbia", stateRate: 0.06,    avgLocalRate: 0.00,   exemptions: { grocery: true,  clothing: false, digital: false, medicine: true  }                                       }],
]);

export { STATE_TAX };

// ─── Federal income tax brackets (2024) ──────────────────────────────
// Each entry: [bracketFloor, bracketCeiling (null = unlimited), rate]

const BRACKETS_2024 = {
  single: [
    [0,       11600,  0.10],
    [11600,   47150,  0.12],
    [47150,   100525, 0.22],
    [100525,  191950, 0.24],
    [191950,  243725, 0.32],
    [243725,  609350, 0.35],
    [609350,  null,   0.37],
  ],
  married_jointly: [
    [0,       23200,  0.10],
    [23200,   94300,  0.12],
    [94300,   201050, 0.22],
    [201050,  383900, 0.24],
    [383900,  487450, 0.32],
    [487450,  731200, 0.35],
    [731200,  null,   0.37],
  ],
  head_of_household: [
    [0,       16550,  0.10],
    [16550,   63100,  0.12],
    [63100,   100500, 0.22],
    [100500,  191950, 0.24],
    [191950,  243700, 0.32],
    [243700,  609350, 0.35],
    [609350,  null,   0.37],
  ],
};

const STANDARD_DEDUCTION_2024 = {
  single:             14600,
  married_jointly:    29200,
  head_of_household:  21900,
};

export { BRACKETS_2024, STANDARD_DEDUCTION_2024 };

// ─── helpers ──────────────────────────────────────────────────────────

function r2(n) { return Math.round(n * 100) / 100; }
function pct(n) { return `${(n * 100).toFixed(2)}%`; }

// Returns the effective rate for a category in the given state.
// Checks reducedRates first (partial exemption), then full exemption,
// then falls back to the full state rate.
function effectiveStateRate(stateInfo, category) {
  if (stateInfo.exemptions[category]) return 0;
  return stateInfo.reducedRates?.[category] ?? stateInfo.stateRate;
}

// Local/county tax follows the same exemption pattern as the state tax:
// if a category is fully exempt from state tax (rate === 0), it is also
// exempt from local tax in the vast majority of jurisdictions.
function effectiveLocalRate(stateInfo, category) {
  const sr = effectiveStateRate(stateInfo, category);
  return sr === 0 ? 0 : stateInfo.avgLocalRate;
}

// ─── task: us-sales-tax ───────────────────────────────────────────────
//
// Computes sales tax (or use tax) for a shopping cart.
//
// input   : JSON string of line items:
//           [{ name, qty, unitPrice, category }]
//           category: "general" | "grocery" | "clothing" | "digital" | "medicine"
//
// context : {
//   sellerState : two-letter state code (e.g. "CA")
//   buyerState  : two-letter state code (e.g. "NY")
//   taxType     : "sales" | "use"
// }
//
// For sales tax the seller state's rates apply.
// For use tax the buyer state's rates apply (simplified — real nexus rules vary).
//
// Returns fields:
//   taxState, taxStateName, subtotal, stateTax, countyTax, totalTax,
//   grandTotal, stateRate, avgLocalRate, breakdown[]

export const usSalesTaxTask = {
  id: "us-sales-tax",
  description:
    "Compute US sales or use tax for a shopping cart using state-level rates and product-category exemptions.",

  fast(input, context) {
    const { sellerState, buyerState, taxType } = context ?? {};

    // Use tax: buyer's state rates apply; sales tax: seller's state.
    const taxCode = ((taxType === "use" && buyerState ? buyerState : sellerState) ?? "").toUpperCase();
    const stateInfo = STATE_TAX.get(taxCode);
    if (!stateInfo) return null;

    let items;
    try {
      items = JSON.parse(input);
    } catch {
      return null;
    }
    if (!Array.isArray(items)) return null;
    if (!items.length) {
      return {
        confidence: 1,
        source: "rule",
        fields: {
          taxState: taxCode,
          taxStateName: stateInfo.name,
          subtotal: 0, stateTax: 0, countyTax: 0, totalTax: 0, grandTotal: 0,
          stateRate: stateInfo.stateRate,
          avgLocalRate: stateInfo.avgLocalRate,
          breakdown: [],
        },
      };
    }

    let subtotal = 0;
    let stateTaxTotal = 0;
    let countyTaxTotal = 0;
    const breakdown = [];

    for (const item of items) {
      const qty = Number(item.qty) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const lineTotal = qty * unitPrice;
      const category = item.category || "general";

      const sr = effectiveStateRate(stateInfo, category);
      const lr = effectiveLocalRate(stateInfo, category);
      const stateTax = lineTotal * sr;
      const localTax = lineTotal * lr;

      subtotal      += lineTotal;
      stateTaxTotal += stateTax;
      countyTaxTotal+= localTax;

      breakdown.push({
        name:       item.name || "Item",
        qty,
        unitPrice:  r2(unitPrice),
        lineTotal:  r2(lineTotal),
        category,
        stateRate:  sr,
        localRate:  lr,
        stateTax:   r2(stateTax),
        localTax:   r2(localTax),
        lineTax:    r2(stateTax + localTax),
        exempt:     sr === 0 && lr === 0,
      });
    }

    const totalTax  = stateTaxTotal + countyTaxTotal;
    const grandTotal= subtotal + totalTax;

    return {
      confidence: 1.0,
      source: "rule",
      fields: {
        taxState:     taxCode,
        taxStateName: stateInfo.name,
        subtotal:     r2(subtotal),
        stateTax:     r2(stateTaxTotal),
        countyTax:    r2(countyTaxTotal),
        totalTax:     r2(totalTax),
        grandTotal:   r2(grandTotal),
        stateRate:    stateInfo.stateRate,
        avgLocalRate: stateInfo.avgLocalRate,
        breakdown,
      },
    };
  },

  async slow(input, context, engine) {
    // LLM fallback for edge cases: county-specific rates, product-specific
    // exemptions (e.g. NY clothing ≤ $110, MA clothing ≤ $175), food vs.
    // candy distinctions, multi-state nexus, marketplace facilitator rules.
    if (typeof engine.complete !== "function") return null;

    const prompt = [
      "You are a US sales tax expert. A merchant needs the tax breakdown for a cart.",
      `Seller state: ${context?.sellerState ?? "unknown"}`,
      `Buyer state: ${context?.buyerState ?? "unknown"}`,
      `Tax type: ${context?.taxType ?? "sales"}`,
      `Cart items (JSON): ${input}`,
      "",
      "Return a JSON object with: subtotal, stateTax, countyTax, totalTax, grandTotal.",
      "Use 2024 rates. Round to 2 decimal places.",
      "JSON:",
    ].join("\n");

    let reply;
    try {
      reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 300 });
    } catch {
      return null;
    }
    if (!reply) return null;

    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const fields = JSON.parse(jsonMatch[0]);
      return { confidence: 0.6, source: "model", fields };
    } catch {
      return null;
    }
  },
};

// ─── task: us-federal-tax ────────────────────────────────────────────
//
// Computes 2024 US federal income tax using the standard deduction
// and marginal bracket table.
//
// input   : gross income as a numeric string (e.g. "75000")
//
// context : {
//   filingStatus : "single" | "married_jointly" | "head_of_household"
// }
//
// Returns fields:
//   grossIncome, filingStatus, standardDeduction, taxableIncome,
//   taxOwed, effectiveRate, marginalRate, brackets[]

export const usFederalTaxTask = {
  id: "us-federal-tax",
  description:
    "Compute 2024 US federal income tax using the IRS marginal bracket table and standard deduction.",

  fast(input, context) {
    const grossIncome = parseFloat(input);
    if (!isFinite(grossIncome) || grossIncome < 0) return null;

    const filingStatus = context?.filingStatus ?? "single";
    const brackets = BRACKETS_2024[filingStatus];
    if (!brackets) return null;

    const standardDeduction = STANDARD_DEDUCTION_2024[filingStatus] ?? 14600;
    const taxableIncome = Math.max(0, grossIncome - standardDeduction);

    let taxOwed = 0;
    let marginalRate = 0;
    const bracketBreakdown = [];

    for (const [lo, hi, rate] of brackets) {
      if (taxableIncome <= lo) break;
      const cap = hi === null ? taxableIncome : Math.min(taxableIncome, hi);
      const taxableInBracket = cap - lo;
      const taxInBracket = taxableInBracket * rate;
      taxOwed += taxInBracket;
      marginalRate = rate;
      bracketBreakdown.push({
        rate,
        from:          lo,
        to:            hi,
        taxableAmount: r2(taxableInBracket),
        taxAmount:     r2(taxInBracket),
      });
    }

    const effectiveRate = grossIncome > 0 ? taxOwed / grossIncome : 0;

    return {
      confidence: 1.0,
      source: "rule",
      fields: {
        grossIncome:       r2(grossIncome),
        filingStatus,
        standardDeduction,
        taxableIncome:     r2(taxableIncome),
        taxOwed:           r2(taxOwed),
        effectiveRate:     Math.round(effectiveRate * 10000) / 10000,
        marginalRate,
        brackets:          bracketBreakdown,
      },
    };
  },

  async slow(input, context, engine) {
    // LLM fallback for complex scenarios: itemized deductions, SALT cap,
    // QBI deduction, AMT, credits (child tax credit, EITC, etc.),
    // capital gains rates, self-employment tax, Alternative Minimum Tax.
    if (typeof engine.complete !== "function") return null;

    const filingStatus = context?.filingStatus ?? "single";
    const prompt = [
      "You are a US tax professional. Compute the 2024 federal income tax.",
      `Gross income: $${input}`,
      `Filing status: ${filingStatus}`,
      "",
      "Apply the 2024 standard deduction and marginal bracket rates.",
      "Return a JSON object with: grossIncome, standardDeduction, taxableIncome, taxOwed, effectiveRate, marginalRate.",
      "effectiveRate as a decimal (e.g. 0.22). Round money to 2 decimal places.",
      "JSON:",
    ].join("\n");

    let reply;
    try {
      reply = await engine.complete(prompt, { temperature: 0.0, maxTokens: 300 });
    } catch {
      return null;
    }
    if (!reply) return null;

    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const fields = JSON.parse(jsonMatch[0]);
      return { confidence: 0.65, source: "model", fields };
    } catch {
      return null;
    }
  },
};

// ─── auto-register on import ──────────────────────────────────────────

registerTask(usSalesTaxTask);
registerTask(usFederalTaxTask);
