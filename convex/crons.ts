import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()
// New internal functions are added before local codegen refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internalAutomation = (internal as any).automation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internalGovernance = (internal as any).governance

crons.interval(
  'phase4 automation hourly sweep',
  { hours: 1 },
  internalAutomation.phaseFourScheduledSweepRunner,
  { mode: 'hourly' },
)

crons.interval(
  'phase4 automation daily reminders',
  { hours: 24 },
  internalAutomation.phaseFourScheduledSweepRunner,
  { mode: 'daily' },
)

crons.interval(
  'phase4 automation monthly guard sweep',
  { hours: 6 },
  internalAutomation.phaseFourScheduledSweepRunner,
  { mode: 'monthly' },
)

crons.interval(
  'phase6 retention enforcement sweep',
  { hours: 6 },
  internalGovernance.phaseSixRetentionSweep,
  { dryRun: false, source: 'phase6_cron_6h' },
)

export default crons
