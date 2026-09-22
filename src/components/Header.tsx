import { History, Radio } from 'lucide-react'

type HeaderProps = {
  netName?: string
  frequency?: string
  ncs?: string
  elapsed?: string
  isLive?: boolean
  onOpenCallsigns?: () => void
}

export function Header({ netName, frequency, ncs, elapsed, isLive, onOpenCallsigns }: HeaderProps) {
  return (
    <header className="border-b border-radio-700/80 bg-radio-900/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-signal-dim/40 text-signal ring-1 ring-signal/30">
            <Radio className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-radio-100">
              NetControl
            </h1>
            <p className="text-xs text-radio-400">Ham radio net control console</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
        {onOpenCallsigns && (
          <button
            type="button"
            onClick={onOpenCallsigns}
            className="flex items-center gap-1.5 rounded-md border border-radio-700 bg-radio-800 px-2.5 py-1 text-radio-200 hover:bg-radio-700"
          >
            <History className="h-4 w-4" aria-hidden />
            Past callsigns
          </button>
        )}
        {isLive && (
          <>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
              </span>
              <span className="font-medium text-signal">LIVE</span>
            </div>
            <div className="hidden text-radio-300 sm:block">
              <span className="text-radio-400">Net:</span> {netName}
            </div>
            {frequency && (
              <div className="font-mono text-accent">
                {frequency}
              </div>
            )}
            {ncs && (
              <div className="font-mono text-radio-300">
                NCS <span className="text-radio-100">{ncs}</span>
              </div>
            )}
            {elapsed && (
              <div className="rounded-md bg-radio-800 px-2.5 py-1 font-mono text-radio-100 tabular-nums">
                {elapsed}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </header>
  )
}
