import core from '@actions/core';
import { execute } from './loc.js';

function input(name, fallback) {
  const envName = `INPUT_${name.toUpperCase()}`;
  if (process.env[envName] === undefined) return fallback;
  return core.getInput(name);
}

await execute({
  directory: input('directory', './'),
  badge: input('badge', './badge.svg'),
  patterns: input('patterns', '**'),
  ignore: input('ignore', 'node_modules'),
  debug: input('debug', 'false') === 'true',
  ignoreBlankLines: input('ignore_blank_lines', 'true').toLowerCase() !== 'false',
  badgeBranch: input('badge_branch', '').trim(),
  badgeOptions: {
    label: input('badge_label', 'Lines of Code'),
    color: input('badge_color', 'blue'),
    style: input('badge_style', 'classic'),
    scale: input('badge_scale', '1'),
    labelcolor: input('badge_labelcolor', '555'),
  },
  log: (message) => core.info(message),
  onFileError: (message) => core.error(message),
}, core);
