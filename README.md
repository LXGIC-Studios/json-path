# @lxgicstudios/json-path

[![npm version](https://img.shields.io/npm/v/@lxgicstudios/json-path)](https://www.npmjs.com/package/@lxgicstudios/json-path)
[![license](https://img.shields.io/npm/l/@lxgicstudios/json-path)](LICENSE)
[![node](https://img.shields.io/node/v/@lxgicstudios/json-path)](package.json)

Query JSON files using JSONPath expressions from the command line. Filter arrays, count matches, export to CSV. Zero dependencies.

## Install

```bash
npm install -g @lxgicstudios/json-path
```

Or run directly:

```bash
npx @lxgicstudios/json-path '$.users[*].name' data.json
```

## Usage

```bash
# Query a file
json-path '$.users[*].name' data.json

# Pipe from stdin
curl -s api.example.com/users | json-path '$.data[*].email'

# Count matching elements
json-path '$.items[?(@.active==true)]' data.json --count

# Export to CSV
json-path '$.users[*]' data.json --format csv

# Filter with conditions
json-path '$.users[?(@.age>21)]' data.json

# Recursive descent
json-path '$..name' data.json
```

## Features

- JSONPath expression support (properties, arrays, wildcards, filters)
- Array filtering with conditions (`?(@.field>value)`)
- Recursive descent (`$..key`) to find nested values
- Array slicing (`[0:5]`, `[::2]`)
- CSV export for tabular data
- Pipe-friendly (reads from stdin)
- Colorful terminal output
- Zero external dependencies

## Options

| Flag | Description |
|------|-------------|
| `--count` | Show count of matching elements instead of values |
| `--format csv` | Output results as CSV |
| `--json` | Output results as a JSON array |
| `--pretty` | Pretty-print JSON output |
| `--help` | Show help message |

## JSONPath Expressions

| Expression | Description |
|-----------|-------------|
| `$.store.book` | Access nested property |
| `$.users[0]` | Array index |
| `$.users[*].name` | All items' name field |
| `$.users[?(@.age>21)]` | Filter by condition |
| `$..name` | Recursive descent (find all "name" keys) |
| `$.data[0:5]` | Array slice |

## License

MIT - [LXGIC Studios](https://lxgicstudios.com)
