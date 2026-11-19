// One-off tool: renders the app's emoji icon (🗺️) to build/icon.png by
// loading it in a hidden BrowserWindow and capturing the page. Run with the
// project's own electron.exe, not plain node:
//   node_modules/electron/dist/electron.exe scripts/generate-icon.cjs
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const SIZE = 512
const EMOJI = '🗺️'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: false }
  })

  const html = `
    <!doctype html><html><head><style>
      html, body { margin:0; padding:0; width:${SIZE}px; height:${SIZE}px; background: transparent; }
      .wrap { width:${SIZE}px; height:${SIZE}px; display:flex; align-items:center; justify-content:center; }
      .emoji { font-size:${SIZE * 0.72}px; line-height:1; font-family: 'Segoe UI Emoji', sans-serif; }
    </style></head><body>
      <div class="wrap"><div class="emoji">${EMOJI}</div></div>
    </body></html>`

  await win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 200)) // let emoji font settle

  const image = await win.webContents.capturePage()
  const outDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'icon.png'), image.toPNG())

  console.log('wrote', path.join(outDir, 'icon.png'), image.getSize())
  app.quit()
})
