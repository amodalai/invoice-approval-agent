import type { LineItem } from "./policy.js";

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
  /** Order of arrival; the seeder turns it into `received_at`. */
  received_offset_days: number;
}

export const PURCHASE_ORDERS: ExamplePO[] = [
  {
    po_number: "PO-1041",
    vendor_name: "Brightline Cloud Services",
    description: "Cloud hosting, August 2026 (monthly plan, 40 vCPU tier)",
    amount_usd: 12_000,
    requester: "Omar Haddad (Engineering)",
  },
  {
    po_number: "PO-1052",
    vendor_name: "Norwood Office Supply",
    description: "Office chairs and one standing desk for the 4th floor",
    amount_usd: 2_500,
    requester: "Lena Fischer (Facilities)",
  },
  {
    po_number: "PO-1063",
    vendor_name: "Atlas Consulting Group",
    description: "Q3 data migration consulting, up to 150 hours at $200/h",
    amount_usd: 30_000,
    requester: "Omar Haddad (Engineering)",
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
    received_offset_days: 5,
  },
];
