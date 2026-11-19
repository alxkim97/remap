import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { PlanNode, PlanOpResult } from '../shared/types'

// REMAP-LOG.md: a plain-language history kept INSIDE the remapped folder, so
// anyone (or any chat) opening the folder sees what Remap changed and when.
// In a git repo it gets committed with the moves. Appended to, never
// rewritten; newest entry at the bottom. Remap's undo log (app data) stays
// the machine record; this file is for reading.

export const LOG_NAME = 'REMAP-LOG.md'

const HEADER = `# Remap log

Written by Remap each time a reorganisation is applied to this folder.
Newest entry at the bottom. Paths are relative to this folder.
Contents of moved folders move with them and are not listed one by one.
`

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function rel(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function cell(text: string): string {
  return text ? '`' + text.replace(/`/g, "'").replace(/\|/g, '\\|') + '`' : ''
}

function kindOf(from: string, to: string): string {
  if (dirname(from) === dirname(to)) return 'Rename'
  if (basename(from) === basename(to)) return 'Move'
  return 'Move + rename'
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

async function append(rootPath: string, section: string, createIfMissing: boolean): Promise<string | null> {
  const file = join(rootPath, LOG_NAME)
  let exists = true
  try {
    await fs.access(file)
  } catch {
    exists = false
  }
  if (!exists && !createIfMissing) return null
  await fs.appendFile(file, (exists ? '' : HEADER) + section, 'utf-8')
  return file
}

/** Appends one section for an applied plan. Returns the log path, or null if nothing changed. */
export async function appendApplyEntry(
  rootPath: string,
  nodes: PlanNode[],
  results: PlanOpResult[],
  appliedAt: number
): Promise<string | null> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows: string[] = []
  const counts = new Map<string, number>()
  const failed: string[] = []

  for (const r of results) {
    const node = byId.get(r.nodeId)
    if (!node) continue
    if (r.status === 'created') {
      rows.push(`| New folder |  | ${cell(rel(rootPath, node.plannedPath))} |`)
      counts.set('folder created', (counts.get('folder created') ?? 0) + 1)
    } else if (r.status === 'moved' && node.originalPath) {
      // originalPath, not r.from: r.from can be a temporary parking name
      const kind = kindOf(node.originalPath, node.plannedPath)
      rows.push(`| ${kind} | ${cell(rel(rootPath, node.originalPath))} | ${cell(rel(rootPath, node.plannedPath))} |`)
      const key = kind === 'Rename' ? 'renamed' : 'moved'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    } else if (r.status === 'failed') {
      const from = node.originalPath ? rel(rootPath, node.originalPath) : '(new folder)'
      const why = r.error.split('\n')[0].replace(/^Error:\s*/, '').split(rootPath + sep).join('')
      failed.push(`- ${cell(from)} → ${cell(rel(rootPath, node.plannedPath))}: ${why}`)
    }
  }
  if (rows.length === 0 && failed.length === 0) return null

  const summary = [
    counts.get('moved') ? `${counts.get('moved')} moved` : '',
    counts.get('renamed') ? `${counts.get('renamed')} renamed` : '',
    counts.get('folder created') ? plural(counts.get('folder created')!, 'folder') + ' created' : '',
    failed.length ? `${failed.length} failed` : ''
  ]
    .filter(Boolean)
    .join(', ')

  let section = `\n## ${stamp(appliedAt)}: ${summary}\n\n`
  if (rows.length) section += `| Change | From | To |\n|---|---|---|\n${rows.join('\n')}\n`
  if (failed.length) section += `\nNot applied (left where they were):\n\n${failed.join('\n')}\n`
  return append(rootPath, section, true)
}

/** Notes an undo in the folder's log, only if that folder already has one. */
export async function appendUndoEntry(
  rootPath: string,
  appliedAt: number,
  reversed: number,
  failed: number
): Promise<void> {
  // `reversed` counts raw disk steps (including temporary parking hops), so
  // only failures are reported as a number.
  const outcome = reversed === 0 ? 'nothing could be reversed' : failed ? `${plural(failed, 'step')} could not be undone` : 'fully reversed'
  const section = `\n## ${stamp(Date.now())}: undo\n\nUndid the changes applied on ${stamp(appliedAt)} (${outcome}).\n`
  await append(rootPath, section, false)
}
