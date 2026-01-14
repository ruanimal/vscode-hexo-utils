import path from 'node:path'
import { type Position, type TextDocument, type Uri, window, workspace } from 'vscode'
import yamljs from 'yamljs'
import { HexoMetadataKeys, type IHexoMetadata } from '../hexoMetadata'

/**
 * true if yse
 * @param placeHolder msg
 */
export async function askForNext(placeHolder: string): Promise<boolean> {
  const replace = await window.showQuickPick(['yes', 'no'], {
    placeHolder,
  })

  return replace === 'yes'
}

const metaCache: Record<string, IHexoMetadata> = {}
const rangeCache: Record<string, { version: number; range: { start: number; end: number } | undefined }> =
  {}

export function getFrontMatterRange(
  document: TextDocument,
): { start: number; end: number } | undefined {
  const cacheKey = document.uri.toString()
  const cached = rangeCache[cacheKey]

  if (cached && cached.version === document.version) {
    return cached.range
  }

  const text = document.getText()
  const lines = text.split(/\r?\n/)
  let start = -1
  let end = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (start === -1) {
        start = i
      } else {
        end = i
        break
      }
    }
  }

  const range = start !== -1 && end !== -1 ? { start, end } : undefined

  rangeCache[cacheKey] = {
    version: document.version,
    range,
  }

  return range
}

export function isInFrontMatter(document: TextDocument, position: Position): boolean {
  const range = getFrontMatterRange(document)
  if (!range) {
    return false
  }
  return position.line > range.start && position.line < range.end
}

export function parseFrontMatter<T = any>(text: string): T | undefined {
  try {
    // /---(data)---/ => $1 === data
    const yamlReg = /^---((.|\n|\r)+?)---$/m

    const yamlData = yamlReg.exec(text) || []

    return yamljs.parse(yamlData[1])
  } catch (error) {
    return undefined
  }
}

export async function getMDFileMetadata(uri: Uri): Promise<IHexoMetadata> {
  const stat = await workspace.fs.stat(uri)

  const cacheId = uri.toString()
  const hit = metaCache[cacheId]

  if (hit && stat.mtime === hit.mtime) {
    return hit
  }

  try {
    const content = await workspace.fs.readFile(uri)
    const text = content.toString()
    const data = parseFrontMatter(text) || {}

    const rawCategories = data[HexoMetadataKeys.categories] || data.category || []
    const categories: (string | string[])[] = Array.isArray(rawCategories)
      ? rawCategories
      : typeof rawCategories === 'string'
        ? [rawCategories]
        : []

    const normalizedCategories = categories.map((c) => (Array.isArray(c) ? c.join(' / ') : c))

    const rawTags = data[HexoMetadataKeys.tags] || data.tag || []
    const tags: string[] = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === 'string'
        ? [rawTags]
        : []

    const metadata = {
      tags,
      filePath: uri,
      // →  · /
      categories: normalizedCategories,
      title: data[HexoMetadataKeys.title] || '',
      date: data[HexoMetadataKeys.date] || '',
      mtime: stat.mtime,
      keys: Object.keys(data),
    }

    metaCache[cacheId] = metadata

    return metadata
  } catch (error) {
    const metadata = {
      tags: [],
      categories: [],
      filePath: uri,
      title: path.parse(uri.fsPath).name,
      date: new Date(stat.ctime),
      mtime: 0,
      keys: [],
    }

    metaCache[cacheId] = metadata

    return metadata
  }
}

export function sleep(ts = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ts))
}

export function isVirtualWorkspace() {
  const isVirtualWorkspace = workspace.workspaceFolders?.every((f) => f.uri.scheme !== 'file')

  return isVirtualWorkspace
}
