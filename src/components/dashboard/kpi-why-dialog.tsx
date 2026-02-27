import { CircleHelp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function KpiWhyDialog({
  kpi,
  explanation,
  includes,
  excludes,
  confidence,
}: {
  kpi: string
  explanation: string
  includes?: string[]
  excludes?: string[]
  confidence?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          Why this number?
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kpi}</DialogTitle>
          <DialogDescription>{explanation}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {confidence ? (
            <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Confidence
              </p>
              <p className="mt-1">{confidence}</p>
            </div>
          ) : null}

          {includes?.length ? (
            <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Includes
              </p>
              <div className="mt-1 space-y-1">
                {includes.map((row) => (
                  <p key={row}>- {row}</p>
                ))}
              </div>
            </div>
          ) : null}

          {excludes?.length ? (
            <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Excludes
              </p>
              <div className="mt-1 space-y-1">
                {excludes.map((row) => (
                  <p key={row}>- {row}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
