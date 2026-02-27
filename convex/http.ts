/* eslint-disable @typescript-eslint/no-explicit-any */
import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'

const http = httpRouter()

http.route({
  path: '/governance/export-download',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request),
    })
  }),
})

http.route({
  path: '/governance/export-download',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    const downloadId = url.searchParams.get('downloadId')?.trim() ?? ''
    const token = url.searchParams.get('token')?.trim() ?? ''
    if (!downloadId || !token) {
      return withCors(
        request,
        new Response('Missing downloadId or token', {
          status: 400,
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        }),
      )
    }

    // Phase 6 governance module may be added before local codegen refresh in some environments.
    const payload = (await ctx.runQuery((internal as any).governance.getExportDownloadHttpPayload, {
      downloadId,
      token,
    })) as
      | {
          ok: true
          downloadId: string
          storageId: string
          filename: string
          contentType: string
          expiresAt: number | null
          userId: string | null
        }
      | { ok: false; reason: string }

    if (!payload?.ok) {
      const status =
        payload?.reason === 'invalid_token'
          ? 403
          : payload?.reason === 'expired'
            ? 410
            : payload?.reason === 'not_ready'
              ? 409
              : 404
      return withCors(
        request,
        new Response('Download unavailable', {
          status,
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        }),
      )
    }

    const blob = await ctx.storage.get(payload.storageId as any)
    if (blob === null) {
      return withCors(
        request,
        new Response('Export file not found', {
          status: 404,
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        }),
      )
    }

    try {
      await ctx.runMutation((internal as any).governance.recordExportDownloadAccess, {
        downloadId: payload.downloadId,
      })
    } catch {
      // Access logging is best-effort.
    }

    const headers = new Headers({
      'Content-Type': payload.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(payload.filename)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    if (payload.expiresAt) {
      headers.set('Expires', new Date(payload.expiresAt).toUTCString())
    }

    return withCors(request, new Response(blob, { status: 200, headers }))
  }),
})

function sanitizeFilename(value: string) {
  const sanitized = value.replace(/[\r\n"]/g, '').trim()
  return sanitized || 'finance-export.bin'
}

function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers)
  const cors = buildCorsHeaders(request)
  cors.forEach((value, key) => headers.set(key, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function buildCorsHeaders(request: Request) {
  const headers = new Headers()
  const runtimeProcess = (globalThis as any).process
  const allowedOrigin = (runtimeProcess?.env?.CLIENT_ORIGIN ?? '').trim().replace(/\/+$/, '')
  const requestOrigin = request.headers.get('origin')?.trim().replace(/\/+$/, '') ?? ''
  if (allowedOrigin && requestOrigin && allowedOrigin === requestOrigin) {
    headers.set('Access-Control-Allow-Origin', request.headers.get('origin') as string)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  }
  return headers
}

export default http
