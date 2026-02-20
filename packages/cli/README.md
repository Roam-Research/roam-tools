# @roam-research/roam-cli

Command-line interface for [Roam Research](https://roamresearch.com/).

Used for setup (connecting graphs, managing tokens) and direct tool access (search, get pages, etc.).

## Setup

```bash
npx @roam-research/roam-cli connect
```

This walks you through selecting a graph, choosing permissions, and approving the token in the Roam desktop app.

## Usage

```bash
npx @roam-research/roam-cli connect                          # Interactive graph connection
npx @roam-research/roam-cli connect --graph <name> --nickname <name>  # Non-interactive
npx @roam-research/roam-cli list-graphs
npx @roam-research/roam-cli search --query "my notes"
npx @roam-research/roam-cli get-page --title "My Page"
```

Run `npx @roam-research/roam-cli --help` to see all available commands.

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for full documentation.
