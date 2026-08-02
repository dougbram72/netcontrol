import { CheckInForm } from './components/CheckInForm'
import { FccDbFooter } from './components/FccDbFooter'
import { Header } from './components/Header'
import { HistoryList } from './components/HistoryList'
import { NetSidebar } from './components/NetSidebar'
import { RollCallList } from './components/RollCallList'
import { Roster } from './components/Roster'
import { StartNetForm } from './components/StartNetForm'
import { useElapsed } from './hooks/useElapsed'
import { useNetSession } from './hooks/useNetSession'
import { downloadText, sessionToCsv } from './lib/export'

export default function App() {
  const {
    hydrated,
    busy,
    error,
    setError,
    activeSession,
    history,
    templates,
    stats,
    lastDropped,
    clearDroppedNotice,
    wsStatus,
    peerCount,
    startNet,
    endNet,
    updateNotes,
    addCheckIn,
    updateCheckIn,
    removeCheckIn,
    reorderRollCall,
    setRollCallResponded,
    setRollCallPermanent,
    addRollCallStation,
    removeRollCallStation,
    resumeFromHistory,
    saveTemplate,
    deleteTemplate,
    saveSessionScriptToTemplate,
  } = useNetSession()

  const elapsed = useElapsed(activeSession?.startedAt)

  function handleExport() {
    if (!activeSession) return
    const stamp = activeSession.startedAt.slice(0, 10)
    const safeName = activeSession.name.replace(/[^\w.-]+/g, '_').slice(0, 40)
    downloadText(`netcontrol_${safeName}_${stamp}.csv`, sessionToCsv(activeSession))
  }

  async function handleEnd() {
    if (!activeSession) return
    const ok = window.confirm(
      `Close "${activeSession.name}" with ${activeSession.checkIns.length} check-ins? You can resume it from history.`,
    )
    if (ok) await endNet()
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-full items-center justify-center bg-radio-950 text-radio-400">
        Connecting to server…
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-radio-950">
      <Header
        isLive={!!activeSession}
        netName={activeSession?.name}
        frequency={activeSession?.frequency}
        ncs={activeSession?.netControlCallsign}
        elapsed={activeSession ? elapsed : undefined}
      />

      {error && (
        <div className="border-b border-alert/40 bg-alert/10 px-4 py-2 text-center text-sm text-red-200">
          {error}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {lastDropped.length > 0 && (
        <div className="border-b border-radio-700 bg-radio-900 px-4 py-3 text-sm text-radio-300">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-2">
            <div>
              <span className="font-medium text-radio-100">
                Dropped {lastDropped.length} inactive station
                {lastDropped.length === 1 ? '' : 's'}
              </span>
              <span className="text-radio-400">
                {' '}
                (missed last 4 nets, not permanent):{' '}
              </span>
              <span className="font-mono text-radio-200">
                {lastDropped.map((d) => d.callsign).join(', ')}
              </span>
            </div>
            <button
              type="button"
              onClick={clearDroppedNotice}
              className="text-xs text-radio-400 underline hover:text-radio-200"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {!activeSession ? (
          <div className="flex flex-col items-center pt-8 sm:pt-12">
            <StartNetForm
              templates={templates}
              busy={busy}
              onStart={startNet}
              onSaveTemplate={saveTemplate}
              onDeleteTemplate={deleteTemplate}
            />
            <HistoryList history={history} onResume={(id) => void resumeFromHistory(id)} />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_22rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <RollCallList
                stations={activeSession.rollCall}
                onReorder={(ids) => void reorderRollCall(ids)}
                onToggleResponded={(id, responded) => void setRollCallResponded(id, responded)}
                onTogglePermanent={(id, permanent) => void setRollCallPermanent(id, permanent)}
                onAdd={addRollCallStation}
                onRemove={(id) => void removeRollCallStation(id)}
              />
              <CheckInForm onAdd={addCheckIn} />
              <Roster
                checkIns={activeSession.checkIns}
                onToggleTraffic={(id) => {
                  const row = activeSession.checkIns.find((c) => c.id === id)
                  if (!row) return
                  void updateCheckIn(id, { hasTraffic: !row.hasTraffic })
                }}
                onRemove={(id) => void removeCheckIn(id)}
              />
            </div>
            <NetSidebar
              session={activeSession}
              stats={stats}
              onNotesChange={(notes) => void updateNotes(notes)}
              onSaveToTemplate={() => void saveSessionScriptToTemplate()}
              onExport={handleExport}
              onEnd={() => void handleEnd()}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-radio-800 px-4 py-3 text-center text-xs text-radio-500">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-signal'
                  : wsStatus === 'connecting'
                    ? 'bg-traffic animate-pulse'
                    : 'bg-alert'
              }`}
              aria-hidden
            />
            {wsStatus === 'connected'
              ? 'Live sync'
              : wsStatus === 'connecting'
                ? 'Connecting…'
                : 'Offline — reconnecting'}
          </span>
          {wsStatus === 'connected' && peerCount > 0 && (
            <span className="text-radio-500">
              {peerCount} device{peerCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-radio-600">·</span>
          <FccDbFooter />
          <span className="text-radio-600">·</span>
          <span>73</span>
        </span>
      </footer>
    </div>
  )
}
