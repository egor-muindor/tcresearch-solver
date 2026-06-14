// scripts/deploy-gh-pages.mjs
//
// Build the app and publish dist/ to the gh-pages branch as a single orphan
// commit (force-push). GitHub Pages then serves it at
// https://<user>.github.io/tcresearch-solver/.
//
// Usage:  bun run deploy
// Env:    DEPLOY_REMOTE (default "origin"), DEPLOY_BRANCH (default "gh-pages")
//
// Implementation note: dist/ is gitignored, so we stage it into a throwaway
// index with dist/ as the work-tree (the repo .gitignore isn't consulted there),
// write a tree, make a parentless commit, and force-push it — without ever
// touching the working tree or the real index.

import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GIT_DIR = resolve(ROOT, '.git');
const DIST = resolve(ROOT, 'dist');
const TMP_INDEX = resolve(ROOT, 'tmp/gh-pages-deploy.index');
const REMOTE = process.env.DEPLOY_REMOTE || 'origin';
const BRANCH = process.env.DEPLOY_BRANCH || 'gh-pages';

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const cap = (cmd, env) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', env: env ?? process.env }).trim();
const log = (m) => process.stderr.write(`[deploy] ${m}\n`);

// 1. Fresh production build.
log('building…');
execSync('bun run build', { cwd: ROOT, stdio: 'inherit' });

// 2. .nojekyll so Pages serves every path verbatim (no Jekyll processing).
writeFileSync(resolve(DIST, '.nojekyll'), '');

// 3. Stage dist/ into a throwaway index (dist as work-tree).
mkdirSync(resolve(ROOT, 'tmp'), { recursive: true });
rmSync(TMP_INDEX, { force: true });
const env = { ...process.env, GIT_INDEX_FILE: TMP_INDEX };
cap(`git --git-dir=${q(GIT_DIR)} --work-tree=${q(DIST)} add -A`, env);
const tree = cap(`git --git-dir=${q(GIT_DIR)} write-tree`, env);
rmSync(TMP_INDEX, { force: true });

// 4. Parentless (orphan) commit — keeps gh-pages a single clean commit.
const master = cap('git rev-parse --short master');
const commit = cap(`git commit-tree ${tree} -m ${q(`deploy: production build of master@${master}`)}`);

// 5. Force-push the commit straight to the branch.
log(`pushing ${commit.slice(0, 8)} -> ${REMOTE}/${BRANCH}`);
execSync(`git push --force ${q(REMOTE)} ${q(`+${commit}:refs/heads/${BRANCH}`)}`, {
  cwd: ROOT,
  stdio: 'inherit',
});
log('done. Live: https://egor-muindor.github.io/tcresearch-solver/');
