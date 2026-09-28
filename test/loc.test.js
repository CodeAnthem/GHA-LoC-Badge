import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { countLines, execute, renderBadge, scan } from '../src/loc.js';
import { publishBadge, repositoryUrl, runCommand, validBranch } from '../src/publish.js';

async function withFixture(files, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'loc-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const full = path.join(dir, ...rel.split('/'));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, contents);
    }
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function mockCore(outputs, failed) {
  return {
    setOutput(name, value) {
      outputs[name] = value;
    },
    setFailed(message) {
      failed.push(message);
    },
  };
}

test('counts physical lines, including CRLF and empty files', async () => {
  const cases = [
    [Buffer.alloc(0), 0],
    [Buffer.from('a'), 1],
    [Buffer.from('a\n'), 1],
    [Buffer.from('a\nb'), 2],
    [Buffer.from('a\nb\n'), 2],
    [Buffer.from('a\r\nb\r\n'), 2],
  ];
  for (const [bytes, expected] of cases) {
    await withFixture({ 'sample.txt': bytes }, async (dir) => {
      assert.equal(await countLines(path.join(dir, 'sample.txt')), expected);
    });
  }
});

test('blank lines are ignored unless the filter is turned off', async () => {
  const cases = [
    [Buffer.from('\n'), 0, 1],
    [Buffer.from('\n\n'), 0, 2],
    [Buffer.from('a\n\nb\n'), 2, 3],
    [Buffer.from('a\n \nb\n'), 2, 3],
    [Buffer.from('a\n\t\nb'), 2, 3],
    [Buffer.from('a\r\n\r\nb\r\n'), 2, 3],
    [Buffer.from('  \n'), 0, 1],
  ];
  for (const [bytes, skipped, physical] of cases) {
    await withFixture({ 'sample.txt': bytes }, async (dir) => {
      const file = path.join(dir, 'sample.txt');
      assert.equal(await countLines(file), skipped);
      assert.equal(await countLines(file, { ignoreBlankLines: false }), physical);
    });
  }
});

test('** counts a root file and a nested file', async () => {
  await withFixture({
    'sync-game-mods.ps1': 'a\n',
    'src/app.ps1': 'a\nb\n',
  }, async (dir) => {
    const result = await scan({ directory: dir, patterns: '**', ignore: '' });
    assert.equal(result.counted, 2);
    assert.equal(result.lines, 3);
  });
});

test('*.ps1 counts only the root file', async () => {
  await withFixture({
    'sync-game-mods.ps1': 'a\n',
    'src/app.ps1': 'a\nb\n',
  }, async (dir) => {
    const result = await scan({ directory: dir, patterns: '*.ps1', ignore: '' });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 1);
  });
});

test('**/*.ps1 counts the root file and the nested file', async () => {
  await withFixture({
    'sync-game-mods.ps1': 'a\n',
    'src/app.ps1': 'a\nb\n',
  }, async (dir) => {
    const result = await scan({ directory: dir, patterns: '**/*.ps1', ignore: '' });
    assert.equal(result.counted, 2);
    assert.equal(result.lines, 3);
  });
});

test('src/*.js counts files directly in src', async () => {
  await withFixture({
    'src/app.js': 'a\n',
    'src/nested/skip.js': 'a\nb\n',
    'other.js': 'a\n',
  }, async (dir) => {
    const result = await scan({ directory: dir, patterns: 'src/*.js', ignore: '' });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 1);
  });
});

test('directory pointed at a subdirectory reads files inside it', async () => {
  await withFixture({
    'app.js': 'only\n',
    'src/app.js': 'a\nb\n',
  }, async (dir) => {
    const result = await scan({
      directory: path.join(dir, 'src'),
      patterns: '**',
      ignore: '',
    });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 2);
  });
});

test('pipe-separated patterns include each listed kind of file', async () => {
  await withFixture({
    'sync-game-mods.ps1': 'a\n',
    'build.bat': 'a\nb\n',
    'notes.md': 'a\n',
  }, async (dir) => {
    const result = await scan({
      directory: dir,
      patterns: ' *.ps1 | *.bat ',
      ignore: '',
    });
    assert.equal(result.counted, 2);
    assert.equal(result.lines, 3);
  });
});

test('ignore excludes node_modules at any depth', async () => {
  await withFixture({
    'src/app.js': 'a\n',
    'node_modules/pkg/index.js': 'a\nb\nc\n',
    'vendor/node_modules/lib.js': 'a\n',
  }, async (dir) => {
    const result = await scan({
      directory: dir,
      patterns: '**',
      ignore: 'node_modules',
    });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 1);
    assert.equal(result.ignored, 2);
  });
});

test('.git is ignored', async () => {
  await withFixture({
    'readme.txt': 'a\n',
    '.git/HEAD': 'ref: refs/heads/master\n',
  }, async (dir) => {
    const result = await scan({
      directory: dir,
      patterns: '**|.git/**',
      ignore: '',
    });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 1);
  });
});

test('two patterns that match one file count it once', async () => {
  await withFixture({
    'sync-game-mods.ps1': 'a\nb\n',
  }, async (dir) => {
    const result = await scan({
      directory: dir,
      patterns: '*.ps1|**/*.ps1',
      ignore: '',
    });
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 2);
  });
});

test('a missing file inside the match set does not fail the scan', async () => {
  await withFixture({
    'ok.txt': 'a\n',
    'broken.txt': 'zzz\n',
  }, async (dir) => {
    const errors = [];
    const result = await scan({
      directory: dir,
      patterns: '**',
      ignore: '',
      countFile: async (file) => {
        if (path.basename(file) === 'broken.txt') await fs.rm(file);
        return countLines(file);
      },
      onFileError: (message) => {
        assert.equal(typeof message, 'string');
        errors.push(message);
      },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken\.txt/);
    assert.equal(result.counted, 1);
    assert.equal(result.lines, 1);
  });
});

test('zero matches writes an SVG whose text contains 0 and succeeds', async () => {
  await withFixture({ 'keep.txt': 'a\n' }, async (dir) => {
    const badge = path.join(dir, 'nested', 'badge.svg');
    const outputs = {};
    const failed = [];
    const result = await execute({
      directory: dir,
      patterns: '*.no-such-ext',
      ignore: '',
      badge,
      badgeOptions: { style: 'classic' },
    }, mockCore(outputs, failed));
    assert.equal(failed.length, 0);
    assert.equal(result.counted, 0);
    assert.equal(result.lines, 0);
    assert.equal(outputs.counted_files, '0');
    assert.equal(outputs.total_lines, '0');
    const svg = await fs.readFile(badge, 'utf8');
    assert.match(svg, />0</);
    assert.equal(outputs.output_path, path.resolve(badge));
    assert.equal(outputs.output_dir, path.resolve(path.dirname(badge)));
  });
});

test('the SVG is written at the requested badge path', async () => {
  await withFixture({ 'app.js': 'a\nb\n' }, async (dir) => {
    const badge = path.join(dir, 'output', 'loc.svg');
    const outputs = {};
    const failed = [];
    await execute({
      directory: dir,
      patterns: '**',
      ignore: '',
      badge,
    }, mockCore(outputs, failed));
    assert.equal(failed.length, 0);
    const svg = await fs.readFile(badge, 'utf8');
    assert.match(svg, />2</);
    assert.equal(await fs.stat(badge).then((stat) => stat.isFile()), true);
  });
});

test('a failure to write the SVG calls setFailed with a string', async () => {
  await withFixture({
    'app.js': 'a\n',
    blocker: 'not a directory',
  }, async (dir) => {
    const failed = [];
    const result = await execute({
      directory: dir,
      patterns: '**',
      ignore: '',
      badge: path.join(dir, 'blocker', 'badge.svg'),
    }, mockCore({}, failed));
    assert.equal(result, null);
    assert.equal(failed.length, 1);
    assert.equal(typeof failed[0], 'string');
    assert.ok(failed[0].length > 0);
  });
});

test('flat and classic badges both show the line count', () => {
  const classic = renderBadge(4, { style: 'classic', labelcolor: 'abc' });
  const flat = renderBadge(4, { style: 'flat', labelcolor: 'abc' });
  assert.match(classic, />4</);
  assert.match(flat, />4</);
  assert.match(classic, /abc/);
  assert.notEqual(classic, flat);
});

test('debug logs each counted file', async () => {
  await withFixture({ 'app.js': 'a\n' }, async (dir) => {
    const messages = [];
    const result = await scan({
      directory: dir,
      patterns: '**',
      ignore: '',
      debug: true,
      log: (message) => messages.push(message),
    });
    assert.equal(result.counted, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /app\.js/);
  });
});

test('bundled action writes the SVG and GITHUB_OUTPUT', async () => {
  const bundle = path.resolve('dist/index.js');
  await fs.access(bundle);
  const source = await fs.readFile(bundle, 'utf8');
  assert.match(source, /GITHUB_OUTPUT/);
  assert.doesNotMatch(source, /x-access-token/);
  assert.doesNotMatch(source, /ghp_[A-Za-z0-9]/);

  await withFixture({
    'root.txt': 'a\n\n',
    'src/nested.txt': 'a\nb\n',
  }, async (dir) => {
    const outputFile = path.join(os.tmpdir(), `loc-output-${path.basename(dir)}.txt`);
    await fs.writeFile(outputFile, '');
    const badge = path.join(dir, 'out', 'loc.svg');
    try {
    const env = { ...process.env };
    delete env.GITHUB_TOKEN;
    delete env.GH_TOKEN;
    delete env.INPUT_BADGE_BRANCH;
    env.GITHUB_OUTPUT = outputFile;
    env.INPUT_DIRECTORY = dir;
    env.INPUT_BADGE = badge;
    env.INPUT_PATTERNS = '**';
    env.INPUT_IGNORE = 'node_modules';
    env.INPUT_DEBUG = 'false';
    env.INPUT_BADGE_LABEL = 'Lines of Code';
    env.INPUT_BADGE_COLOR = 'blue';
    env.INPUT_BADGE_STYLE = 'flat';
    env.INPUT_BADGE_SCALE = '1';
    env.INPUT_BADGE_LABELCOLOR = '555';

    const { code, stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bundle], { cwd: dir, env });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ code: status, stdout: out, stderr: err }));
    });

    assert.equal(code, 0, `${stdout}\n${stderr}`);
    assert.doesNotMatch(stdout, /::set-output/);
    const svg = await fs.readFile(badge, 'utf8');
    assert.match(svg, />3</);
    const githubOutput = await fs.readFile(outputFile, 'utf8');
    assert.match(githubOutput, /total_lines<<[^\r\n]+\r?\n3/);
    assert.match(githubOutput, /counted_files<<[^\r\n]+\r?\n2/);
    } finally {
      await fs.rm(outputFile, { force: true });
    }
  });
});

test('badge_branch accepts a normal branch and rejects the rest', () => {
  assert.equal(validBranch('images'), true);
  assert.equal(validBranch('badges/loc'), true);
  assert.equal(validBranch(''), false);
  assert.equal(validBranch('-images'), false);
  assert.equal(validBranch('refs/heads/../master'), false);
  assert.equal(repositoryUrl('CodeAnthem/GHA-LoC-Badge'), 'https://github.com/CodeAnthem/GHA-LoC-Badge.git');
  assert.throws(() => repositoryUrl('https://github.com/owner/repo.git'), /owner\/name/);
});

test('publishing replaces the branch with the badge file only', async () => {
  await withFixture({ 'out/loc.svg': '<svg>badge</svg>' }, async (dir) => {
    const remote = path.join(dir, 'remote.git');
    await runCommand('git', ['init', '--bare', '-b', 'images', remote]);
    const badgePath = path.join(dir, 'out', 'loc.svg');
    await publishBadge({
      badgePath,
      branch: 'images',
      remote,
      env: {},
    });
    await fs.writeFile(badgePath, '<svg>next</svg>');
    await publishBadge({
      badgePath,
      branch: 'images',
      remote,
      env: {},
    });
    const listed = await runCommand('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'refs/heads/images']);
    assert.equal(listed.stdout.trim(), 'loc.svg');
    const count = await runCommand('git', ['--git-dir', remote, 'rev-list', '--count', 'refs/heads/images']);
    assert.equal(count.stdout.trim(), '1');
    const shown = await runCommand('git', ['--git-dir', remote, 'show', 'refs/heads/images:loc.svg']);
    assert.equal(shown.stdout, '<svg>next</svg>');
  });
});

test('https publishing without a token fails and command errors hide the token', async () => {
  await withFixture({ 'loc.svg': '<svg></svg>' }, async (dir) => {
    await assert.rejects(
      () => publishBadge({
        badgePath: path.join(dir, 'loc.svg'),
        branch: 'images',
        env: { GITHUB_REPOSITORY: 'owner/repo' },
      }),
      /GH_TOKEN/,
    );
  });
  const secret = 'super-secret-token';
  await assert.rejects(
    () => runCommand(process.execPath, ['-e', 'process.stderr.write(process.env.GH_TOKEN || ""); process.exit(1)'], {
      env: { ...process.env, GH_TOKEN: secret },
    }),
    (err) => {
      assert.equal(err.message.includes(secret), false);
      assert.match(err.message, /\*\*\*/);
      return true;
    },
  );
});
