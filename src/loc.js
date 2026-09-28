import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { badgen } from 'badgen';
import { glob } from 'glob';
import { publishBadge } from './publish.js';

const READ_CONCURRENCY = 10;

function isBlankLine(bytes) {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 13) end -= 1;
  for (let i = 0; i < end; i += 1) {
    const byte = bytes[i];
    if (byte !== 32 && byte !== 9) return false;
  }
  return true;
}

/**
 * Physical lines. A final partial line counts.
 * An empty file is 0. A trailing newline does not add an extra line.
 * Blank lines are skipped unless `ignoreBlankLines` is false.
 * A blank line is empty or contains only spaces and tabs.
 */
export function countLines(fullPath, options = {}) {
  const ignoreBlank = options.ignoreBlankLines !== false;
  return new Promise((resolve, reject) => {
    let lines = 0;
    let sawByte = false;
    let endsWithNewline = false;
    let pending = Buffer.alloc(0);
    const stream = fs.createReadStream(fullPath);
    stream.on('data', (chunk) => {
      if (chunk.length === 0) return;
      sawByte = true;
      if (!ignoreBlank) {
        let index = -1;
        while ((index = chunk.indexOf(10, index + 1)) !== -1) lines += 1;
        endsWithNewline = chunk[chunk.length - 1] === 10;
        return;
      }
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      let start = 0;
      let index = pending.indexOf(10);
      while (index !== -1) {
        if (!isBlankLine(pending.subarray(start, index))) lines += 1;
        start = index + 1;
        index = pending.indexOf(10, start);
      }
      pending = Buffer.from(pending.subarray(start));
    });
    stream.on('end', () => {
      if (!ignoreBlank) {
        if (sawByte && !endsWithNewline) lines += 1;
      } else if (pending.length > 0 && !isBlankLine(pending)) {
        lines += 1;
      }
      resolve(lines);
    });
    stream.on('error', reject);
  });
}

export function patternList(value) {
  if (value == null) return [];
  return String(value)
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function expandInclude(pattern) {
  const extra = [];
  if (pattern === '**') {
    extra.push('**/*', '*');
  } else if (pattern.startsWith('**/')) {
    const rest = pattern.slice(3);
    if (rest) extra.push(rest);
  }
  return [pattern, ...extra];
}

function expandIgnore(pattern) {
  if (pattern.includes('/') || pattern.includes('\\')) return [pattern];
  return [pattern, `**/${pattern}`, `${pattern}/**`, `**/${pattern}/**`];
}

function dedupeKey(fullPath) {
  const resolved = path.resolve(fullPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export async function listFiles(directory, patterns, userIgnore) {
  const root = path.resolve(directory || './');
  const include = patterns.flatMap(expandInclude);
  const ignore = [
    '.git/**',
    '**/.git/**',
    ...userIgnore.flatMap(expandIgnore),
  ];
  const matches = await glob(include, {
    cwd: root,
    ignore,
    nodir: true,
    dot: false,
    absolute: false,
  });
  const seen = new Set();
  const files = [];
  for (const rel of matches) {
    const full = path.resolve(root, rel);
    const key = dedupeKey(full);
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(full);
  }
  return files;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Math.min(limit, items.length);
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  if (workers === 0) return results;
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function errorText(err) {
  if (err instanceof Error) return err.message || err.toString();
  return String(err);
}

export async function scan(options = {}) {
  const started = Date.now();
  const directory = options.directory || './';
  const include = patternList(options.patterns);
  const patterns = include.length > 0 ? include : ['**'];
  const userIgnore = options.ignore == null ? ['node_modules'] : patternList(options.ignore);
  const countFile = options.countFile || countLines;
  const ignoreBlankLines = options.ignoreBlankLines !== false;
  const matched = await listFiles(directory, patterns, []);
  const files = userIgnore.length === 0
    ? matched
    : await listFiles(directory, patterns, userIgnore);
  const ignored = Math.max(0, matched.length - files.length);

  let lines = 0;
  let counted = 0;
  await mapLimit(files, READ_CONCURRENCY, async (fullPath) => {
    try {
      const fileLines = await countFile(fullPath, { ignoreBlankLines });
      lines += fileLines;
      counted += 1;
      if (options.debug && options.log) options.log(`Counting: ${fullPath}`);
    } catch (err) {
      const message = `Skipping unreadable file ${fullPath}: ${errorText(err)}`;
      if (options.onFileError) options.onFileError(message);
    }
  });

  return {
    lines,
    counted,
    ignored,
    elapsedMs: Date.now() - started,
  };
}

export function renderBadge(lines, config = {}) {
  const label = config.label || 'Lines of Code';
  const color = config.color || 'blue';
  const labelColor = config.labelColor || config.labelcolor || '555';
  const style = config.style || 'classic';
  const parsed = config.scale ? Number.parseInt(config.scale, 10) : 1;
  const scale = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return badgen({
    label: String(label),
    labelColor: String(labelColor),
    status: Number(lines).toLocaleString('en-US'),
    color: String(color),
    style,
    scale,
  });
}

export async function writeBadge(badgePath, lines, badgeOptions = {}) {
  const svg = renderBadge(lines, badgeOptions);
  await fsp.mkdir(path.dirname(path.resolve(badgePath)), { recursive: true });
  await fsp.writeFile(badgePath, svg);
  return svg;
}

export async function execute(options, core) {
  try {
    const result = await scan(options);
    const badgePath = options.badge || './badge.svg';
    await writeBadge(badgePath, result.lines, options.badgeOptions || {});
    core.setOutput('total_lines', String(result.lines));
    core.setOutput('ignored_files', String(result.ignored));
    core.setOutput('counted_files', String(result.counted));
    core.setOutput('elapsed_ms', String(result.elapsedMs));
    core.setOutput('output_path', path.resolve(badgePath));
    core.setOutput('output_dir', path.resolve(path.dirname(badgePath)));
    const branch = String(options.badgeBranch || '').trim();
    if (branch) {
      await publishBadge({
        badgePath,
        branch,
        env: options.env || process.env,
        remote: options.remote,
        run: options.runCommand,
      });
    }
    return result;
  } catch (err) {
    core.setFailed(errorText(err));
    return null;
  }
}
