import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { BookmarkPlus, Play, Trash2 } from 'lucide-react'
import type { StartNetInput, TemplateInput } from '../hooks/useNetSession'
import type { NetTemplate, RollCallStation } from '../types'
import { RollCallEditor } from './RollCallEditor'

type StartNetFormProps = {
  templates: NetTemplate[]
  busy?: boolean
  onStart: (input: StartNetInput) => void | Promise<void>
  onSaveTemplate: (input: TemplateInput, existingId?: string | null) => string | Promise<string>
  onDeleteTemplate: (id: string) => void | Promise<void>
}

const MODES = ['FM', 'SSB', 'AM', 'CW', 'Digital', 'Mixed']

const SCRIPT_PLACEHOLDER = `Calling the net…

This is [YOUR CALL], net control for the [NET NAME] on [FREQUENCY].

The net is open for check-ins. Please call with your callsign, name, and location.

…

Is there any traffic for the net?

…

This concludes the [NET NAME]. [YOUR CALL] clear.`

export function StartNetForm({
  templates,
  busy,
  onStart,
  onSaveTemplate,
  onDeleteTemplate,
}: StartNetFormProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [name, setName] = useState('Weekly Net')
  const [frequency, setFrequency] = useState('')
  const [mode, setMode] = useState('FM')
  const [netControlCallsign, setNetControlCallsign] = useState('')
  const [script, setScript] = useState('')
  const [rollCall, setRollCall] = useState<RollCallStation[]>([])
  const [templateStatus, setTemplateStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Apply template fields when selection changes
  useEffect(() => {
    if (!selectedTemplateId) return
    const t = templates.find((x) => x.id === selectedTemplateId)
    if (!t) {
      setSelectedTemplateId('')
      return
    }
    setName(t.name)
    setFrequency(t.frequency)
    setMode(t.mode || 'FM')
    setNetControlCallsign(t.netControlCallsign ?? '')
    setScript(t.script)
    setRollCall(
      (t.rollCall ?? []).map((s) => ({
        ...s,
        permanent: Boolean(s.permanent),
      })),
    )
  }, [selectedTemplateId, templates])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!netControlCallsign.trim() || busy) return
    await onStart({
      name,
      frequency,
      mode,
      netControlCallsign,
      script,
      rollCall,
      templateId: selectedTemplateId || null,
    })
  }

  async function handleSaveTemplate() {
    setSaving(true)
    try {
      const id = await onSaveTemplate(
        { name, frequency, mode, netControlCallsign, script, rollCall },
        selectedTemplateId || null,
      )
      setSelectedTemplateId(id)
      setTemplateStatus(selectedTemplateId ? 'Template updated' : 'Template saved')
      window.setTimeout(() => setTemplateStatus(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId) return
    const t = templates.find((x) => x.id === selectedTemplateId)
    const ok = window.confirm(`Delete template “${t?.name ?? 'this template'}”?`)
    if (!ok) return
    await onDeleteTemplate(selectedTemplateId)
    setSelectedTemplateId('')
    setTemplateStatus('Template deleted')
    window.setTimeout(() => setTemplateStatus(null), 2000)
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mx-auto w-full max-w-2xl rounded-2xl border border-radio-700 bg-radio-900 p-6 shadow-xl shadow-black/30"
    >
      <h2 className="text-xl font-semibold text-radio-100">Start a net</h2>
      <p className="mt-1 text-sm text-radio-400">
        Templates, script, and roll call are stored in the shared database so any device can run the
        net. Inactive stations are flagged or dropped based on prior nets.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Template" htmlFor="template">
          <div className="flex flex-wrap gap-2">
            <select
              id="template"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="input min-w-0 flex-1"
            >
              <option value="">Custom (no template)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.frequency ? ` · ${t.frequency}` : ''}
                  {t.rollCall?.length ? ` · ${t.rollCall.length} stations` : ''}
                </option>
              ))}
            </select>
            {selectedTemplateId && (
              <button
                type="button"
                onClick={() => void handleDeleteTemplate()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-alert/40 px-3 py-2 text-sm text-red-300 transition hover:bg-alert/15"
                title="Delete this template"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </button>
            )}
          </div>
        </Field>

        <Field label="Net name" htmlFor="net-name">
          <input
            id="net-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. County ARES Net"
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency" htmlFor="frequency">
            <input
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="input font-mono"
              placeholder="146.520"
              autoComplete="off"
            />
          </Field>
          <Field label="Mode" htmlFor="mode">
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="input"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Your callsign (NCS)" htmlFor="ncs">
          <input
            id="ncs"
            value={netControlCallsign}
            onChange={(e) => setNetControlCallsign(e.target.value.toUpperCase())}
            className="input font-mono uppercase tracking-wide"
            placeholder="W1AW"
            required
            autoComplete="off"
            autoFocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-radio-400">
            Roll call stations
          </span>
          <RollCallEditor stations={rollCall} onChange={setRollCall} />
        </div>

        <Field label="Net script" htmlFor="net-script">
          <textarea
            id="net-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={10}
            className="input min-h-[12rem] resize-y font-mono text-xs leading-relaxed"
            placeholder={SCRIPT_PLACEHOLDER}
            spellCheck
          />
          <span className="mt-1.5 block text-xs text-radio-500">
            Preamble, check-in procedure, traffic, closing — whatever you read on the air. Stored
            with the template so it is ready next time.
          </span>
        </Field>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-radio-950 transition hover:bg-green-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" aria-hidden />
          {busy ? 'Opening…' : 'Open net'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveTemplate()}
          className="flex items-center justify-center gap-2 rounded-xl border border-radio-600 bg-radio-800 px-4 py-3 text-sm font-medium text-radio-100 transition hover:bg-radio-700 disabled:opacity-60"
        >
          <BookmarkPlus className="h-4 w-4" aria-hidden />
          {selectedTemplateId ? 'Update template' : 'Save as template'}
        </button>
      </div>

      {templateStatus && (
        <p className="mt-3 text-center text-sm text-signal" role="status">
          {templateStatus}
        </p>
      )}
    </form>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="block">
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-radio-400">
        {label}
      </label>
      {children}
    </div>
  )
}
