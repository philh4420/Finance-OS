import type { AuthConfig } from 'convex/server'

const clerkIssuerDomain = process.env.CLERK_FRONTEND_API_URL ?? ''

export default {
  providers: clerkIssuerDomain
    ? [
        {
          domain: clerkIssuerDomain,
          applicationID: 'convex',
        },
      ]
    : [],
} satisfies AuthConfig
