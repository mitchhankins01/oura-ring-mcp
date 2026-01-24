#!/usr/bin/env npx ts-node
/**
 * Validate test fixtures against the real Oura API
 *
 * Usage: OURA_ACCESS_TOKEN=your_token npx ts-node scripts/validate-fixtures.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = "https://api.ouraring.com/v2/usercollection";
const FIXTURES_DIR = join(__dirname, "../tests/fixtures");

const token = process.env.OURA_ACCESS_TOKEN;
if (!token) {
  console.error("Error: OURA_ACCESS_TOKEN environment variable is required");
  console.error("Usage: OURA_ACCESS_TOKEN=your_token npx ts-node scripts/validate-fixtures.ts");
  process.exit(1);
}

// Get today and 1 year ago for date range
const today = new Date().toISOString().split("T")[0];
const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

interface EndpointConfig {
  endpoint: string;
  fixture: string;
  params?: Record<string, string>;
}

const endpoints: EndpointConfig[] = [
  { endpoint: "sleep", fixture: "oura-sleep-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_sleep", fixture: "oura-daily-sleep-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_readiness", fixture: "oura-readiness-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_activity", fixture: "oura-activity-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_stress", fixture: "oura-stress-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "heartrate", fixture: "oura-heartrate-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "workout", fixture: "oura-workout-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_spo2", fixture: "oura-spo2-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "vO2_max", fixture: "oura-vo2max-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_resilience", fixture: "oura-resilience-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "daily_cardiovascular_age", fixture: "oura-cardiovascular-age-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "tag", fixture: "oura-tags-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "session", fixture: "oura-sessions-response.json", params: { start_date: yearAgo, end_date: today } },
  { endpoint: "personal_info", fixture: "oura-personal-info-response.json" },
];

async function fetchEndpoint(endpoint: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function getFieldTypes(obj: unknown, prefix = ""): Record<string, string> {
  const types: Record<string, string> = {};

  if (obj === null) {
    types[prefix || "root"] = "null";
    return types;
  }

  if (Array.isArray(obj)) {
    types[prefix || "root"] = "array";
    if (obj.length > 0) {
      Object.assign(types, getFieldTypes(obj[0], `${prefix}[]`));
    }
    return types;
  }

  if (typeof obj === "object") {
    types[prefix || "root"] = "object";
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      Object.assign(types, getFieldTypes(value, fieldPath));
    }
    return types;
  }

  types[prefix || "root"] = typeof obj;
  return types;
}

function compareStructures(fixture: unknown, actual: unknown): { matches: boolean; differences: string[] } {
  const fixtureTypes = getFieldTypes(fixture);
  const actualTypes = getFieldTypes(actual);
  const differences: string[] = [];

  // Check for fields in actual but not in fixture
  for (const [path, type] of Object.entries(actualTypes)) {
    if (!(path in fixtureTypes)) {
      differences.push(`+ ${path}: ${type} (new field in API)`);
    } else if (fixtureTypes[path] !== type && type !== "null" && fixtureTypes[path] !== "null") {
      differences.push(`~ ${path}: fixture=${fixtureTypes[path]}, actual=${type}`);
    }
  }

  // Check for fields in fixture but not in actual
  for (const [path, type] of Object.entries(fixtureTypes)) {
    if (!(path in actualTypes)) {
      differences.push(`- ${path}: ${type} (missing in API response)`);
    }
  }

  return { matches: differences.length === 0, differences };
}

async function validateFixture(config: EndpointConfig): Promise<void> {
  const { endpoint, fixture, params } = config;

  process.stdout.write(`Validating ${endpoint}... `);

  try {
    const actual = await fetchEndpoint(endpoint, params);
    const fixturePath = join(FIXTURES_DIR, fixture);

    let fixtureData: unknown;
    try {
      fixtureData = JSON.parse(readFileSync(fixturePath, "utf-8"));
    } catch {
      console.log("❌ Fixture file not found");
      console.log(`  Creating fixture from API response...`);
      writeFileSync(fixturePath, JSON.stringify(actual, null, 2));
      console.log(`  ✅ Created ${fixture}`);
      return;
    }

    const { matches, differences } = compareStructures(fixtureData, actual);

    if (matches) {
      console.log("✅ Structure matches");
    } else {
      console.log("⚠️  Structure differs:");
      differences.forEach(diff => console.log(`    ${diff}`));
    }
  } catch (error) {
    console.log(`❌ ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function main() {
  console.log("Oura API Fixture Validator");
  console.log("==========================");
  console.log(`Date range: ${yearAgo} to ${today}\n`);

  for (const config of endpoints) {
    await validateFixture(config);
  }

  console.log("\nDone!");
}

main();
