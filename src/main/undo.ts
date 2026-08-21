import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { UndoApplyResult, UndoLog, UndoLogEntry, UndoSummary } from '../shared/types'

function undoDir(): string {
  return join(app.getPath('userData'), 'undo-logs')
}

export async function writeUndoLog(rootPath: string, entries: UndoLogEntry[]): Promise<string> {
  const dir = undoDir()
  await fs.mkdir(dir, { recursive: true })
  const timestamp = Date.now()
  const file = join(dir, `${timestamp}.json`)
  const log: UndoLog = { timestamp, rootPath, entries }
  await fs.writeFile(file, JSON.stringify(log, null, 2), 'utf-8')
  return file
}

export async function listUndoLogs(): Promise<UndoSummary[]> {
  const dir = undoDir()
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch {
    return []
  }
  const summaries: UndoSummary[] = []
  for (const file of files.filter((f) => f.endsWith('.json')).sort().reverse()) {
    try {
      const log: UndoLog = JSON.parse(await fs.readFile(join(dir, file), 'utf-8'))
      summaries.push({
        file: join(dir, file),
        timestamp: log.timestamp,
        rootPath: log.rootPath,
        opCount: log.entries.length
      })
    } catch {
      // skip unreadable/corrupt log files
    }
  }
  return summaries
}

export async function applyUndo(logFile: string): Promise<UndoApplyResult> {
  const log: UndoLog = JSON.parse(await fs.readFile(logFile, 'utf-8'))
  const failed: UndoApplyResult['failed'] = []
  let reversed = 0

  for (const entry of [...log.entries].reverse()) {
    try {
      if (entry.type === 'move') {
        if (entry.from === null) throw new Error('malformed entry')
        await fs.rename(entry.to, entry.from)
        reversed++
      } else {
        // mkdir: only remove if still empty — don't destroy anything the user added since.
        const contents = await fs.readdir(entry.to)
        if (contents.length === 0) {
          await fs.rmdir(entry.to)
          reversed++
        } else {
          failed.push({ entry, error: 'Folder is no longer empty; left in place.' })
        }
      }
    } catch (err) {
      failed.push({ entry, error: String(err) })
    }
  }

  // Once reversed, retire the log so it can't be double-applied.
  await fs.rm(logFile, { force: true })

  return { reversed, failed }
}
