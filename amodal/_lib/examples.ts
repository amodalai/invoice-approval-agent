import type { Check, Recommendation } from "./invoice-review.js";
import type { LineItem } from "./policy.js";

export const REQUESTERS = ["Omar Haddad (Engineering)", "Lena Fischer (Facilities)", "Maya Chen (Marketing)"] as const;
const [OMAR, LENA, MAYA] = REQUESTERS;

export interface ExamplePO {
  po_number: string;
  vendor_name: string;
  description: string;
  amount_usd: number;
  billed_to_date_usd?: number;
  requester: string;
  status?: "open" | "closed";
}

export interface ExampleInvoice {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  po_number?: string;
  invoice_date: string;
  due_date: string;
  total_usd: number;
  line_items: LineItem[];
  notes?: string;
  requester: string;
  /** Order of arrival; the seeder turns it into `received_at`. */
  received_offset_days: number;
}

export interface CannedReview {
  recommendation: Recommendation;
  summary: string;
  checks: Check[];
  issues: string[];
}

/**
 * A backlog invoice: already reviewed and decided when seeded. One canned
 * review per revision; two reviews mean the first was returned and the
 * invoice resubmitted (the row holds the final revision's fields).
 */
export interface BacklogInvoice extends ExampleInvoice {
  reviews: CannedReview[];
  returned_note?: string;
  decided: "approved" | "rejected";
  decision_note?: string;
}

export const PURCHASE_ORDERS: ExamplePO[] = [
  {
    po_number: "PO-1041",
    vendor_name: "Brightline Cloud Services",
    description: "Cloud hosting, August 2026 (monthly plan, 40 vCPU tier)",
    amount_usd: 12_000,
    requester: OMAR,
  },
  {
    po_number: "PO-1052",
    vendor_name: "Norwood Office Supply",
    description: "Office chairs and one standing desk for the 4th floor",
    amount_usd: 2_500,
    requester: LENA,
  },
  {
    po_number: "PO-1063",
    vendor_name: "Atlas Consulting Group",
    description: "Q3 data migration consulting, up to 150 hours at $200/h",
    amount_usd: 30_000,
    requester: OMAR,
  },
];

export const INVOICES: ExampleInvoice[] = [
  {
    invoice_id: "inv_brightline_0417",
    vendor_name: "Brightline Cloud Services",
    invoice_number: "0417",
    po_number: "PO-1041",
    invoice_date: "2026-08-31",
    due_date: "2026-09-30",
    total_usd: 12_000,
    line_items: [
      { description: "Cloud hosting, August 2026, 40 vCPU tier", quantity: 1, unit_price_usd: 12_000 },
    ],
    requester: OMAR,
    received_offset_days: 0,
  },
  {
    invoice_id: "inv_norwood_2288",
    vendor_name: "Norwood Office Supply",
    invoice_number: "2288",
    po_number: "PO-1052",
    invoice_date: "2026-08-27",
    due_date: "2026-09-26",
    total_usd: 2_890,
    line_items: [
      { description: "Ergonomic office chair, model N4", quantity: 6, unit_price_usd: 395 },
      { description: "Standing desk, 140cm", quantity: 1, unit_price_usd: 220 },
      { description: "Rush delivery fee", quantity: 1, unit_price_usd: 300 },
    ],
    notes: "Delivered 3 days early as requested by phone.",
    requester: LENA,
    received_offset_days: 1,
  },
  {
    invoice_id: "inv_atlas_9911",
    vendor_name: "Atlas Consulting Group",
    invoice_number: "9911",
    po_number: "PO-1063",
    invoice_date: "2026-08-29",
    due_date: "2026-09-28",
    total_usd: 9_800,
    line_items: [
      { description: "Data migration, phase 1 (40 hours)", quantity: 40, unit_price_usd: 200 },
      { description: "Marketing strategy workshop, 1 day", quantity: 1, unit_price_usd: 1_800 },
    ],
    requester: OMAR,
    received_offset_days: 2,
  },
  {
    invoice_id: "inv_pixelforge_77",
    vendor_name: "PixelForge Design",
    invoice_number: "77",
    invoice_date: "2026-08-30",
    due_date: "2026-09-14",
    total_usd: 650,
    line_items: [
      { description: "Logo refresh, 2 concepts + final files", quantity: 1, unit_price_usd: 650 },
    ],
    notes: "Requested by Maya Chen (Marketing).",
    requester: MAYA,
    received_offset_days: 3,
  },
  {
    invoice_id: "inv_brightline_0417_resend",
    vendor_name: "Brightline Cloud Services",
    invoice_number: "0417",
    po_number: "PO-1041",
    invoice_date: "2026-08-31",
    due_date: "2026-09-30",
    total_usd: 12_000,
    line_items: [
      { description: "Cloud hosting, August 2026, 40 vCPU tier", quantity: 1, unit_price_usd: 12_000 },
    ],
    notes: "Resending invoice 0417, please confirm receipt.",
    requester: OMAR,
    received_offset_days: 5,
  },
];

/** Vendors the live set does not use, so the backlog never touches the live balances. */
export const BACKLOG_PURCHASE_ORDERS: ExamplePO[] = [
  {
    po_number: "PO-0987",
    vendor_name: "Cedarline Facilities Services",
    description: "HVAC maintenance, Q3 2026: quarterly service visits and filter replacement",
    amount_usd: 9_000,
    billed_to_date_usd: 4_800,
    requester: LENA,
  },
  {
    po_number: "PO-0994",
    vendor_name: "Halden Print & Signage",
    description: "Booth graphics and printed brochures for the Larkspur Summit 2026",
    amount_usd: 8_000,
    billed_to_date_usd: 4_150,
    requester: MAYA,
    status: "closed",
  },
];

const CHECKS = ["purchase-order", "amount", "line-items", "duplicate"] as const;

function canned(
  recommendation: Recommendation,
  summary: string,
  notes: [string, string, string, string],
  issues: string[] = [],
  statuses: Partial<Record<(typeof CHECKS)[number], Check["status"]>> = {},
): CannedReview {
  return {
    recommendation,
    summary,
    checks: CHECKS.map((name, i) => ({ name, status: statuses[name] ?? "pass", note: notes[i] })),
    issues,
  };
}

const noDuplicate = "No earlier invoice from this vendor carries this number.";
const noPoSmall = (total: string) => `No purchase order; at ${total} the invoice is under the $1,000 limit and names the requester.`;

/**
 * Decided invoices from the six weeks before the live set, seeded with their
 * reviews and events so history, the purchase-order balances, and each
 * requester's list are populated at first open.
 */
export const BACKLOG: BacklogInvoice[] = [
  {
    invoice_id: "inv_cedarline_c1042",
    vendor_name: "Cedarline Facilities Services",
    invoice_number: "C-1042",
    po_number: "PO-0987",
    invoice_date: "2026-07-20",
    due_date: "2026-08-19",
    total_usd: 2_400,
    line_items: [{ description: "Quarterly HVAC service visit, July, incl. filters", quantity: 1, unit_price_usd: 2_400 }],
    requester: LENA,
    received_offset_days: -35,
    reviews: [
      canned("approve", "July service visit under the Q3 HVAC maintenance order. Within the PO balance, one in-scope line, no duplicate.", [
        "PO-0987 is open and belongs to Cedarline Facilities Services.",
        "$2,400 against $9,000 remaining on PO-0987: under by $6,600, tolerance $180; lines sum to $2,400",
        "A quarterly service visit with filters is what PO-0987 describes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_halden_5120",
    vendor_name: "Halden Print & Signage",
    invoice_number: "5120",
    po_number: "PO-0994",
    invoice_date: "2026-07-24",
    due_date: "2026-08-23",
    total_usd: 1_850,
    line_items: [{ description: "Booth backdrop graphics, 3m x 2m, printed and laminated", quantity: 1, unit_price_usd: 1_850 }],
    requester: MAYA,
    received_offset_days: -30,
    reviews: [
      canned("approve", "Booth graphics for the Larkspur Summit under PO-0994. Within the PO balance, in scope, no duplicate.", [
        "PO-0994 is open and belongs to Halden Print & Signage.",
        "$1,850 against $8,000 remaining on PO-0994: under by $6,150, tolerance $160; lines sum to $1,850",
        "Booth graphics are the first item PO-0994 describes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_kestrel_4410",
    vendor_name: "Kestrel Courier",
    invoice_number: "4410",
    invoice_date: "2026-07-27",
    due_date: "2026-08-10",
    total_usd: 320,
    line_items: [{ description: "Courier runs, July (8 deliveries)", quantity: 8, unit_price_usd: 40 }],
    notes: "Requested by Lena Fischer (Facilities).",
    requester: LENA,
    received_offset_days: -28,
    reviews: [
      canned("approve", "Eight courier runs in July, no purchase order. Under the $1,000 no-PO limit with the requester named in the memo.", [
        noPoSmall("$320"),
        "$320, no PO; lines sum to $320",
        "Courier runs are ordinary facilities spend with nothing the policy excludes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_sable_3305",
    vendor_name: "Sable Hardware Supply",
    invoice_number: "3305",
    invoice_date: "2026-07-28",
    due_date: "2026-08-27",
    total_usd: 860,
    line_items: [
      { description: "USB-C docking station", quantity: 4, unit_price_usd: 190 },
      { description: "HDMI cable, 2m", quantity: 5, unit_price_usd: 20 },
    ],
    notes: "Corrected invoice: unit price on the docking stations fixed. Requested by Omar Haddad (Engineering).",
    requester: OMAR,
    received_offset_days: -26,
    reviews: [
      canned(
        "hold",
        "Docking stations and cables for Engineering, no purchase order. The total is under the no-PO limit, but the line items do not add up to it.",
        [
          noPoSmall("$860"),
          "$860, no PO; lines sum to $806, not the stated total",
          "Docking stations and cables are ordinary equipment spend with nothing the policy excludes.",
          noDuplicate,
        ],
        ["line items sum to $806, not the stated total"],
        { amount: "flag" },
      ),
      canned("approve", "Corrected invoice for the docking stations and cables. The lines now add up to the total; under the no-PO limit with the requester named.", [
        noPoSmall("$860"),
        "$860, no PO; lines sum to $860",
        "Docking stations and cables are ordinary equipment spend with nothing the policy excludes.",
        noDuplicate,
      ]),
    ],
    returned_note: "The line items add up to $806, not $860. Please ask Sable for a corrected invoice.",
    decided: "approved",
  },
  {
    invoice_id: "inv_ridgeway_88",
    vendor_name: "Ridgeway Domain Registry",
    invoice_number: "88",
    invoice_date: "2026-07-29",
    due_date: "2026-08-12",
    total_usd: 180,
    line_items: [{ description: "Domain renewal, 1 year", quantity: 6, unit_price_usd: 30 }],
    notes: "Requested by Omar Haddad (Engineering).",
    requester: OMAR,
    received_offset_days: -25,
    reviews: [
      canned("approve", "Six domain renewals, no purchase order. Under the $1,000 no-PO limit with the requester named.", [
        noPoSmall("$180"),
        "$180, no PO; lines sum to $180",
        "Domain renewals are routine and carry no excluded fee.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_halden_5133",
    vendor_name: "Halden Print & Signage",
    invoice_number: "5133",
    po_number: "PO-0994",
    invoice_date: "2026-08-01",
    due_date: "2026-08-31",
    total_usd: 2_300,
    line_items: [{ description: "Tri-fold brochure, full colour", quantity: 500, unit_price_usd: 4.6 }],
    requester: MAYA,
    received_offset_days: -22,
    reviews: [
      canned("approve", "The 500 brochures for the Larkspur Summit under PO-0994. Within the PO balance, in scope, no duplicate.", [
        "PO-0994 is open and belongs to Halden Print & Signage.",
        "$2,300 against $6,150 remaining on PO-0994: under by $3,850, tolerance $123; lines sum to $2,300",
        "Printed brochures are the second item PO-0994 describes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_kestrel_4410_resend",
    vendor_name: "Kestrel Courier",
    invoice_number: "4410",
    invoice_date: "2026-07-27",
    due_date: "2026-08-10",
    total_usd: 320,
    line_items: [{ description: "Courier runs, July (8 deliveries)", quantity: 8, unit_price_usd: 40 }],
    notes: "Second copy of invoice 4410; our records show it unpaid.",
    requester: LENA,
    received_offset_days: -20,
    reviews: [
      canned(
        "reject",
        "A second copy of Kestrel's invoice 4410, which was received on 27 July and approved. The policy rejects duplicates outright.",
        [
          noPoSmall("$320"),
          "$320, no PO; lines sum to $320",
          "Same courier runs as the original invoice.",
          "Duplicate of inv_kestrel_4410, received earlier with the same vendor and invoice number.",
        ],
        ["duplicate of inv_kestrel_4410"],
        { duplicate: "fail" },
      ),
    ],
    decided: "rejected",
    decision_note: "Duplicate of invoice 4410, approved on 28 July. Told Kestrel the payment is scheduled on the original.",
  },
  {
    invoice_id: "inv_lumen_2071",
    vendor_name: "Lumen Stock Photo",
    invoice_number: "2071",
    invoice_date: "2026-08-03",
    due_date: "2026-08-17",
    total_usd: 540,
    line_items: [{ description: "Stock photo licence, standard", quantity: 12, unit_price_usd: 45 }],
    notes: "Requested by Maya Chen (Marketing).",
    requester: MAYA,
    received_offset_days: -18,
    reviews: [
      canned("approve", "Twelve stock photo licences for Marketing, no purchase order. Under the $1,000 no-PO limit with the requester named.", [
        noPoSmall("$540"),
        "$540, no PO; lines sum to $540",
        "Image licences are routine marketing spend with nothing the policy excludes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_cedarline_c1077",
    vendor_name: "Cedarline Facilities Services",
    invoice_number: "C-1077",
    po_number: "PO-0987",
    invoice_date: "2026-08-12",
    due_date: "2026-09-11",
    total_usd: 2_400,
    line_items: [{ description: "Quarterly HVAC service visit, August, incl. filters", quantity: 1, unit_price_usd: 2_400 }],
    requester: LENA,
    received_offset_days: -12,
    reviews: [
      canned("approve", "August service visit under the Q3 HVAC maintenance order. Within the PO balance, one in-scope line, no duplicate.", [
        "PO-0987 is open and belongs to Cedarline Facilities Services.",
        "$2,400 against $6,600 remaining on PO-0987: under by $4,200, tolerance $132; lines sum to $2,400",
        "A quarterly service visit with filters is what PO-0987 describes.",
        noDuplicate,
      ]),
    ],
    decided: "approved",
  },
  {
    invoice_id: "inv_cedarline_c1090",
    vendor_name: "Cedarline Facilities Services",
    invoice_number: "C-1090",
    po_number: "PO-0987",
    invoice_date: "2026-08-15",
    due_date: "2026-09-14",
    total_usd: 5_900,
    line_items: [
      { description: "Rooftop compressor replacement, unit 2", quantity: 1, unit_price_usd: 5_200 },
      { description: "Emergency call-out, weekend", quantity: 1, unit_price_usd: 700 },
    ],
    notes: "Emergency replacement authorised by phone on 14 August.",
    requester: LENA,
    received_offset_days: -9,
    reviews: [
      canned(
        "escalate",
        "An emergency compressor replacement billed against the HVAC maintenance order. The total exceeds the PO's remaining balance by more than the tolerance, and the work is outside the service plan.",
        [
          "PO-0987 is open and belongs to Cedarline Facilities Services.",
          "$5,900 against $4,200 remaining on PO-0987: over by $1,700 (40.5%), tolerance $84",
          "A compressor replacement and an emergency call-out are not the quarterly service PO-0987 describes.",
          noDuplicate,
        ],
        ["over the PO's remaining balance by $1,700 (tolerance $84)", "compressor replacement and emergency call-out are outside the PO's scope"],
        { amount: "fail", "line-items": "flag" },
      ),
    ],
    decided: "rejected",
    decision_note: "Not covered by the maintenance plan. Facilities will raise a separate purchase order for the compressor and Cedarline will re-invoice against it.",
  },
];
