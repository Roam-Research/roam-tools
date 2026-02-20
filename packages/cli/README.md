# @roam-research/roam-cli

Command-line interface for [Roam Research](https://roamresearch.com/).

## Install

```bash
npm install -g @roam-research/roam-cli
```

## Setup

```bash
roam connect
```

This walks you through selecting a graph, choosing permissions, and approving the token in the Roam desktop app.

## Usage

```bash
roam list-graphs
roam connect                                                    # Interactive setup
roam connect --graph <name> --nickname <name>                   # Non-interactive
roam search --query "my notes" --graph <name-or-nickname>
roam get-page --title "My Page" --graph <name-or-nickname>
```

If you only have one graph configured, the `--graph` flag is optional.

Run `roam --help` to see all available commands.

## Using with npx

If you prefer not to install globally, you can use npx:

```bash
npx @roam-research/roam-cli connect
npx @roam-research/roam-cli search --query "my notes"
```

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for full documentation.
