#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const defaultLogPath = '/tmp/convex-prod-dryrun.log'
const defaultExportTablesPath = '/tmp/finance-convex-export/_tables/documents.jsonl'

const logPath = path.resolve(cwd, process.argv[2] ?? defaultLogPath)
const tablesPath = path.resolve(cwd, process.argv[3] ?? defaultExportTablesPath)
const outputPath = path.resolve(cwd, 'convex/schema.ts')
const catalogPath = path.resolve(cwd, 'convex/schema.index-catalog.json')

const logText = readFileSync(logPath, 'utf8')
const startPushJson = extractStartPushJson(logText)
const startPush = JSON.parse(startPushJson)

const localSchemaTables = startPush?.analysis?.['']?.schema?.tables ?? []
const removedIndexes =
  startPush?.schemaChange?.indexDiffs?.['']?.removed_indexes ?? []

const devTables = parseDevTableNames(readFileSync(tablesPath, 'utf8'))

const tableIndexMap = new Map()

for (const table of localSchemaTables) {
  const tableName = table?.tableName
  const indexes = Array.isArray(table?.indexes) ? table.indexes : []
  if (typeof tableName !== 'string') continue
  for (const idx of indexes) {
    const indexName = typeof idx?.indexDescriptor === 'string' ? idx.indexDescriptor : null
    const fields = Array.isArray(idx?.fields) ? idx.fields : []
    if (!indexName || fields.length === 0) continue
    addIndex(tableIndexMap, tableName, {
      name: indexName,
      fields,
      staged: false,
      source: 'local_analysis',
    })
  }
}

for (const idx of removedIndexes) {
  const fullName = typeof idx?.name === 'string' ? idx.name : null
  const fields = Array.isArray(idx?.fields) ? idx.fields : []
  const staged = idx?.staged === true
  if (!fullName || fields.length === 0) continue
  const dotIndex = fullName.indexOf('.')
  if (dotIndex <= 0 || dotIndex === fullName.length - 1) continue
  const tableName = fullName.slice(0, dotIndex)
  const indexName = fullName.slice(dotIndex + 1)
  addIndex(tableIndexMap, tableName, {
    name: indexName,
    fields,
    staged,
    source: 'removed_index_diff',
  })
}

const allTableNames = Array.from(
  new Set([
    ...devTables,
    ...Array.from(tableIndexMap.keys()),
  ]),
)
  .filter((name) => name !== '_tables')
  .sort((a, b) => a.localeCompare(b))

const catalog = {
  generatedAt: new Date().toISOString(),
  sources: {
    dryRunLogPath: logPath,
    devExportTablesPath: tablesPath,
  },
  tableCount: allTableNames.length,
  tables: allTableNames.map((tableName) => ({
    tableName,
    indexes: (tableIndexMap.get(tableName) ?? []).map((idx) => ({
      ...idx,
      fieldsWithoutCreationTime: stripImplicitCreationTime(idx.fields),
    })),
  })),
}

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
writeFileSync(outputPath, renderSchemaTs(allTableNames, tableIndexMap), 'utf8')

console.log(`Wrote ${path.relative(cwd, outputPath)}`)
console.log(`Wrote ${path.relative(cwd, catalogPath)}`)
console.log(`Tables: ${allTableNames.length}`)
console.log(
  `Indexes: ${allTableNames.reduce((sum, tableName) => sum + ((tableIndexMap.get(tableName) ?? []).length), 0)}`,
)

function parseDevTableNames(jsonlText) {
  const names = []
  for (const line of jsonlText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed)
      if (typeof row?.name === 'string') names.push(row.name)
    } catch {
      // ignore malformed lines
    }
  }
  return names
}

function addIndex(tableIndexMap, tableName, index) {
  const list = tableIndexMap.get(tableName) ?? []
  const dedupeKey = `${index.name}|${JSON.stringify(index.fields)}|${index.staged ? '1' : '0'}`
  if (!list.some((entry) => `${entry.name}|${JSON.stringify(entry.fields)}|${entry.staged ? '1' : '0'}` === dedupeKey)) {
    list.push(index)
  }
  list.sort((a, b) => a.name.localeCompare(b.name))
  tableIndexMap.set(tableName, list)
}

function stripImplicitCreationTime(fields) {
  const normalized = fields.filter((field) => typeof field === 'string')
  if (normalized[normalized.length - 1] === '_creationTime') {
    return normalized.slice(0, -1)
  }
  return normalized
}

function renderSchemaTs(allTableNames, tableIndexMap) {
  const lines = []
  lines.push("import { defineSchema, defineTable } from 'convex/server'")
  lines.push("import { v } from 'convex/values'")
  lines.push('')
  lines.push('// Reconstructed from a Convex dry-run index diff catalog + dev snapshot export.')
  lines.push('// Runtime validation is disabled intentionally until the original typed schema is restored.')
  lines.push('')
  lines.push('export default defineSchema({')
  for (const tableName of allTableNames) {
    const indexes = tableIndexMap.get(tableName) ?? []
    const suffix = renderIndexChain(indexes)
    lines.push(`  ${tableName}: defineTable(v.any())${suffix},`)
    lines.push('')
  }
  if (allTableNames.length > 0) {
    lines.pop()
  }
  lines.push('}, {')
  lines.push('  schemaValidation: false,')
  lines.push('  strictTableNameTypes: false,')
  lines.push('})')
  lines.push('')
  return lines.join('\n')
}

function renderIndexChain(indexes) {
  if (indexes.length === 0) return ''
  const parts = []
  for (const idx of indexes) {
    const fields = stripImplicitCreationTime(idx.fields)
    if (fields.length === 0) continue
    const fieldsLiteral = `[${fields.map((field) => JSON.stringify(field)).join(', ')}]`
    if (idx.staged) {
      parts.push(`\n    .index(${JSON.stringify(idx.name)}, { fields: ${fieldsLiteral}, staged: true })`)
    } else {
      parts.push(`\n    .index(${JSON.stringify(idx.name)}, ${fieldsLiteral})`)
    }
  }
  return parts.join('')
}

function extractStartPushJson(logText) {
  const marker = 'startPush:'
  const markerIndex = logText.indexOf(marker)
  if (markerIndex < 0) {
    throw new Error('Could not find `startPush:` in dry-run log')
  }
  const startIndex = logText.indexOf('{', markerIndex)
  if (startIndex < 0) {
    throw new Error('Could not find JSON start after `startPush:`')
  }
  let depth = 0
  let inString = false
  let escaping = false
  for (let i = startIndex; i < logText.length; i += 1) {
    const ch = logText[i]
    if (inString) {
      if (escaping) {
        escaping = false
      } else if (ch === '\\') {
        escaping = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return logText.slice(startIndex, i + 1)
      }
    }
  }
  throw new Error('Unterminated JSON object after `startPush:`')
}
