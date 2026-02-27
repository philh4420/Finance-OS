/* eslint-disable @typescript-eslint/no-explicit-any */
type IdentityLike = { subject?: string | null } | null
type AuthLike = {
  auth?: {
    getUserIdentity?: () => Promise<IdentityLike>
  }
}

export async function viewerUserId(ctx: AuthLike): Promise<string | null> {
  try {
    const identity = await ctx.auth?.getUserIdentity?.()
    return typeof identity?.subject === 'string' && identity.subject.length > 0
      ? identity.subject
      : null
  } catch {
    return null
  }
}

export async function requireViewerUserId(
  ctx: AuthLike,
  message = 'Unauthorized',
): Promise<string> {
  const userId = await viewerUserId(ctx)
  if (!userId) throw new Error(message)
  return userId
}

export async function safeCollectDocs(db: any, table: string): Promise<any[]> {
  try {
    const docs = await db.query(table).collect()
    return Array.isArray(docs) ? docs : []
  } catch {
    return []
  }
}

export async function collectUserDocs(db: any, table: string, userId: string): Promise<any[]> {
  const docs = await safeCollectDocs(db, table)
  return docs.filter((row) => row?.userId === userId)
}

export async function assertOwnedDocOrThrow(db: any, table: string, id: string, userId: string) {
  const docs = await safeCollectDocs(db, table)
  const found = docs.find((row) => String(row?._id) === id)
  if (!found) throw new Error(`Record not found in ${table}`)
  if (found.userId !== userId) throw new Error('Unauthorized')
  return found
}

export async function auditWriteSafe(
  db: any,
  {
    action,
    entityId,
    entityType,
    userId,
    beforeJson,
    afterJson,
    metadataJson,
  }: {
    action: string
    entityId: string
    entityType: string
    userId: string
    beforeJson?: string
    afterJson?: string
    metadataJson?: string
  },
) {
  try {
    await db.insert(
      'financeAuditEvents',
      compactObject({
        action,
        entityId,
        entityType,
        userId,
        createdAt: Date.now(),
        beforeJson,
        afterJson,
        metadataJson,
      }),
    )
  } catch {
    // Non-blocking for schema variance.
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}
