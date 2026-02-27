import { format } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import { Plus, Settings2, Smartphone } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

type StatTone = 'neutral' | 'positive' | 'warning'

export type CoreEntityWorkspaceStat = {
  label: string
  value: string
  tone?: StatTone
}

export type CoreEntityWorkspaceRow = {
  id: string
  title: string
  subtitle?: string
  amountLabel?: string
  badge?: string
  createdAt?: number
  hint?: string
}

export type CoreEntityThumbAction = {
  id: string
  label: string
  icon: LucideIcon
  onClick: () => void
}

export function CoreEntityWorkspaceTab({
  icon: Icon,
  title,
  description,
  recordsLabel,
  viewerAuthenticated,
  stats,
  rows,
  emptyLabel,
  onOpenManager,
  thumbMode = false,
  thumbActions = [],
}: {
  icon: LucideIcon
  title: string
  description: string
  recordsLabel: string
  viewerAuthenticated: boolean | undefined
  stats: CoreEntityWorkspaceStat[]
  rows: CoreEntityWorkspaceRow[]
  emptyLabel: string
  onOpenManager: () => void
  thumbMode?: boolean
  thumbActions?: CoreEntityThumbAction[]
}) {
  return (
    <div className="grid gap-4">
      {thumbMode ? (
        <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
          <CardHeader className="gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Thumb actions</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                <Smartphone className="h-3.5 w-3.5" />
                {title}
              </Badge>
            </div>
            <CardDescription>One-thumb shortcuts for high-frequency workflows.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {thumbActions.map((action) => {
              const ActionIcon = action.icon
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant="outline"
                  onClick={action.onClick}
                >
                  <ActionIcon className="h-4 w-4" />
                  {action.label}
                </Button>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/45">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onOpenManager}>
                <Plus className="h-4 w-4" />
                Add / Edit
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenManager}>
                <Settings2 className="h-4 w-4" />
                Open manager
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border/70 bg-transparent">
              {rows.length} {recordsLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'bg-transparent',
                viewerAuthenticated === false && 'border-amber-400/30 text-amber-300',
                viewerAuthenticated !== false && 'border-border/70',
              )}
            >
              {viewerAuthenticated === false ? 'Convex auth inactive' : 'Live Convex CRUD'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="finance-panel border-border/60 bg-card/35 shadow-none"
            >
              <CardHeader className="gap-1">
                <CardDescription className="text-xs tracking-[0.14em] uppercase">
                  {stat.label}
                </CardDescription>
                <CardTitle
                  className={cn(
                    'finance-display text-xl',
                    stat.tone === 'positive' && 'text-emerald-300',
                    stat.tone === 'warning' && 'text-amber-300',
                  )}
                >
                  {stat.value}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">{title} records</CardTitle>
            <CardDescription>
              Live normalized rows from Convex. Use the manager for create, update, and delete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[28rem] rounded-xl border border-border/50 bg-background/55 p-2">
              <div className="space-y-2">
                {rows.length ? (
                  rows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-border/50 bg-card/35 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{row.title}</p>
                            {row.badge ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                {row.badge}
                              </Badge>
                            ) : null}
                          </div>
                          {row.subtitle ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.subtitle}
                            </p>
                          ) : null}
                          {row.hint ? (
                            <p className="mt-1 text-[11px] text-muted-foreground/85">{row.hint}</p>
                          ) : null}
                        </div>
                        {row.amountLabel ? (
                          <p className="shrink-0 text-sm font-semibold">{row.amountLabel}</p>
                        ) : null}
                      </div>
                      {row.createdAt ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Created {format(new Date(row.createdAt), 'MMM d, yyyy')}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
                    {emptyLabel}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
