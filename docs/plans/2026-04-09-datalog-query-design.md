# Datalog Query Tool Design

## Purpose

Add a `datalog_query` tool that exposes Roam's Datomic database through raw Datalog queries via the local API.

## Research Findings

The local API at `http://127.0.0.1:{port}/api/{graphName}` supports two undocumented Datomic actions:

- **`q`** action: Accepts a Datalog query string and optional positional inputs. Args format: `[queryString, ...inputs]`.
- **`pull`** action: Accepts a selector and entity ID. Args format: `[selector, eid]`.

These use the same auth model (local tokens) and endpoint as all other tools.

## Decision

Ship `q` only. Keep surface minimal. `pull` can be added later if needed.

## Implementation

- `packages/core/src/operations/datalog.ts` — Schema (query string + optional inputs array) and handler
- `packages/core/src/tools.ts` — Tool registration as a standard client tool
- Results wrapped as `{total: N, results: [...]}` for consistency with other query/search tools
- Raw Datalog results returned untouched inside `results`
