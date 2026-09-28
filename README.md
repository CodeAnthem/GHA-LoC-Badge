[![Lines of Code](https://raw.githubusercontent.com/CodeAnthem/GHA-LoC-Badge/images/loc.svg)](https://github.com/CodeAnthem/GHA-LoC-Badge/tree/images)

This action counts physical lines and writes an SVG in the workflow workspace. It does not take a token and it does not push.

Maintained fork of [shadowmoose/GHA-LoC-Badge](https://github.com/shadowmoose/GHA-LoC-Badge), MIT, copyright 2020 Mike.

## Usage

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:
      persist-credentials: false

  - uses: CodeAnthem/GHA-LoC-Badge@1852e101b6ff5e805051481e7d3ac755f24d8101
    with:
      patterns: "**"
      ignore: node_modules
      badge: ./badge.svg
```

## Line count

An empty file is 0. A trailing newline does not add a line. Blank lines and comments count. Version 1.0.0 counted one extra line when a file ended with a newline.

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

## Outputs

| Output | Meaning |
| --- | --- |
| `total_lines` | Physical lines across counted files. |
| `counted_files` | Number of files included. |
| `elapsed_ms` | Scan time in milliseconds. |
| `output_path` | Absolute path of the SVG. |
| `output_dir` | Absolute path of the SVG's directory. |
| `ignored_files` | Number of matches excluded by `ignore`. |

## Publish the SVG yourself

This job is yours. It is not part of the action. The publish step uses the built-in job token. The push replaces the orphan `images` branch with `loc.svg` only.

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:
      persist-credentials: false

  - uses: CodeAnthem/GHA-LoC-Badge@1852e101b6ff5e805051481e7d3ac755f24d8101
    with:
      badge: loc.svg

  - name: Publish images branch
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      set -euo pipefail
      tmp="$(mktemp -d)"
      cp loc.svg "$tmp/loc.svg"
      cd "$tmp"
      git init -b images
      git add loc.svg
      git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Update lines-of-code badge"
      gh auth setup-git
      git push --force "https://github.com/${GITHUB_REPOSITORY}.git" HEAD:refs/heads/images
```

## Development

Edit `src/`, then run `npm test`. `npm test` rebuilds `dist/index.js`. GitHub runs that committed bundle. It does not run `npm install` for the action. Do not edit `dist/` by hand.
