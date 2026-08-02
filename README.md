# NetControl

A web app for amateur radio **net control**: templates with calling scripts, drag-and-drop roll call, check-ins, callsign lookup, and multi-device sessions backed by PostgreSQL.

## Features

- **Net templates** — name, frequency, mode, script, roll call list
- **Live roll call** — sortable cards, response checkbox (auto-logs check-in), permanent flag
- **Attendance rules**
  - Missed last **2** completed nets → inactive indicator (grey card + pill)
  - Missed last **4** completed nets → **dropped** from the net and removed from the template (unless **permanent**)
- **Manual check-ins** with traffic tracking
- **Callsign lookup** from a **local FCC ULS** amateur database (fills name + city/state)
- **Automatic FCC updates** — downloads the weekly complete dump (`l_amat.zip`, published Sundays) when a newer file is available
- **Shared database** — run the same net from multiple devices
- **WebSocket live sync** — check-ins, roll call, notes, and templates update on all open clients in real time
- **CSV export**
- **Docker** deployment

## Quick start (Docker)

```bash
docker compose up --build
```

Open **http://localhost:3000**

Data persists in the `pgdata` volume.

## Local development

### 1. Start Postgres

```bash
docker compose up -d db
```

### 2. Install & run

```bash
npm install
export DATABASE_URL=postgres://netcontrol:netcontrol@localhost:5432/netcontrol
npm run dev
```

- API + WebSocket: http://localhost:3000 (`/ws`)  
- Vite UI (proxies `/api` and `/ws`): http://localhost:5173  

### Production-style (built UI served by API)

```bash
npm run build
export DATABASE_URL=postgres://netcontrol:netcontrol@localhost:5432/netcontrol
npm start
```

Open http://localhost:3000

## Attendance rules

When you **open a net**, the server looks at prior **completed** sessions for the same template (or same net name if no template):

| Consecutive misses | Non-permanent | Permanent |
|--------------------|---------------|-----------|
| 0–1 | Normal | Normal |
| 2–3 | Inactive pill + greyed card | No warning |
| 4+ | Dropped from this net **and** removed from the template | Always kept |

A station counts as present if they appear in **check-ins** or were marked **responded** on roll call.

## FCC callsign database

On startup (and hourly), the server checks the FCC complete amateur dump:

- URL: `https://data.fcc.gov/download/pub/uls/complete/l_amat.zip` (~weekly, typically Sunday)
- If the local table is empty **or** the remote `Last-Modified` is newer, it downloads, parses `HD.dat` + `EN.dat`, and replaces the `callsigns` table
- Lookups: `GET /api/callsigns/W1AW`
- Status: `GET /api/callsigns/status`
- Force refresh: `POST /api/callsigns/update` with body `{ "force": true }`

First import can take several minutes (large zip). Lookups work as soon as the load finishes.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://netcontrol:netcontrol@localhost:5432/netcontrol` | Postgres connection |
| `PORT` | `3000` | API / static server port |
| `FCC_AMAT_URL` | FCC complete `l_amat.zip` URL | Override dump location |
| `FCC_DATA_DIR` | `./data/fcc` | Where the zip is cached |

See `.env.example`.

## Stack

- React 19 + Vite + TypeScript + Tailwind
- Express API
- PostgreSQL
- Docker Compose

## License

Licensed under the [Apache License 2.0](LICENSE).

If you use or fork NetControl, please credit the original project and author in your README or about screen.

73
