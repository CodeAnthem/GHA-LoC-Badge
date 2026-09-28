[![Source LoC](https://raw.githubusercontent.com/CodeAnthem/GHA-LoC-Badge/images/loc.svg)](https://github.com/CodeAnthem/GHA-LoC-Badge/tree/images) [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://github.com/CodeAnthem/GHA-LoC-Badge) [![Node.js 24](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/) [![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

This action counts physical lines and writes an SVG in the workflow workspace. It publishes that file only when `badge_branch` is set.

Maintained fork of [shadowmoose/GHA-LoC-Badge](https://github.com/shadowmoose/GHA-LoC-Badge), MIT, copyright 2020 Mike.

## What it counts

- Counts physical lines in the files you select.
- An empty file is 0.
- A trailing newline does not add a line.
- Blank lines are ignored. A line of only spaces or tabs is blank. Set `ignore_blank_lines` to `false` to count them.
- Comments count.

## Usage

This is the workflow this repository runs. Set `badge` and `badge_branch`, and pass `GH_TOKEN` on that step. The token is the built-in job token. The action reads it from the environment and replaces that branch with the badge file only. Leave `badge_branch` empty when the SVG should stay in the workspace. In this repository the action step is `uses: ./`.

After the branch exists, the badge image is the same branch and file:

```markdown
[![Source LoC](https://raw.githubusercontent.com/<owner>/<repo>/images/loc.svg)](https://github.com/<owner>/<repo>/tree/images)
```

```yaml
name: Create loc badge

on:
  push:
    branches:
      - master
  workflow_dispatch:

permissions:
  contents: write

jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false

      - name: Count lines
        uses: CodeAnthem/GHA-LoC-Badge@2447899fb1cf9fa092c09a94006a3508b4d4d911
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          directory: src
          badge: loc.svg
          badge_label: Source LoC
          badge_branch: images
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `directory` | `./` | Directory to scan. |
| `badge` | `./badge.svg` | Output SVG path, including the extension. Parent directories are created. |
| `patterns` | `**` | Include patterns, separated by `\|`. Each piece is trimmed. Empty pieces are dropped. |
| `ignore` | `node_modules` | Exclude patterns, same pipe syntax, applied even when a file matched `patterns`. |
| `badge_label` | `Lines of Code` | Left side of the badge. |
| `badge_color` | `blue` | Message color. |
| `badge_style` | `classic` | `flat` or `classic`. |
| `badge_scale` | `1` | Integer scale. |
| `badge_labelcolor` | `555` | Label color. |
| `debug` | `false` | Log each counted file when `true`. |
| `ignore_blank_lines` | `true` | Skip blank lines. A line of spaces or tabs is blank. `false` counts those lines. |
| `badge_branch` | empty | Branch that receives the badge file. Empty skips publishing. |

## Outputs

| Output | Meaning |
| --- | --- |
| `total_lines` | Physical lines across counted files. |
| `counted_files` | Number of files included. |
| `elapsed_ms` | Scan time in milliseconds. |
| `output_path` | Absolute path of the SVG. |
| `output_dir` | Absolute path of the SVG's directory. |
| `ignored_files` | Number of matches excluded by `ignore`. |

## Keep the Actions token off the default branch

`contents: write` can push to every branch that has no rule against it. Add a ruleset that includes only the default branch and requires a pull request. Let repository admins bypass that ruleset. Leave the badge branch out of it. The Actions token is not an admin, so it can still update the badge branch and cannot push to the default branch.

## Project structure

- `action.yml` is the metadata GitHub reads: inputs, outputs, and `dist/index.js` as the program to run.
- `src/` is the action source. This repository's badge counts that directory and everything inside it.
- `dist/index.js` is the committed bundle. Callers run this file. The Test workflow rebuilds it while testing. Do not edit it by hand.
- `test/loc.test.js` holds the tests. The Test workflow runs them with `npm test`.
- `.github/workflows/run-action.yml` runs the committed bundle the way a caller does and checks that a badge file was written. It does not publish that file.
- `.github/workflows/create-loc-badge.yml` counts `src` and sets `badge_branch` so the action publishes `loc.svg` to the `images` branch.
- `package.json` and `package-lock.json` pin the dependencies used to build and test.

## Dependencies

Node.js 24 runs the action. The npm packages are bundled into `dist/index.js`. Callers do not install them. The last two rows are GitHub actions used by this repository's workflows.

| Package | Version | Used for |
| --- | --- | --- |
| [`@actions/core`](https://www.npmjs.com/package/@actions/core) | 1.11.1 | Read inputs and write outputs. |
| [`badgen`](https://www.npmjs.com/package/badgen) | 3.3.2 | Draw the SVG. |
| [`glob`](https://www.npmjs.com/package/glob) | 13.0.6 | Find matching files. |
| [`@vercel/ncc`](https://www.npmjs.com/package/@vercel/ncc) | 0.45.0 | Build `dist/index.js`. Not part of the action callers run. |
| [`actions/checkout`](https://github.com/actions/checkout) | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Check out the repository in the workflows. |
| [`actions/setup-node`](https://github.com/actions/setup-node) | `820762786026740c76f36085b0efc47a31fe5020` | Install Node.js 24 for the Test workflow. |

## Development

Edit `src/`, then run `npm test`. `npm test` rebuilds `dist/index.js`. GitHub runs that committed bundle. It does not run `npm install` for the action. Do not edit `dist/` by hand.
