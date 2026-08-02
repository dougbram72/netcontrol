import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCallsignAutofill } from '../hooks/useCallsignAutofill'
import { arrayMove } from '../lib/reorder'
import type { SessionRollCallStation } from '../types'
import { LookupStatus } from './LookupStatus'

type RollCallListProps = {
  stations: SessionRollCallStation[]
  onReorder: (orderedIds: string[]) => void
  onToggleResponded: (id: string, responded: boolean) => void
  onTogglePermanent: (id: string, permanent: boolean) => void
  onAdd: (input: {
    callsign: string
    name: string
    cityState: string
    permanent?: boolean
  }) => Promise<{ ok: true } | { ok: false; error: string }> | { ok: true } | { ok: false; error: string }
  onRemove: (id: string) => void
}

export function RollCallList({
  stations,
  onReorder,
  onToggleResponded,
  onTogglePermanent,
  onAdd,
  onRemove,
}: RollCallListProps) {
  const [callsign, setCallsign] = useState('')
  const [name, setName] = useState('')
  const [cityState, setCityState] = useState('')
  const [permanent, setPermanent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    status: lookupStatus,
    sourceLabel,
    lookupNow,
    resetLookup,
    markNameEdited,
    markLocationEdited,
  } = useCallsignAutofill({
    callsign,
    name,
    location: cityState,
    setName,
    setLocation: setCityState,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const responded = stations.filter((s) => s.responded).length
  const atRisk = stations.filter((s) => !s.permanent && s.missedStreak >= 2).length

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stations.findIndex((s) => s.id === active.id)
    const newIndex = stations.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(stations, oldIndex, newIndex)
    onReorder(next.map((s) => s.id))
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const result = await onAdd({
      callsign,
      name,
      cityState,
      permanent,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCallsign('')
    setName('')
    setCityState('')
    setPermanent(false)
    setError(null)
    resetLookup()
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-radio-700 bg-radio-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-radio-700 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-radio-100">
          <Users className="h-4 w-4 text-accent" aria-hidden />
          Roll call
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-radio-300 tabular-nums">
            <span className="text-signal">{responded}</span>
            <span className="text-radio-500"> / {stations.length}</span>
          </span>
          <span className="text-xs text-radio-500">responded</span>
          {atRisk > 0 && (
            <span className="rounded-full bg-radio-800 px-2 py-0.5 text-xs text-radio-400">
              {atRisk} inactive
            </span>
          )}
        </div>
      </div>

      <div className="border-b border-radio-800 px-4 py-3 sm:px-5">
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              onBlur={lookupNow}
              className="input font-mono uppercase"
              placeholder="Callsign"
              aria-label="Callsign"
              autoComplete="off"
            />
            <input
              value={name}
              onChange={(e) => {
                markNameEdited(e.target.value)
                setName(e.target.value)
              }}
              className="input"
              placeholder="Name"
              aria-label="Operator name"
              autoComplete="off"
            />
            <input
              value={cityState}
              onChange={(e) => {
                markLocationEdited(e.target.value)
                setCityState(e.target.value)
              }}
              className="input"
              placeholder="City, ST"
              aria-label="City and state"
              autoComplete="off"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-radio-600 bg-radio-800 px-3 py-2 text-sm font-medium text-radio-100 transition hover:bg-radio-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-radio-400">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(e) => setPermanent(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-radio-600 accent-sky-400"
            />
            Permanent (never auto-drop)
          </label>
        </form>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <LookupStatus status={lookupStatus} sourceLabel={sourceLabel} />
          {error && (
            <p className="text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      {stations.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-radio-400 sm:px-5">
          No stations on the roll call. Add them here or load a template that includes a list.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stations.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2 p-3 sm:p-4">
              {stations.map((station, index) => (
                <SortableRollCallCard
                  key={station.id}
                  station={station}
                  index={index}
                  onToggleResponded={onToggleResponded}
                  onTogglePermanent={onTogglePermanent}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

function SortableRollCallCard({
  station,
  index,
  onToggleResponded,
  onTogglePermanent,
  onRemove,
}: {
  station: SessionRollCallStation
  index: number
  onToggleResponded: (id: string, responded: boolean) => void
  onTogglePermanent: (id: string, permanent: boolean) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: station.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const checkboxId = `rollcall-${station.id}`
  const permanentId = `permanent-${station.id}`
  const inactive = !station.permanent && station.missedStreak >= 2
  const greying = inactive && !station.responded

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col rounded-xl border transition sm:flex-row sm:items-stretch ${
        station.responded
          ? 'border-signal/35 bg-signal-dim/10'
          : greying
            ? 'border-radio-800 bg-radio-950/40 opacity-60'
            : 'border-radio-700 bg-radio-950/60'
      } ${isDragging ? 'z-10 opacity-95 shadow-xl shadow-black/50 ring-1 ring-accent/50' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-stretch gap-2 sm:gap-3">
        <button
          type="button"
          className="flex shrink-0 cursor-grab touch-none items-center rounded-l-xl px-1.5 text-radio-500 hover:bg-radio-800/80 hover:text-radio-300 active:cursor-grabbing sm:px-2"
          aria-label={`Drag to reorder ${station.callsign}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <label
          htmlFor={checkboxId}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pr-2 sm:gap-4 sm:pr-3"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={station.responded}
            onChange={(e) => onToggleResponded(station.id, e.target.checked)}
            className="h-5 w-5 shrink-0 rounded border-radio-600 bg-radio-900 text-signal accent-green-500"
          />

          <span className="w-7 shrink-0 font-mono text-sm text-radio-500 tabular-nums">
            {index + 1}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-lg font-semibold tracking-wide ${
                  station.responded ? 'text-signal' : greying ? 'text-radio-400' : 'text-radio-100'
                }`}
              >
                {station.callsign}
              </span>
              {station.permanent && (
                <span className="rounded-full bg-sky-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-sky-500/30">
                  Permanent
                </span>
              )}
              {inactive && (
                <span
                  className="rounded-full bg-radio-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-radio-400 ring-1 ring-radio-600/60"
                  title={`Missed last ${station.missedStreak} net${station.missedStreak === 1 ? '' : 's'}`}
                >
                  Inactive · {station.missedStreak} miss
                  {station.missedStreak === 1 ? '' : 'es'}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-radio-300">
              <span className={station.name ? '' : 'text-radio-600'}>
                {station.name || 'Name —'}
              </span>
              <span className={station.cityState ? 'text-radio-400' : 'text-radio-600'}>
                {station.cityState || 'City, ST —'}
              </span>
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-radio-800/80 px-3 py-2 sm:border-t-0 sm:border-l sm:px-3">
        <label
          htmlFor={permanentId}
          className="inline-flex cursor-pointer items-center gap-2 text-xs text-radio-400"
        >
          <input
            id={permanentId}
            type="checkbox"
            checked={station.permanent}
            onChange={(e) => onTogglePermanent(station.id, e.target.checked)}
            className="h-3.5 w-3.5 rounded border-radio-600 accent-sky-400"
          />
          Permanent
        </label>
        <button
          type="button"
          onClick={() => onRemove(station.id)}
          className="rounded-md p-1.5 text-radio-500 transition hover:bg-alert/15 hover:text-alert"
          aria-label={`Remove ${station.callsign} from roll call`}
          title="Remove from roll call"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
