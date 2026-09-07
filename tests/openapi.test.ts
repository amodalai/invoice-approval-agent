import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { seedRows } from "../amodal/_lib/demo-data.js";

type Schema = {
  $ref?: string;
  type?: string;
  format?: string;
  nullable?: boolean;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
};
type StoreField = { type: string; nullable?: boolean; values?: string[]; item?: StoreField; fields?: Record<string, StoreField> };
type Operation = {
  operationId: string;
  responses: Record<string, { content?: { "application/json": { schema: Schema } } }>;
};
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spec = readJson("../public/openapi.json") as {
  openapi: string;
  servers: Array<{ url: string }>;
  security: Array<Record<string, string[]>>;
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, { type: string; scheme: string }> };
};
const stores = [["invoices", "Invoice"], ["purchase_orders", "PurchaseOrder"]] as const;
const rows = seedRows("2026-09-01T09:00:00.000Z");

function resolve(reference: string): unknown {
  assert.match(reference, /^#\/components\//);
  return reference.slice(2).split("/").reduce((value, key) => {
    assert.ok(value && typeof value === "object" && key in value, reference);
    return (value as Record<string, unknown>)[key];
  }, spec as unknown);
}

function validate(schema: Schema, value: unknown): void {
  if (schema.$ref) return validate(resolve(schema.$ref) as Schema, value);
  for (const part of schema.allOf ?? []) validate(part, value);
  if (value === null && schema.nullable) return;
  if (schema.enum) assert.ok(schema.enum.includes(value), "value must belong to its enum");
  if (schema.type === "object") {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), "expected an object");
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) assert.ok(key in object, `missing ${key}`);
    for (const [key, field] of Object.entries(schema.properties ?? {})) {
      if (key in object) validate(field, object[key]);
    }
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), "expected an array");
    for (const item of value) validate(schema.items!, item);
  } else if (schema.type === "integer") assert.ok(Number.isInteger(value), "expected an integer");
  else if (schema.type) assert.equal(typeof value, schema.type);
  if (schema.format === "date-time") assert.ok(typeof value === "string" && Number.isFinite(Date.parse(value)), "expected an ISO timestamp");
}

function fieldSchema(field: StoreField): Schema {
  const schema: Schema = field.type === "enum" ? { type: "string", enum: [...field.values!, ...(field.nullable ? [null] : [])] }
    : field.type === "datetime" ? { type: "string", format: "date-time" }
    : field.type === "array" ? { type: "array", items: fieldSchema(field.item!) }
    : field.type === "object" ? { type: "object", properties: Object.fromEntries(Object.entries(field.fields!).map(([key, value]) => [key, fieldSchema(value)])) }
    : { type: field.type };
  return field.nullable ? { ...schema, nullable: true } : schema;
}

test("the API describes only the demo's four existing read operations", () => {
  assert.equal(spec.openapi, "3.0.3");
  assert.deepEqual(spec.servers, [{ url: "/" }]);
  assert.deepEqual(spec.security, [{ runtimeBearer: [] }]);
  assert.equal(spec.components.securitySchemes.runtimeBearer.type, "http");
  assert.equal(spec.components.securitySchemes.runtimeBearer.scheme, "bearer");
  assert.deepEqual(Object.keys(spec.paths).sort(), stores.flatMap(([store]) => [`/api/stores/${store}`, `/api/stores/${store}/{key}`]).sort());
  const ids: string[] = [];
  for (const methods of Object.values(spec.paths)) {
    assert.deepEqual(Object.keys(methods), ["get"]);
    ids.push(methods.get.operationId);
  }
  assert.equal(new Set(ids).size, 4);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.$ref === "string") resolve(object.$ref);
    Object.values(object).forEach(visit);
  };
  visit(spec);
});

for (const [store, name] of stores) {
  test(`${store} documents its store schema and accepts every seeded record`, () => {
    const source = readJson(`../amodal/stores/${store}.json`) as { key: string; schema: Record<string, StoreField> };
    const key = source.key.slice(1, -1);
    const expected = Object.fromEntries(Object.entries(source.schema).map(([field, value]) => [field, fieldSchema(value)]));
    assert.deepEqual(spec.components.schemas[name], { type: "object", required: [key], properties: expected });
    const documents = rows[store].map((payload) => ({
      key: payload[key], appId: "demo", store, version: 1, payload,
      meta: { computedAt: "2026-09-01T09:00:00.000Z", stale: false },
    }));
    assert.ok(documents.length > 0);
    const pageSchema = spec.paths[`/api/stores/${store}`].get.responses["200"].content!["application/json"].schema;
    validate(pageSchema, { documents, total: documents.length, hasMore: false });
    validate(pageSchema, { documents: [], total: 0, hasMore: false });
    assert.throws(() => validate(pageSchema, { documents, total: "1", hasMore: false }));
    assert.throws(() => validate(pageSchema, { documents, total: 1, hasMore: "false" }));
    const recordSchema = spec.paths[`/api/stores/${store}/{key}`].get.responses["200"].content!["application/json"].schema;
    validate(recordSchema, { document: documents[0], history: [] });
    const broken = structuredClone(documents[0]);
    broken.payload[key] = 42;
    assert.throws(() => validate(recordSchema, { document: broken, history: [] }));
    broken.payload = { ...documents[0].payload, status: "unsupported" };
    assert.throws(() => validate(recordSchema, { document: broken, history: [] }));
  });
}
