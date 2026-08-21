// electron's own postinstall (node_modules/electron/install.js) uses the
// `extract-zip` package to unpack the downloaded electron.exe. On this
// machine something (AV/EDR) silently kills node.exe the instant it tries
// to stream-read a zip containing electron.exe, leaving node_modules/electron
// half-installed with no error. Windows' own archive extraction isn't
// affected, so if the normal install left electron.exe missing, this
// script re-downloads (or reuses the cache) and extracts via PowerShell
// instead.
const { existsSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')

const pkgDir = join(__dirname, '..', 'node_modules', 'electron')
const exePath = join(pkgDir, 'dist', 'electron.exe')

if (process.platform !== 'win32' || existsSync(exePath)) {
  process.exit(0)
}

console.log('[ensure-electron] electron.exe missing after npm install — recovering via PowerShell extraction...')

const { downloadArtifact } = require('@electron/get')
const { version } = require(join(pkgDir, 'package.json'))

downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64' })
  .then((zipPath) => {
    const distDir = join(pkgDir, 'dist')
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force`
      ],
      { stdio: 'inherit' }
    )
    writeFileSync(join(pkgDir, 'path.txt'), 'electron.exe')
    if (!existsSync(exePath)) throw new Error('electron.exe still missing after extraction')
    console.log('[ensure-electron] recovered electron.exe successfully.')
  })
  .catch((err) => {
    console.error('[ensure-electron] failed to recover electron install:', err)
    process.exitCode = 1
  })
