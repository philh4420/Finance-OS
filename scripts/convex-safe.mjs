#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/convex-safe.mjs <convex-subcommand...>')
  process.exit(1)
}

const schemaPushingCommands = new Set(['dev', 'deploy'])
const command = args[0]

if (schemaPushingCommands.has(command) && !isSchemaPushAllowed()) {
  const lock = readSchemaLock()
  console.error('')
  console.error('Convex schema push is blocked in this workspace.')
  if (lock?.reason) console.error(`Reason: ${lock.reason}`)
  if (lock?.requiredAction) console.error(`Required action: ${lock.requiredAction}`)
  console.error(
    'Use `npx convex run`/`codegen` for non-schema operations or align the local schema before unblocking.',
  )
  console.error('')
  process.exit(1)
}

const child = spawn('npx', ['convex', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

function isSchemaPushAllowed() {
  return process.env.ALLOW_CONVEX_SCHEMA_PUSH === '1'
}

function readSchemaLock() {
  try {
    const lockPath = path.resolve(process.cwd(), 'convex/schema-alignment.lock.json')
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}
