#!/usr/bin/env node

import { readFileSync } from "node:fs";

// ── ANSI Colors ──
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
};

const isTTY = process.stdout.isTTY;

function paint(color: string, text: string): string {
  return isTTY ? `${color}${text}${c.reset}` : text;
}

// ── Help ──
function showHelp(): void {
  console.log(`
${paint(c.bgBlue + c.white + c.bold, " json-path ")} ${paint(c.dim, "v1.0.0")}

${paint(c.bold, "Query JSON files with JSONPath expressions.")}

${paint(c.yellow, "USAGE")}
  json-path <expression> [file]
  cat data.json | json-path <expression>

${paint(c.yellow, "ARGUMENTS")}
  ${paint(c.green, "<expression>")}    JSONPath expression (e.g. $.users[*].name)
  ${paint(c.green, "[file]")}          JSON file to query (reads stdin if omitted)

${paint(c.yellow, "OPTIONS")}
  ${paint(c.cyan, "--count")}          Show count of matching elements instead of values
  ${paint(c.cyan, "--format csv")}     Output results as CSV
  ${paint(c.cyan, "--json")}           Output results as JSON array
  ${paint(c.cyan, "--pretty")}         Pretty-print JSON output
  ${paint(c.cyan, "--help")}           Show this help message

${paint(c.yellow, "EXPRESSIONS")}
  $.store.book          Access nested property
  $.users[0]            Array index
  $.users[*].name       All items' name field
  $.users[?(@.age>21)]  Filter by condition
  $..name               Recursive descent (find all "name" keys)

${paint(c.yellow, "EXAMPLES")}
  ${paint(c.dim, "# Query a file")}
  json-path '$.users[*].name' data.json

  ${paint(c.dim, "# Pipe from stdin")}
  curl -s api.example.com/users | json-path '$.data[*].email'

  ${paint(c.dim, "# Count matching elements")}
  json-path '$.items[?(@.active==true)]' data.json --count

  ${paint(c.dim, "# Export to CSV")}
  json-path '$.users[*]' data.json --format csv

${paint(c.dim, "Built by LXGIC Studios")} ${paint(c.blue, "https://github.com/lxgicstudios/json-path")}
`);
}

// ── JSONPath Engine ──
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function queryJsonPath(data: JsonValue, expression: string): JsonValue[] {
  if (!expression.startsWith("$")) {
    throw new Error(`Expression must start with $. Got: "${expression}"`);
  }

  const tokens = tokenize(expression.slice(1));
  let results: JsonValue[] = [data];

  for (const token of tokens) {
    results = applyToken(results, token);
  }

  return results;
}

interface Token {
  type: "property" | "index" | "wildcard" | "recursive" | "filter" | "slice";
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    if (expr[i] === ".") {
      if (expr[i + 1] === ".") {
        // Recursive descent
        i += 2;
        let prop = "";
        while (i < expr.length && expr[i] !== "." && expr[i] !== "[") {
          prop += expr[i];
          i++;
        }
        tokens.push({ type: "recursive", value: prop });
      } else {
        i++;
        if (expr[i] === "*") {
          tokens.push({ type: "wildcard", value: "*" });
          i++;
        } else {
          let prop = "";
          while (i < expr.length && expr[i] !== "." && expr[i] !== "[") {
            prop += expr[i];
            i++;
          }
          if (prop) tokens.push({ type: "property", value: prop });
        }
      }
    } else if (expr[i] === "[") {
      i++;
      let content = "";
      let depth = 1;
      while (i < expr.length && depth > 0) {
        if (expr[i] === "[") depth++;
        if (expr[i] === "]") depth--;
        if (depth > 0) content += expr[i];
        i++;
      }

      if (content === "*") {
        tokens.push({ type: "wildcard", value: "*" });
      } else if (content.startsWith("?")) {
        tokens.push({ type: "filter", value: content.slice(1) });
      } else if (content.includes(":")) {
        tokens.push({ type: "slice", value: content });
      } else if (/^\d+$/.test(content)) {
        tokens.push({ type: "index", value: content });
      } else {
        // Property access with quotes
        const cleaned = content.replace(/['"]/g, "");
        tokens.push({ type: "property", value: cleaned });
      }
    } else {
      i++;
    }
  }

  return tokens;
}

function applyToken(inputs: JsonValue[], token: Token): JsonValue[] {
  const results: JsonValue[] = [];

  for (const input of inputs) {
    switch (token.type) {
      case "property":
        if (input && typeof input === "object" && !Array.isArray(input)) {
          const val = (input as Record<string, JsonValue>)[token.value];
          if (val !== undefined) results.push(val);
        }
        break;

      case "index":
        if (Array.isArray(input)) {
          const idx = parseInt(token.value, 10);
          if (idx >= 0 && idx < input.length) results.push(input[idx]);
        }
        break;

      case "wildcard":
        if (Array.isArray(input)) {
          results.push(...input);
        } else if (input && typeof input === "object") {
          results.push(...Object.values(input as Record<string, JsonValue>));
        }
        break;

      case "recursive":
        collectRecursive(input, token.value, results);
        break;

      case "filter":
        if (Array.isArray(input)) {
          const filtered = input.filter((item) => evaluateFilter(item, token.value));
          results.push(...filtered);
        }
        break;

      case "slice": {
        if (Array.isArray(input)) {
          const parts = token.value.split(":").map((p) => (p ? parseInt(p, 10) : undefined));
          const start = parts[0] ?? 0;
          const end = parts[1] ?? input.length;
          const step = parts[2] ?? 1;
          for (let si = start; si < end; si += step) {
            if (si >= 0 && si < input.length) results.push(input[si]);
          }
        }
        break;
      }
    }
  }

  return results;
}

function collectRecursive(obj: JsonValue, prop: string, results: JsonValue[]): void {
  if (obj === null || typeof obj !== "object") return;

  if (!Array.isArray(obj)) {
    const record = obj as Record<string, JsonValue>;
    if (prop in record) {
      results.push(record[prop]);
    }
    for (const val of Object.values(record)) {
      collectRecursive(val, prop, results);
    }
  } else {
    for (const item of obj) {
      collectRecursive(item, prop, results);
    }
  }
}

function evaluateFilter(item: JsonValue, filterExpr: string): boolean {
  // Parse filter like (@.age>21) or (@.active==true)
  const match = filterExpr.match(/^\(?\s*@\.(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\)?$/);
  if (!match) return false;

  const [, field, op, rawValue] = match;
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;

  const record = item as Record<string, JsonValue>;
  const fieldVal = record[field];
  if (fieldVal === undefined) return false;

  let compareVal: JsonValue;
  if (rawValue === "true") compareVal = true;
  else if (rawValue === "false") compareVal = false;
  else if (rawValue === "null") compareVal = null;
  else if (/^['"]/.test(rawValue)) compareVal = rawValue.replace(/['"]/g, "");
  else if (!isNaN(Number(rawValue))) compareVal = Number(rawValue);
  else compareVal = rawValue;

  switch (op) {
    case "==":
      return fieldVal === compareVal;
    case "!=":
      return fieldVal !== compareVal;
    case ">":
      return typeof fieldVal === "number" && typeof compareVal === "number" && fieldVal > compareVal;
    case "<":
      return typeof fieldVal === "number" && typeof compareVal === "number" && fieldVal < compareVal;
    case ">=":
      return typeof fieldVal === "number" && typeof compareVal === "number" && fieldVal >= compareVal;
    case "<=":
      return typeof fieldVal === "number" && typeof compareVal === "number" && fieldVal <= compareVal;
    default:
      return false;
  }
}

// ── CSV Formatter ──
function toCsv(data: JsonValue[]): string {
  if (data.length === 0) return "";

  // If items are objects, use keys as headers
  if (data[0] && typeof data[0] === "object" && !Array.isArray(data[0])) {
    const allKeys = new Set<string>();
    for (const item of data) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        Object.keys(item as Record<string, JsonValue>).forEach((k) => allKeys.add(k));
      }
    }
    const headers = [...allKeys];
    const lines = [headers.join(",")];
    for (const item of data) {
      const record = (item || {}) as Record<string, JsonValue>;
      const row = headers.map((h) => {
        const val = record[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  // Simple array of primitives
  return data.map((item) => String(item ?? "")).join("\n");
}

// ── Read stdin ──
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    // If stdin is a TTY, there's nothing to read
    if (process.stdin.isTTY) resolve("");
  });
}

// ── Main ──
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const flags = {
    count: args.includes("--count"),
    json: args.includes("--json"),
    pretty: args.includes("--pretty"),
    format: "",
  };

  const formatIdx = args.indexOf("--format");
  if (formatIdx !== -1 && args[formatIdx + 1]) {
    flags.format = args[formatIdx + 1];
  }

  // Get positional args (non-flag)
  const positional = args.filter(
    (a) => !a.startsWith("--") && (args.indexOf(a) === 0 || !["csv", "json"].includes(a) || args[args.indexOf(a) - 1] !== "--format")
  );

  const expression = positional[0];
  const filePath = positional[1];

  if (!expression) {
    console.error(paint(c.red, "Error: No JSONPath expression provided."));
    process.exit(1);
  }

  let jsonStr: string;

  if (filePath) {
    try {
      jsonStr = readFileSync(filePath, "utf8");
    } catch (err) {
      console.error(paint(c.red, `Error: Can't read file "${filePath}".`));
      process.exit(1);
    }
  } else {
    jsonStr = await readStdin();
    if (!jsonStr.trim()) {
      console.error(paint(c.red, "Error: No input. Provide a file or pipe JSON via stdin."));
      process.exit(1);
    }
  }

  let data: JsonValue;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    console.error(paint(c.red, "Error: Invalid JSON input."));
    process.exit(1);
  }

  let results: JsonValue[];
  try {
    results = queryJsonPath(data, expression);
  } catch (err) {
    console.error(paint(c.red, `Error: ${(err as Error).message}`));
    process.exit(1);
  }

  // Output
  if (flags.count) {
    const output = flags.json ? JSON.stringify({ count: results.length }) : String(results.length);
    console.log(output);
  } else if (flags.format === "csv") {
    console.log(toCsv(results));
  } else if (flags.json || !isTTY) {
    console.log(flags.pretty ? JSON.stringify(results, null, 2) : JSON.stringify(results));
  } else {
    if (results.length === 0) {
      console.log(paint(c.yellow, "No matches found."));
    } else {
      for (const item of results) {
        if (typeof item === "object" && item !== null) {
          console.log(JSON.stringify(item, null, 2));
        } else {
          console.log(paint(c.green, String(item)));
        }
      }
      console.log(paint(c.dim, `\n${results.length} match${results.length === 1 ? "" : "es"} found.`));
    }
  }
}

main().catch((err) => {
  console.error(paint(c.red, `Fatal: ${(err as Error).message}`));
  process.exit(1);
});
