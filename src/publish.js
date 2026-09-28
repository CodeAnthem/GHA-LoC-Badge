import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const GIT_NAME = 'github-actions[bot]';
const GIT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

export function validBranch(branch) {
  if (!branch || branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/')) return false;
  if (branch.includes('..') || branch.includes('@{') || branch.includes('\\') || /\s/.test(branch)) return false;
  return /^[A-Za-z0-9._/-]+$/.test(branch);
}

export function repositoryUrl(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('GITHUB_REPOSITORY is missing or is not owner/name.');
  }
  return `https://github.com/${repository}.git`;
}

function redact(text, env = {}) {
  let out = String(text || '');
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const secret = env[key];
    if (secret) out = out.split(secret).join('***');
  }
  return out;
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      err.message = redact(err.message, options.env);
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(redact(`${command} failed: ${stderr || stdout}`, options.env)));
    });
  });
}

export async function publishBadge(options) {
  const branch = String(options.branch || '').trim();
  if (!validBranch(branch)) throw new Error('badge_branch must be a branch name.');
  const badgePath = path.resolve(options.badgePath);
  const fileName = path.basename(badgePath);
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('badge file name is missing.');
  await fsp.access(badgePath);

  const env = options.env || process.env;
  const run = options.run || runCommand;
  const remote = options.remote || repositoryUrl(env.GITHUB_REPOSITORY);
  const https = remote.startsWith('https://');
  if (https && remote.includes('@')) throw new Error('The publish URL must not contain credentials.');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  if (https && !token) throw new Error('Publishing needs GH_TOKEN in the step environment.');

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'loc-badge-'));
  const pushEnv = { ...env, GIT_TERMINAL_PROMPT: '0' };
  if (token) pushEnv.GH_TOKEN = token;
  try {
    await fsp.copyFile(badgePath, path.join(tmp, fileName));
    await run('git', ['init', '-b', branch], { cwd: tmp, env: pushEnv });
    await run('git', ['add', '--', fileName], { cwd: tmp, env: pushEnv });
    const listed = await run('git', ['ls-files'], { cwd: tmp, env: pushEnv });
    if (listed.stdout.trim() !== fileName) throw new Error('The badge commit must contain only the badge file.');
    await run('git', [
      '-c', `user.name=${GIT_NAME}`,
      '-c', `user.email=${GIT_EMAIL}`,
      'commit', '-m', 'Update lines-of-code badge',
    ], { cwd: tmp, env: pushEnv });
    if (https) await run('gh', ['auth', 'setup-git'], { cwd: tmp, env: pushEnv });
    await run('git', ['push', '--force', remote, `HEAD:refs/heads/${branch}`], { cwd: tmp, env: pushEnv });
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}
