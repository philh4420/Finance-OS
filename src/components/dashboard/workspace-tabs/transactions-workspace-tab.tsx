import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Download,
  LoaderCircle,
  Plus,
  ReceiptText,
  Save,
  Search,
  Sparkles,
  Timer,
  Trash2,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import { usePwaReliability } from '@/components/pwa/pwa-reliability-provider'
import type {
  DashboardData,
  TransactionFilter,
} from '@/components/dashboard/dashboard-types'
import { createCurrencyFormatters } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type PhaseThreeTemplateSplit = {
  label: string
  amount: number
  category: string
  ownership: string
  linkedAccountId?: string | null
  note?: string | null
  ratio?: number
  lineOrder?: number
}

type PhaseThreeTemplate = {
  id: string
  name: string
  description: string
  currency: string
  defaultCategory: string
  defaultOwnership: string
  splitCount: number
  createdAt: number
  updatedAt: number
  shoppingPlan?: {
    enabled: boolean
    unitLabel: string
    quantityPerCycle: number
    cycleInterval: number
    cycleUnit: string
    shopsPerCycle: number
    costPerItem: number
    preferredAccountId?: string | null
    anchorDate?: string | null
  } | null
  splits: PhaseThreeTemplateSplit[]
}

type PhaseThreeWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  sourceKind: 'real-ledger' | 'empty' | string
  transactionCount: number
  purchaseCount: number
  ledgerEntryCount: number
  ledgerLineCount: number
  splitCount: number
  displayCurrency: string
  locale: string
  baseCurrency: string
  availableCurrencies: Array<{ code: string; name: string }>
  accountOptions: Array<{ id: string; name: string; type: string }>
  categories: string[]
  ownershipOptions: string[]
  defaults: {
    purchaseCategory: string
    purchaseOwnership: string
  }
  templates: PhaseThreeTemplate[]
  transactions: DashboardData['transactions']
}

type PurchaseSplitDraft = {
  id: string
  label: string
  amount: string
  category: string
  ownership: string
  linkedAccountId: string
  note: string
}

type PurchaseDraft = {
  merchant: string
  amount: string
  currency: string
  note: string
  purchaseDate: string
  purchaseTime: string
  paymentAccountId: string
  category: string
  ownership: string
  selectedTemplateId: string
  templateName: string
  templateDescription: string
}

type QuickCaptureDraft = {
  merchant: string
  amount: string
  paymentAccountId: string
  category: string
}

function amountTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function formatRelative(timestamp: string) {
  return formatDistanceToNowStrict(parseISO(timestamp), { addSuffix: true })
}

function defaultSplitDraft(
  ownership: string,
  category: string,
  amount = '0',
): PurchaseSplitDraft {
  return {
    id: cryptoRandomId(),
    label: 'Primary split',
    amount,
    category,
    ownership,
    linkedAccountId: '',
    note: '',
  }
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `split-${Math.random().toString(36).slice(2, 10)}`
}

function localDateInputValue(timestampMs = Date.now()) {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTimeInputValue(timestampMs = Date.now()) {
  const date = new Date(timestampMs)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function parsePositiveNumber(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

export function TransactionsWorkspaceTab({
  displayCurrency,
  displayLocale,
  showBalances,
  transactions,
  transactionFilter,
  onTransactionFilterChange,
  searchValue,
  onSearchValueChange,
  searchRef,
  formatInCurrency,
  formatSignedAmount,
  openPurchaseComposerSignal = 0,
  openPurchaseComposerTemplateId = null,
}: {
  displayCurrency: string
  displayLocale: string
  showBalances: boolean
  transactions: DashboardData['transactions']
  transactionFilter: TransactionFilter
  onTransactionFilterChange: (value: TransactionFilter) => void
  searchValue: string
  onSearchValueChange: (value: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  formatInCurrency: (value: number, currencyCode?: string) => string
  formatSignedAmount: (value: number) => string
  openPurchaseComposerSignal?: number
  openPurchaseComposerTemplateId?: string | null
}) {
  // Phase 3 backend functions are added dynamically before local codegen refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phaseThreeWorkspace = useQuery((api as any).dashboard.getPhaseThreePurchaseWorkspace, {
    displayCurrency,
    locale: displayLocale,
    limit: 180,
  }) as PhaseThreeWorkspaceData | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordPurchaseWithLedgerPosting = useMutation((api as any).dashboard.recordPurchaseWithLedgerPosting)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertPurchaseSplitTemplate = useMutation((api as any).dashboard.upsertPurchaseSplitTemplate)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deletePurchaseSplitTemplate = useMutation((api as any).dashboard.deletePurchaseSplitTemplate)
  const { isOnline, enqueueIntent, trackEvent } = usePwaReliability()

  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const handledPurchaseComposerSignalRef = useRef(0)
  const [isPostingPurchase, setIsPostingPurchase] = useState(false)
  const [isSubmittingQuickCapture, setIsSubmittingQuickCapture] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [templateMutationId, setTemplateMutationId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PurchaseDraft>(() => ({
    merchant: '',
    amount: '',
    currency: displayCurrency,
    note: '',
    purchaseDate: localDateInputValue(),
    purchaseTime: localTimeInputValue(),
    paymentAccountId: '',
    category: '',
    ownership: 'shared',
    selectedTemplateId: '',
    templateName: '',
    templateDescription: '',
  }))
  const [splitDrafts, setSplitDrafts] = useState<PurchaseSplitDraft[]>(() => [
    defaultSplitDraft('shared', '', ''),
  ])
  const [quickCaptureDraft, setQuickCaptureDraft] = useState<QuickCaptureDraft>({
    merchant: '',
    amount: '',
    paymentAccountId: '',
    category: '',
  })

  useEffect(() => {
    if (!phaseThreeWorkspace) return
    setDraft((prev) => {
      const nextCurrency = prev.currency || phaseThreeWorkspace.displayCurrency || displayCurrency
      return {
        ...prev,
        currency: nextCurrency,
        category: prev.category || phaseThreeWorkspace.defaults.purchaseCategory || '',
        ownership:
          prev.ownership || phaseThreeWorkspace.defaults.purchaseOwnership || 'shared',
      }
    })
    setSplitDrafts((prev) => {
      if (prev.length > 0) return prev
      return [
        defaultSplitDraft(
          phaseThreeWorkspace.defaults.purchaseOwnership || 'shared',
          phaseThreeWorkspace.defaults.purchaseCategory || '',
          '',
        ),
      ]
    })
  }, [phaseThreeWorkspace, displayCurrency])

  useEffect(() => {
    if (!phaseThreeWorkspace) return
    setQuickCaptureDraft((prev) => ({
      merchant: prev.merchant,
      amount: prev.amount,
      paymentAccountId:
        prev.paymentAccountId || phaseThreeWorkspace.accountOptions[0]?.id || '',
      category:
        prev.category || phaseThreeWorkspace.defaults.purchaseCategory || '',
    }))
  }, [phaseThreeWorkspace])

  const ledgerTransactions = phaseThreeWorkspace?.transactions ?? []
  const usingRealLedger = ledgerTransactions.length > 0
  const effectiveTransactions = usingRealLedger ? ledgerTransactions : transactions
  const deferredSearch = searchValue.trim().toLowerCase()
  const visibleTransactions = effectiveTransactions.filter((transaction) => {
    if (transactionFilter !== 'all' && transaction.type !== transactionFilter) {
      return false
    }
    if (!deferredSearch) return true
    return (
      transaction.merchant.toLowerCase().includes(deferredSearch) ||
      transaction.category.toLowerCase().includes(deferredSearch) ||
      transaction.note.toLowerCase().includes(deferredSearch) ||
      transaction.account.toLowerCase().includes(deferredSearch)
    )
  })

  const workspaceCurrency = phaseThreeWorkspace?.displayCurrency ?? displayCurrency
  const workspaceMoney = createCurrencyFormatters(displayLocale, workspaceCurrency).money
  const purchaseAmount = parsePositiveNumber(draft.amount)
  const splitAmountTotal = splitDrafts.reduce(
    (sum, split) => sum + parsePositiveNumber(split.amount),
    0,
  )
  const splitDelta = purchaseAmount - splitAmountTotal

  const openPurchaseDialog = (template?: PhaseThreeTemplate) => {
    const now = Date.now()
    const defaults = phaseThreeWorkspace?.defaults
    const shoppingPlan = template?.shoppingPlan ?? null
    const derivedPlanPurchaseAmount =
      shoppingPlan && shoppingPlan.shopsPerCycle > 0
        ? (Math.max(0.01, shoppingPlan.quantityPerCycle) / Math.max(1, shoppingPlan.shopsPerCycle)) *
          Math.max(0, shoppingPlan.costPerItem)
        : 0
    if (template) {
      setDraft({
        merchant: shoppingPlan ? template.name : '',
        amount: derivedPlanPurchaseAmount > 0 ? String(derivedPlanPurchaseAmount.toFixed(2)) : '',
        currency: template.currency || phaseThreeWorkspace?.displayCurrency || displayCurrency,
        note: '',
        purchaseDate: localDateInputValue(now),
        purchaseTime: localTimeInputValue(now),
        paymentAccountId: shoppingPlan?.preferredAccountId ?? '',
        category: template.defaultCategory || defaults?.purchaseCategory || '',
        ownership: template.defaultOwnership || defaults?.purchaseOwnership || 'shared',
        selectedTemplateId: template.id,
        templateName: template.name,
        templateDescription: template.description || '',
      })
      setSplitDrafts(
        template.splits.length
          ? template.splits.map((split, index) => ({
              id: cryptoRandomId(),
              label: split.label || `Split ${index + 1}`,
              amount: split.amount ? String(split.amount) : '',
              category: split.category || template.defaultCategory || defaults?.purchaseCategory || '',
              ownership:
                split.ownership || template.defaultOwnership || defaults?.purchaseOwnership || 'shared',
              linkedAccountId: split.linkedAccountId ?? '',
              note: split.note ?? '',
            }))
          : [
              defaultSplitDraft(
                template.defaultOwnership || defaults?.purchaseOwnership || 'shared',
                template.defaultCategory || defaults?.purchaseCategory || '',
                '',
              ),
            ],
      )
    } else {
      setDraft({
        merchant: '',
        amount: '',
        currency: phaseThreeWorkspace?.displayCurrency || displayCurrency,
        note: '',
        purchaseDate: localDateInputValue(now),
        purchaseTime: localTimeInputValue(now),
        paymentAccountId: '',
        category: defaults?.purchaseCategory || '',
        ownership: defaults?.purchaseOwnership || 'shared',
        selectedTemplateId: '',
        templateName: '',
        templateDescription: '',
      })
      setSplitDrafts([
        defaultSplitDraft(
          defaults?.purchaseOwnership || 'shared',
          defaults?.purchaseCategory || '',
          '',
        ),
      ])
    }
    setShowPurchaseDialog(true)
  }

  const onPurchaseComposerSignal = useEffectEvent(() => {
    const templateId = openPurchaseComposerTemplateId?.trim() || ''
    if (templateId) {
      const template = phaseThreeWorkspace?.templates.find((row) => row.id === templateId)
      if (template) {
        openPurchaseDialog(template)
        return true
      }
      if (!phaseThreeWorkspace) {
        return false
      }
    }
    openPurchaseDialog()
    return true
  })

  useEffect(() => {
    if (!openPurchaseComposerSignal) return
    if (handledPurchaseComposerSignalRef.current === openPurchaseComposerSignal) return
    if (!onPurchaseComposerSignal()) return
    handledPurchaseComposerSignalRef.current = openPurchaseComposerSignal
  }, [openPurchaseComposerSignal, openPurchaseComposerTemplateId, phaseThreeWorkspace])

  const applySelectedTemplate = (templateId: string) => {
    const template = phaseThreeWorkspace?.templates.find((row) => row.id === templateId)
    if (!template) return
    openPurchaseDialog(template)
  }

  const updateSplitDraft = (
    id: string,
    field: keyof PurchaseSplitDraft,
    value: string,
  ) => {
    setSplitDrafts((prev) =>
      prev.map((split) => (split.id === id ? { ...split, [field]: value } : split)),
    )
  }

  const removeSplitDraft = (id: string) => {
    setSplitDrafts((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((split) => split.id !== id)
    })
  }

  const addSplitDraft = () => {
    setSplitDrafts((prev) => [
      ...prev,
      {
        id: cryptoRandomId(),
        label: `Split ${prev.length + 1}`,
        amount: '',
        category: draft.category || phaseThreeWorkspace?.defaults.purchaseCategory || '',
        ownership: draft.ownership || phaseThreeWorkspace?.defaults.purchaseOwnership || 'shared',
        linkedAccountId: '',
        note: '',
      },
    ])
  }

  const allocateRemainderToLastSplit = () => {
    if (splitDrafts.length === 0) return
    const remainder = splitDelta
    setSplitDrafts((prev) =>
      prev.map((split, index) =>
        index === prev.length - 1
          ? {
              ...split,
              amount: String(
                Math.max(0, parsePositiveNumber(split.amount) + remainder).toFixed(2),
              ),
            }
          : split,
      ),
    )
  }

  const handlePostPurchase = async () => {
    const merchant = draft.merchant.trim()
    if (!merchant) {
      toast.error('Merchant is required')
      return
    }
    const amount = parsePositiveNumber(draft.amount)
    if (!amount) {
      toast.error('Purchase amount must be greater than zero')
      return
    }

    const splitPayload = splitDrafts
      .map((split) => ({
        label: split.label.trim() || 'Split',
        amount: parsePositiveNumber(split.amount),
        category: split.category.trim() || undefined,
        ownership: split.ownership.trim() || undefined,
        linkedAccountId: split.linkedAccountId || undefined,
        note: split.note.trim() || undefined,
      }))
      .filter((split) => split.amount > 0)

    const purchaseTimestamp = new Date(
      `${draft.purchaseDate || localDateInputValue()}T${draft.purchaseTime || '12:00'}`,
    ).getTime()

    setIsPostingPurchase(true)
    try {
      const result = await recordPurchaseWithLedgerPosting({
        merchant,
        amount,
        currency: (draft.currency || workspaceCurrency).toUpperCase(),
        note: draft.note.trim() || undefined,
        purchaseAt: Number.isFinite(purchaseTimestamp) ? purchaseTimestamp : Date.now(),
        paymentAccountId: draft.paymentAccountId || undefined,
        category: draft.category.trim() || undefined,
        ownership: draft.ownership.trim() || undefined,
        templateId: draft.selectedTemplateId || undefined,
        splits: splitPayload,
      })

      toast.success('Purchase posted to ledger', {
        description: `${result.splitCount} splits and ${result.lineCount} ledger lines recorded.`,
      })
      setShowPurchaseDialog(false)
    } catch (error) {
      console.error(error)
      toast.error('Failed to post purchase', {
        description:
          error instanceof Error ? error.message : 'Convex rejected the purchase posting request.',
      })
    } finally {
      setIsPostingPurchase(false)
    }
  }

  const handleQuickCapture = async () => {
    const merchant = quickCaptureDraft.merchant.trim()
    if (!merchant) {
      toast.error('Merchant is required for quick capture')
      return
    }
    const amount = parsePositiveNumber(quickCaptureDraft.amount)
    if (!amount) {
      toast.error('Amount must be greater than zero')
      return
    }

    const payload = {
      merchant,
      amount,
      currency: workspaceCurrency.toUpperCase(),
      purchaseAt: Date.now(),
      paymentAccountId: quickCaptureDraft.paymentAccountId || undefined,
      category: quickCaptureDraft.category.trim() || undefined,
      ownership: phaseThreeWorkspace?.defaults.purchaseOwnership || 'shared',
      note: 'Quick capture',
    }

    if (!isOnline) {
      enqueueIntent('dashboard.recordPurchaseWithLedgerPosting', payload, {
        label: `Quick capture · ${merchant}`,
      })
      trackEvent({
        category: 'offline_queue',
        eventType: 'transaction_quick_capture_queued_offline',
        feature: 'phase3_transactions',
        status: 'queued',
      })
      toast.success('Quick capture queued for reconnect sync')
      setQuickCaptureDraft((prev) => ({ ...prev, merchant: '', amount: '' }))
      return
    }

    setIsSubmittingQuickCapture(true)
    try {
      await recordPurchaseWithLedgerPosting(payload)
      toast.success('Quick capture posted', {
        description: `${merchant} · ${workspaceMoney.format(amount)}`,
      })
      setQuickCaptureDraft((prev) => ({ ...prev, merchant: '', amount: '' }))
    } catch (error) {
      console.error(error)
      toast.error('Quick capture failed', {
        description: error instanceof Error ? error.message : 'Convex rejected the request.',
      })
    } finally {
      setIsSubmittingQuickCapture(false)
    }
  }

  const handleSaveTemplate = async () => {
    const templateName = draft.templateName.trim()
    if (!templateName) {
      toast.error('Template name is required')
      return
    }
    const splitPayload = splitDrafts
      .map((split) => ({
        label: split.label.trim() || 'Split',
        amount: parsePositiveNumber(split.amount),
        category: split.category.trim() || undefined,
        ownership: split.ownership.trim() || undefined,
        linkedAccountId: split.linkedAccountId || undefined,
        note: split.note.trim() || undefined,
      }))
      .filter((split) => split.amount > 0)

    if (splitPayload.length === 0) {
      toast.error('Add at least one split with an amount to save a template')
      return
    }

    setIsSavingTemplate(true)
    try {
      const result = await upsertPurchaseSplitTemplate({
        id: draft.selectedTemplateId || undefined,
        name: templateName,
        description: draft.templateDescription.trim() || undefined,
        currency: (draft.currency || workspaceCurrency).toUpperCase(),
        defaultCategory: draft.category.trim() || undefined,
        defaultOwnership: draft.ownership.trim() || undefined,
        splits: splitPayload,
      })

      setDraft((prev) => ({
        ...prev,
        selectedTemplateId: result.id,
      }))
      toast.success(
        `Split template ${result.mode === 'created' ? 'created' : 'updated'}`,
      )
    } catch (error) {
      console.error(error)
      toast.error('Failed to save split template', {
        description: error instanceof Error ? error.message : 'Convex rejected the template save.',
      })
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    const template = phaseThreeWorkspace?.templates.find((row) => row.id === templateId)
    setTemplateMutationId(templateId)
    try {
      await deletePurchaseSplitTemplate({ id: templateId })
      toast.success('Split template deleted', {
        description: template ? template.name : undefined,
      })
      setDraft((prev) =>
        prev.selectedTemplateId === templateId
          ? { ...prev, selectedTemplateId: '', templateName: '', templateDescription: '' }
          : prev,
      )
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete split template', {
        description: error instanceof Error ? error.message : 'Convex rejected the delete request.',
      })
    } finally {
      setTemplateMutationId(null)
    }
  }

  const accountOptions = phaseThreeWorkspace?.accountOptions ?? []
  const categories = phaseThreeWorkspace?.categories ?? []
  const ownershipOptions = phaseThreeWorkspace?.ownershipOptions ?? [
    'personal',
    'shared',
    'business',
    'household',
  ]

  return (
    <>
      <section id="transactions" className="space-y-4">
        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Transactions & ledger</CardTitle>
                <CardDescription>
                  Phase 3 purchase posting workflow with split templates and real ledger history.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openPurchaseDialog()}>
                  <Plus className="h-4 w-4" />
                  New purchase
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'bg-transparent',
                  usingRealLedger
                    ? 'border-emerald-400/25 text-emerald-300'
                    : 'border-amber-400/25 text-amber-300',
                )}
              >
                {usingRealLedger ? 'Real posted ledger' : 'Schedule fallback (no ledger posts yet)'}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.ledgerEntryCount ?? 0} ledger entries
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.ledgerLineCount ?? 0} ledger lines
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.templates.length ?? 0} split templates
              </Badge>
              {phaseThreeWorkspace === undefined ? (
                <Badge variant="secondary" className="bg-card/55">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Loading Phase 3 data
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {phaseThreeWorkspace?.viewerAuthenticated === false ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3 text-xs text-muted-foreground">
                Convex backend auth is inactive. Sign in again after confirming the Clerk JWT
                template `convex`.
              </div>
            ) : null}

            <div className="rounded-xl border border-border/50 bg-background/55 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Quick capture (under 10 seconds)</p>
                  <p className="text-muted-foreground text-xs">
                    Minimal purchase entry for mobile and low-signal use.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    isOnline
                      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/25 bg-amber-500/10 text-amber-200',
                  )}
                >
                  {isOnline ? 'Live post' : 'Queue on reconnect'}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.25fr_0.9fr_1fr_auto]">
                <Input
                  value={quickCaptureDraft.merchant}
                  onChange={(event) =>
                    setQuickCaptureDraft((prev) => ({ ...prev, merchant: event.target.value }))
                  }
                  placeholder="Merchant"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={quickCaptureDraft.amount}
                  onChange={(event) =>
                    setQuickCaptureDraft((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="Amount"
                />
                <select
                  value={quickCaptureDraft.paymentAccountId}
                  onChange={(event) =>
                    setQuickCaptureDraft((prev) => ({
                      ...prev,
                      paymentAccountId: event.target.value,
                    }))
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Unassigned</option>
                  {accountOptions.map((account) => (
                    <option key={`quick-${account.id}`} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => void handleQuickCapture()}
                  disabled={isSubmittingQuickCapture}
                >
                  {isSubmittingQuickCapture ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : isOnline ? (
                    <Timer className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                  {isOnline ? 'Capture now' : 'Queue'}
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={quickCaptureDraft.category}
                  onChange={(event) =>
                    setQuickCaptureDraft((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder={phaseThreeWorkspace?.defaults.purchaseCategory || 'Category (optional)'}
                  list="phase3-category-suggestions"
                />
                <Button
                  variant="outline"
                  onClick={() => openPurchaseDialog()}
                  className="w-full sm:w-auto"
                >
                  Advanced composer
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-background/55 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Split templates</p>
                <Button size="xs" variant="outline" onClick={() => openPurchaseDialog()}>
                  <Save className="h-3.5 w-3.5" />
                  Build template
                </Button>
              </div>
              {phaseThreeWorkspace?.templates.length ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {phaseThreeWorkspace.templates.slice(0, 9).map((template) => (
                    <div
                      key={template.id}
                      className="rounded-xl border border-border/50 bg-card/35 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => applySelectedTemplate(template.id)}
                          className="min-w-0 text-left"
                        >
                          <p className="truncate text-sm font-medium">{template.name}</p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {template.splitCount} splits · {template.currency}
                          </p>
                          {template.description ? (
                            <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px]">
                              {template.description}
                            </p>
                          ) : null}
                        </button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void handleDeleteTemplate(template.id)}
                          disabled={templateMutationId === template.id}
                          className="shrink-0"
                        >
                          {templateMutationId === template.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="sr-only">Delete template</span>
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {template.splits.slice(0, 3).map((split) => (
                          <Badge
                            key={`${template.id}-${split.lineOrder ?? split.label}`}
                            variant="outline"
                            className="border-border/60 bg-transparent text-[10px]"
                          >
                            {split.label}
                          </Badge>
                        ))}
                        {template.splits.length > 3 ? (
                          <Badge
                            variant="outline"
                            className="border-border/60 bg-transparent text-[10px]"
                          >
                            +{template.splits.length - 3}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/20 px-3 py-5 text-xs text-muted-foreground">
                  No split templates yet. Create one from the purchase entry dialog for faster repeat
                  categorization.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader className="gap-3">
            <div>
              <CardTitle className="text-base">Transaction history</CardTitle>
              <CardDescription>
                {usingRealLedger
                  ? 'Powered by posted ledger entries and lines from Convex.'
                  : 'Showing schedule-derived fallback until your first Phase 3 ledger posts.'}
              </CardDescription>
            </div>
            <CardAction className="w-full sm:w-auto">
              <Tabs
                value={transactionFilter}
                onValueChange={(value) =>
                  onTransactionFilterChange(value as TransactionFilter)
                }
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="income">Income</TabsTrigger>
                  <TabsTrigger value="expense">Expenses</TabsTrigger>
                  <TabsTrigger value="transfer">Transfers</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:hidden">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  ref={searchRef}
                  value={searchValue}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    onSearchValueChange(nextValue)
                  }}
                  placeholder="Search transactions..."
                  className="pl-9"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {visibleTransactions.length} of {effectiveTransactions.length} transactions ·{' '}
                {workspaceCurrency} display
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  <ArrowRightLeft className="h-4 w-4" />
                  Reconcile
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPurchaseDialog()}>
                  <ReceiptText className="h-4 w-4" />
                  Post purchase
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[560px] rounded-xl border border-border/50 bg-background/55">
              <div className="space-y-2 p-2 lg:hidden">
                {visibleTransactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-xl border border-border/50 bg-card/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 rounded-lg border border-border/50 bg-card/45 p-2">
                          {transaction.type === 'income' ? (
                            <ArrowDownLeft className="h-4 w-4 text-emerald-300" />
                          ) : transaction.type === 'transfer' ? (
                            <ArrowRightLeft className="h-4 w-4 text-sky-300" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-rose-300" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-words">{transaction.merchant}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs break-words">
                            {transaction.note}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={transaction.status === 'pending' ? 'secondary' : 'outline'}
                        className={cn(
                          'shrink-0',
                          transaction.status === 'pending' && 'bg-amber-500/15 text-amber-200',
                          transaction.status === 'posted' &&
                            'border-emerald-400/20 bg-emerald-500/8 text-emerald-200',
                        )}
                      >
                        {transaction.status}
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                        <div className="tracking-[0.12em] text-muted-foreground uppercase">Category</div>
                        <div className="mt-1 break-words">{transaction.category}</div>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                        <div className="tracking-[0.12em] text-muted-foreground uppercase">Account</div>
                        <div className="mt-1 break-words">{transaction.account}</div>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                        <div className="tracking-[0.12em] text-muted-foreground uppercase">Date</div>
                        <div className="mt-1">{format(parseISO(transaction.date), 'MMM d, yyyy')}</div>
                        <div className="text-muted-foreground">{formatRelative(transaction.date)}</div>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                        <div className="tracking-[0.12em] text-muted-foreground uppercase">Amount</div>
                        <div
                          className={cn(
                            'mt-1 font-mono text-sm font-medium tabular-nums',
                            amountTone(transaction.amount) === 'positive' && 'text-emerald-300',
                            amountTone(transaction.amount) === 'negative' && 'text-rose-300',
                            amountTone(transaction.amount) === 'neutral' && 'text-foreground',
                          )}
                        >
                          {showBalances ? formatSignedAmount(transaction.amount) : '••••'}
                        </div>
                        {transaction.originalCurrency &&
                        transaction.originalCurrency !== workspaceCurrency &&
                        transaction.originalAmount !== undefined ? (
                          <div className="text-muted-foreground mt-1 break-words">
                            Native {formatInCurrency(transaction.originalAmount, transaction.originalCurrency)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Merchant</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="pr-4 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="pl-4 align-top">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 rounded-lg border border-border/50 bg-card/45 p-2">
                              {transaction.type === 'income' ? (
                                <ArrowDownLeft className="h-4 w-4 text-emerald-300" />
                              ) : transaction.type === 'transfer' ? (
                                <ArrowRightLeft className="h-4 w-4 text-sky-300" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4 text-rose-300" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{transaction.merchant}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {transaction.note}
                              </p>
                              {transaction.originalCurrency &&
                              transaction.originalCurrency !== workspaceCurrency &&
                              transaction.originalAmount !== undefined ? (
                                <p className="truncate text-[11px] text-muted-foreground/80">
                                  Native{' '}
                                  {formatInCurrency(
                                    transaction.originalAmount,
                                    transaction.originalCurrency,
                                  )}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{transaction.category}</TableCell>
                        <TableCell>{transaction.account}</TableCell>
                        <TableCell>
                          <Badge
                            variant={transaction.status === 'pending' ? 'secondary' : 'outline'}
                            className={cn(
                              transaction.status === 'pending' &&
                                'bg-amber-500/15 text-amber-200',
                              transaction.status === 'posted' &&
                                'border-emerald-400/20 bg-emerald-500/8 text-emerald-200',
                            )}
                          >
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <div>
                            <p>{format(parseISO(transaction.date), 'MMM d, yyyy')}</p>
                            <p>{formatRelative(transaction.date)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <span
                            className={cn(
                              'font-mono text-sm font-medium tabular-nums',
                              amountTone(transaction.amount) === 'positive' &&
                                'text-emerald-300',
                              amountTone(transaction.amount) === 'negative' &&
                                'text-rose-300',
                              amountTone(transaction.amount) === 'neutral' && 'text-foreground',
                            )}
                          >
                            {showBalances ? formatSignedAmount(transaction.amount) : '••••'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </section>

      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent className="flex h-[94dvh] max-h-[94dvh] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" />
              Post purchase to ledger
            </DialogTitle>
            <DialogDescription>
              Creates a purchase record, purchase splits, a ledger entry, and ledger lines in
              Convex in one mutation.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 overscroll-contain">
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="lg:pr-1">
              <div className="space-y-4">
                <Card className="border-border/60 bg-card/35 shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Purchase details</CardTitle>
                    <CardDescription>
                      Primary transaction details and payment source
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">Merchant</span>
                      <Input
                        value={draft.merchant}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, merchant: event.target.value }))
                        }
                        placeholder="Amazon Web Services"
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Amount</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={draft.amount}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        placeholder="0.00"
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Currency</span>
                      <select
                        value={draft.currency}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, currency: event.target.value }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {(phaseThreeWorkspace?.availableCurrencies.length
                          ? phaseThreeWorkspace.availableCurrencies
                          : [{ code: displayCurrency, name: displayCurrency }]
                        ).map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {currency.code} · {currency.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Date</span>
                      <Input
                        type="date"
                        value={draft.purchaseDate}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, purchaseDate: event.target.value }))
                        }
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Time</span>
                      <Input
                        type="time"
                        value={draft.purchaseTime}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, purchaseTime: event.target.value }))
                        }
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Default category
                      </span>
                      <div className="space-y-1.5">
                        <Input
                          value={draft.category}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, category: event.target.value }))
                          }
                          placeholder="Software"
                          list="phase3-category-suggestions"
                        />
                      </div>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Default ownership
                      </span>
                      <select
                        value={draft.ownership}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, ownership: event.target.value }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {ownershipOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Payment account
                      </span>
                      <select
                        value={draft.paymentAccountId}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, paymentAccountId: event.target.value }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Unassigned</option>
                        {accountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {account.type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">Notes</span>
                      <textarea
                        value={draft.note}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, note: event.target.value }))
                        }
                        rows={3}
                        className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Context for future reconciliation..."
                      />
                    </label>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/35 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm">Split allocation</CardTitle>
                        <CardDescription>
                          Category and ownership breakdown recorded in `purchaseSplits` and
                          `ledgerLines`
                        </CardDescription>
                      </div>
                      <Button size="xs" variant="outline" onClick={addSplitDraft}>
                        <Plus className="h-3.5 w-3.5" />
                        Add split
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Purchase amount
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {purchaseAmount > 0
                            ? workspaceMoney.format(purchaseAmount)
                            : workspaceMoney.format(0)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Split total
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {workspaceMoney.format(splitAmountTotal)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={allocateRemainderToLastSplit}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-left transition',
                          Math.abs(splitDelta) < 0.009
                            ? 'border-emerald-400/20 bg-emerald-500/8'
                            : 'border-amber-400/20 bg-amber-500/8 hover:border-amber-400/35',
                        )}
                      >
                        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Delta
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-sm font-semibold',
                            Math.abs(splitDelta) < 0.009
                              ? 'text-emerald-300'
                              : 'text-amber-300',
                          )}
                        >
                          {workspaceMoney.format(splitDelta)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Click to apply remainder to final split
                        </p>
                      </button>
                    </div>

                    {splitDrafts.map((split, index) => (
                      <div
                        key={split.id}
                        className="rounded-xl border border-border/50 bg-background/55 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                            Split {index + 1}
                          </p>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeSplitDraft(split.id)}
                            disabled={splitDrafts.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove split</span>
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Label
                            </span>
                            <Input
                              value={split.label}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'label', event.target.value)
                              }
                              placeholder="Infra share"
                            />
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Amount
                            </span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={split.amount}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'amount', event.target.value)
                              }
                              placeholder="0.00"
                            />
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Category
                            </span>
                            <Input
                              value={split.category}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'category', event.target.value)
                              }
                              placeholder={draft.category || 'Category'}
                              list="phase3-category-suggestions"
                            />
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Ownership
                            </span>
                            <select
                              value={split.ownership}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'ownership', event.target.value)
                              }
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {ownershipOptions.map((option) => (
                                <option key={`${split.id}-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Linked account (optional)
                            </span>
                            <select
                              value={split.linkedAccountId}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'linkedAccountId', event.target.value)
                              }
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">None</option>
                              {accountOptions.map((account) => (
                                <option key={`${split.id}-${account.id}`} value={account.id}>
                                  {account.name} · {account.type}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Split note (optional)
                            </span>
                            <Input
                              value={split.note}
                              onChange={(event) =>
                                updateSplitDraft(split.id, 'note', event.target.value)
                              }
                              placeholder="Optional split memo"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-4 lg:pl-1">
              <Card className="border-border/60 bg-card/35 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Split template</CardTitle>
                  <CardDescription>
                    Save or update reusable split presets for recurring purchases.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Apply existing template
                    </span>
                    <select
                      value={draft.selectedTemplateId}
                      onChange={(event) => {
                        const nextId = event.target.value
                        setDraft((prev) => ({ ...prev, selectedTemplateId: nextId }))
                        if (nextId) {
                          applySelectedTemplate(nextId)
                        }
                      }}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">None</option>
                      {(phaseThreeWorkspace?.templates ?? []).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} · {template.splitCount} splits
                        </option>
                      ))}
                    </select>
                  </label>

                  <Separator />

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Template name
                    </span>
                    <Input
                      value={draft.templateName}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, templateName: event.target.value }))
                      }
                      placeholder="Shared household groceries"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Template description
                    </span>
                    <Input
                      value={draft.templateDescription}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, templateDescription: event.target.value }))
                      }
                      placeholder="Weekly grocery split across personal/shared"
                    />
                  </label>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => void handleSaveTemplate()}
                    disabled={isSavingTemplate}
                  >
                    {isSavingTemplate ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {draft.selectedTemplateId ? 'Update template' : 'Save split template'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/35 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Posting preview</CardTitle>
                  <CardDescription>
                    What will be written to Convex when you post this purchase.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>Purchase (`purchases`)</span>
                      <span className="font-medium">
                        {purchaseAmount ? workspaceMoney.format(purchaseAmount) : 'Pending'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span>Purchase splits (`purchaseSplits`)</span>
                      <span className="font-medium">{splitDrafts.length}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span>Ledger entry (`ledgerEntries`)</span>
                      <span className="font-medium">1</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span>Ledger lines (`ledgerLines`)</span>
                      <span className="font-medium">{splitDrafts.length + 1}</span>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'rounded-xl border p-3 text-xs',
                      Math.abs(splitDelta) < 0.009
                        ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-100'
                        : 'border-amber-400/20 bg-amber-500/8 text-amber-100',
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <Sparkles className="h-3.5 w-3.5" />
                      Split balance check
                    </div>
                    {Math.abs(splitDelta) < 0.009
                      ? 'Split amounts match the purchase amount.'
                      : `Split amounts differ by ${workspaceMoney.format(splitDelta)}. You can still post; the backend will normalize to the purchase total.`}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => void handlePostPurchase()}
                    disabled={isPostingPurchase}
                  >
                    {isPostingPurchase ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ReceiptText className="h-4 w-4" />
                    )}
                    {isPostingPurchase ? 'Posting purchase...' : 'Post purchase to ledger'}
                  </Button>
                </CardContent>
              </Card>
            </div>
              </div>
            </div>
          </ScrollArea>

          <datalist id="phase3-category-suggestions">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </DialogContent>
      </Dialog>
    </>
  )
}
