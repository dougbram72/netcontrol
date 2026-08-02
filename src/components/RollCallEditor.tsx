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
import { createId } from '../lib/id'
import { normalizeCallsign } from '../lib/callsign'
import { arrayMove } from '../lib/reorder'
import type { RollCallStation } from '../types'
import { LookupStatus } from './LookupStatus'

type RollCallEditorProps = {
  stations: RollCallStation[]
  onChange: (stations: RollCallStation[]) => void
}

export function RollCallEditor({ stations, onChange }: RollCallEditorProps) {
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stations.findIndex((s) => s.id === active.id)
    const newIndex = stations.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(stations, oldIndex, newIndex))
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const cs = normalizeCallsign(callsign)
    if (!cs) {
      setError('Callsign is required')
      return
    }
    if (stations.some((s) => s.callsign === cs)) {
      setError(`${cs} is already on the list`)
      return
    }
    onChange([
      ...stations,
      {
        id: createId(),
        callsign: cs,
        name: name.trim(),
        cityState: cityState.trim(),
        permanent,
      },
    ])
    setCallsign('')
    setName('')
    setCityState('')
    setPermanent(false)
    setError(null)
    resetLookup()
  }

  function handleRemove(id: string) {
    onChange(stations.filter((s) => s.id !== id))
  }

  function handleTogglePermanent(id: string, value: boolean) {
    onChange(stations.map((s) => (s.id === id ? { ...s, permanent: value } : s)))
  }

  return (
    <div className="rounded-xl border border-radio-700 bg-radio-950/50 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-radio-400">
          <Users className="h-3.5 w-3.5 text-accent" aria-hidden />
          Roll call list
        </h3>
        <span className="font-mono text-xs text-radio-500 tabular-nums">{stations.length}</span>
      </div>

      <div className="mb-1 grid gap-2 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          value={callsign}
          onChange={(e) => setCallsign(e.target.value.toUpperCase())}
          onBlur={lookupNow}
          className="input font-mono text-sm uppercase"
          placeholder="Call"
          aria-label="Callsign"
          autoComplete="off"
        />
        <input
          value={name}
          onChange={(e) => {
            markNameEdited(e.target.value)
            setName(e.target.value)
          }}
          className="input text-sm"
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
          className="input text-sm"
          placeholder="City, ST"
          aria-label="City and state"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-radio-600 bg-radio-800 px-3 py-2 text-sm font-medium text-radio-100 transition hover:bg-radio-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </div>

      <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-[11px] text-radio-500">
        <input
          type="checkbox"
          checked={permanent}
          onChange={(e) => setPermanent(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-radio-600 accent-sky-400"
        />
        Permanent (exempt from auto-drop)
      </label>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LookupStatus status={lookupStatus} sourceLabel={sourceLabel} />
        {error && (
          <p className="text-xs text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>

      {stations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-radio-700 px-3 py-4 text-center text-xs text-radio-500">
          No stations yet. Add regulars here for roll call order.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stations.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {stations.map((station, index) => (
                <SortableEditorCard
                  key={station.id}
                  station={station}
                  index={index}
                  onRemove={handleRemove}
                  onTogglePermanent={handleTogglePermanent}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <p className="mt-2 text-[11px] text-radio-500">
        Drag to set call order. Stations missing 4 consecutive nets are auto-dropped (unless
        permanent). Missing 2 shows an inactive indicator.
      </p>
    </div>
  )
}

function SortableEditorCard({
  station,
  index,
  onRemove,
  onTogglePermanent,
}: {
  station: RollCallStation
  index: number
  onRemove: (id: string) => void
  onTogglePermanent: (id: string, permanent: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: station.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const permanentId = `tpl-permanent-${station.id}`

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-radio-700 bg-radio-900 px-2 py-2 sm:px-3 ${
        isDragging ? 'z-10 opacity-90 shadow-lg shadow-black/40 ring-1 ring-accent/40' : ''
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded-md p-1 text-radio-500 hover:bg-radio-800 hover:text-radio-300 active:cursor-grabbing"
        aria-label={`Drag to reorder ${station.callsign}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="w-6 shrink-0 font-mono text-xs text-radio-500 tabular-nums">{index + 1}</span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold tracking-wide text-radio-100">
            {station.callsign}
          </span>
          {station.permanent && (
            <span className="rounded-full bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
              Permanent
            </span>
          )}
        </div>
        <div className="truncate text-xs text-radio-400">
          {[station.name, station.cityState].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      <label
        htmlFor={permanentId}
        className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-radio-400"
      >
        <input
          id={permanentId}
          type="checkbox"
          checked={Boolean(station.permanent)}
          onChange={(e) => onTogglePermanent(station.id, e.target.checked)}
          className="h-3.5 w-3.5 rounded border-radio-600 accent-sky-400"
        />
        Permanent
      </label>

      <button
        type="button"
        onClick={() => onRemove(station.id)}
        className="rounded-md p-1.5 text-radio-500 transition hover:bg-alert/15 hover:text-alert"
        aria-label={`Remove ${station.callsign}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  )
}
