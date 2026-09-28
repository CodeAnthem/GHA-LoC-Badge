# Lines of Code Badge

This action counts physical lines in the files you choose and writes an SVG badge into the workflow workspace. It does not create a commit, push a branch, or read a token.

It is a maintained fork of [shadowmoose/GHA-LoC-Badge](https://github.com/shadowmoose/GHA-LoC-Badge). The original project is MIT licensed, copyright 2020 Mike. See [LICENSE](./LICENSE).

Callers that pinned `shadowmoose/GHA-LoC-Badge@1.0.0` should switch to the full commit SHA of `v2.0.0` in this repository. Version 1.0.0 runs on Node 12 and writes outputs with the removed `::set-output` command. This fork runs on Node 24 and writes `$GITHUB_OUTPUT`.

## What is counted

A line is a physical line. Blank lines and comments count. The counter looks for `\n` bytes.

| File contents | Lines |
| --- | --- |
| empty file | 0 |
| `a` | 1 |
| `a\n` | 1 |
| `a\nb` | 2 |
| `a\nb\n` | 2 |
| `a\r\nb\r\n` | 2 |

`shadowmoose/GHA-LoC-Badge@1.0.0` started at 1 and added 1 for every newline, so a file that ended with a newline was one line high and an empty file was reported as 1. This fork does not add that extra line. Badge numbers will be lower than 1.0.0 for repositories whose files end with a newline.

Each matching file is counted once, even when two patterns select it. A file that cannot be read is logged and skipped. One unreadable file does not fail the job. If the SVG cannot be written, the step fails. A scan that matches nothing still writes a badge whose message is `0`, sets `counted_files` to `0`, and exits successfully. You decide whether zero files should fail the job.

`node_modules` in `ignore` excludes that directory at any depth. `.git` is always excluded.

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

`**` counts files in the scanned directory and in nested directories. `*.ps1` counts matching files in that directory only. `**/*.ps1` counts the same names in that directory and in nested directories. `src/*.js` counts files directly in `src`.

## Outputs

| Output | Meaning |
| --- | --- |
| `total_lines` | Physical lines across counted files. |
| `counted_files` | Number of files included. |
| `elapsed_ms` | Scan time in milliseconds. |
| `output_path` | Absolute path of the SVG. |
| `output_dir` | Absolute path of the SVG's directory. |
| `ignored_files` | Number of matches excluded by `ignore`. |

## Usage

Pin `actions/checkout` and this action to full commit SHAs. `persist-credentials: false` keeps the job token out of `.git`. This step does not take a token. The SVG stays in the workspace unless a later step that you own publishes it.

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:
      persist-credentials: false

  - uses: CodeAnthem/GHA-LoC-Badge@<full sha>
    id: badge
    with:
      badge: ./output/loc.svg
      patterns: "*.ps1|*.bat"
      badge_label: lines of code
      badge_color: blue
      badge_style: flat
```

`<full sha>` is the 40-character commit named by the `v2.0.0` release.

## Publish the badge yourself

The following job is yours. It is not part of the action. `GITHUB_TOKEN` in this step is created by GitHub for the job, dies when the job ends, and is limited to the repository running the workflow. Set the repository Actions permission to read and write for this publish job. Do not create a personal access token for it.

Leave the publish step out when you only need the SVG in the workspace.

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:
      persist-credentials: false

  - uses: CodeAnthem/GHA-LoC-Badge@<full sha>
    id: badge
    with:
      badge: ./output/loc.svg
      patterns: "*.ps1|*.bat"
      badge_label: lines of code
      badge_color: blue
      badge_style: flat

  - name: Publish badges branch
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      set -euo pipefail
      svg="$PWD/output/loc.svg"
      tmp="$(mktemp -d)"
      cp "$svg" "$tmp/loc.svg"
      cd "$tmp"
      git init -b badges
      git add loc.svg
      git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m 'Update lines-of-code badge'
      gh auth setup-git
      git push --force "https://github.com/${GITHUB_REPOSITORY}.git" HEAD:badges
```

The push replaces the orphan `badges` branch with `loc.svg` only. The token is not printed. After that branch exists, the badge image is `https://raw.githubusercontent.com/<owner>/<repo>/badges/loc.svg`.

## Development

```sh
npm ci
npm test
```

`npm test` rebuilds `dist/index.js` and runs the Node test suite. GitHub runs the committed bundle. It does not run `npm install` for the action.
