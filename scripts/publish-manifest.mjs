#!/usr/bin/env node
// Writes docs/version.json — the file installed apps read to learn a newer
// ComicPill exists. Run it AFTER the APK is attached to a GitHub release.
//
//   node scripts/publish-manifest.mjs "What's new in one sentence"
//   node scripts/publish-manifest.mjs "Notes" --min 1.1.0     # force older versions to update
//
// The version always comes from app.json, so the manifest can never claim a
// version the app itself doesn't have. Then commit + push docs/ (GitHub Pages).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;
const APK_URL = 'https://github.com/mukund1312/ComicPill/releases/latest/download/comicpill.apk';

const args = process.argv.slice(2);
const minIdx = args.indexOf('--min');
const minSupported = minIdx >= 0 ? (args[minIdx + 1] ?? '') : null;
// Everything that isn't the --min flag or its value is the notes.
const notes = args.filter((_, i) => minIdx < 0 || (i !== minIdx && i !== minIdx + 1))[0] ?? '';

const cmp = (a, b) => {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
};

const version = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo?.version;
const fail = (msg) => { console.error(`publish-manifest: ${msg}`); process.exit(1); };

if (!SEMVER.test(version ?? '')) fail(`app.json version "${version}" is not x.y.z`);
if (minSupported !== null && !SEMVER.test(minSupported)) fail(`--min "${minSupported}" is not x.y.z`);
if (minSupported !== null && cmp(minSupported, version) > 0) fail(`--min ${minSupported} is newer than the version being published (${version})`);
if (notes.length > 300) fail(`notes are ${notes.length} characters; the limit is 300`);

const manifest = { latest: version, apkUrl: APK_URL, notes: notes || null, minSupported };
writeFileSync(join(root, 'docs', 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote docs/version.json for ${version}`);
