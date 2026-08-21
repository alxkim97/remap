import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ScanEntry, ScanResult } from '../shared/types'

// Soft cap so picking a whole drive by mistake doesn't hang the app.
// Folder-scale usage (the app's current target) stays well under this.
const ITEM_CAP = 20000

export async function scanFolder(
  rootPath: string,
  onProgress?: (count: number) => void
): Promise<ScanResult> {
  let count = 0
  let truncated = false

  async function walk(path: string, name: string): Promise<ScanEntry> {
    const id = randomUUID()
    const stat = await fs.stat(path)

    if (!stat.isDirectory()) {
      count++
      return {
        id,
        name,
        path,
        isDirectory: false,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        children: []
      }
    }

    const node: ScanEntry = {
      id,
      name,
      path,
      isDirectory: true,
      size: null,
      mtimeMs: stat.mtimeMs,
      children: []
    }

    count++
    if (onProgress && count % 200 === 0) onProgress(count)

    if (truncated || count >= ITEM_CAP) {
      truncated = true
      return node
    }

    let dirEntries: string[]
    try {
      dirEntries = await fs.readdir(path)
    } catch {
      return node // permission-denied or similar; show the folder as empty
    }

    for (const entryName of dirEntries) {
      if (truncated || count >= ITEM_CAP) {
        truncated = true
        break
      }
      try {
        node.children.push(await walk(join(path, entryName), entryName))
      } catch {
        // Skip entries we can't stat (broken symlinks, permission errors, etc.)
      }
    }

    return node
  }

  const rootName = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath
  const root = await walk(rootPath, rootName)
  onProgress?.(count)

  return { root, totalItems: count, truncated }
}
