// Publishes the installer built by `npm run dist` as a GitHub Release on
// alxkim97/remap, which is where every installed copy's self-updater looks.
//
// Usage: npm run release               (builds, then publishes)
//        node scripts/publish-release.cjs "release notes"   (publish only)
//
// Needs the GitHub CLI (gh) logged in. The tag is v<package.json version>,
// so bump the version before releasing; gh refuses a tag that already exists.
const { readFileSync, existsSync } = require('fs')
const { execFileSync } = require('child_process')
const { join } = require('path')

const root = join(__dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const notes = process.argv[2] || `Remap v${version} for Windows.`
const gh = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh'

const dist = join(root, 'dist')
const latest = readFileSync(join(dist, 'latest.yml'), 'utf8')
if (!/^version: (.+)$/m.test(latest) || latest.match(/^version: (.+)$/m)[1].trim() !== version) {
  console.error(`dist/latest.yml is not for ${version}; run npm run dist first`)
  process.exit(1)
}

const files = [`Remap-Setup-${version}.exe`, `Remap-Setup-${version}.exe.blockmap`, 'latest.yml'].map((f) => {
  const p = join(dist, f)
  if (!existsSync(p)) {
    console.error(`missing ${p}`)
    process.exit(1)
  }
  return p
})

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim()
if (status) console.warn('warning: working tree has uncommitted changes; the release tag points at HEAD')

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
execFileSync(gh, ['release', 'create', `v${version}`, '--repo', 'alxkim97/remap', '--target', sha, '--title', `Remap ${version}`, '--notes', notes, ...files], {
  cwd: root,
  stdio: 'inherit'
})
