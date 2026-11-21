# LineReady

Shift brief and defect preparation assistant for aircraft line engineers (AI Hackathon · Use Case 4).

The engineer stays responsible for every maintenance decision. LineReady gathers, ranks and cites the information they need before they reach the aircraft.

- **Design:** [Figma: LineReady – Line Engineer Assist UI](https://www.figma.com/design/UPUlKnMjZheSmb6Pcl6Z0O)
- **Architecture:** `docs/LineReady-architecture.html` (layers, agents, retrieval, review layer)

## Repository layout

```
lineready/
├── web/                     # Tablet UI (Next.js 15 + React 19 + TypeScript)
│   └── src/
│       ├── app/
│       │   ├── globals.css  # design tokens: Day + Night (Air Arabia-inspired white, charcoal, red)
│       │   ├── layout.tsx   # Inter + IBM Plex Mono
│       │   └── (app)/       # screens behind the navigation
│       │       ├── tonight/      Shift plan: Next up, ground timeline, items by aircraft
│       │       ├── dossier/[id]/ Defect dossier with Accept / Edit / Not relevant review
│       │       ├── manuals/      Manual task viewer at controlled revision
│       │       ├── ask/          Cited answers
│       │       ├── readiness/    Shift-lead readiness board
│       │       ├── coach/        Trainee practice and competency
│       │       └── aircraft/     Tonight's aircraft
│       ├── components/
│       │   ├── ui/          # StatusBadge, Button, Card, SourceRow, Meter
│       │   ├── shell/       # NavRail (rail + phone bottom bar), ShiftHeader, ThemeToggle, AppState (role, reviews)
│       │   ├── tonight/     # NextUpCard, GroundTimeline, AircraftGroups, side cards
│       │   └── dossier/     # DossierView, ReviewBar
│       └── lib/
│           ├── types.ts     # ShiftBrief, BriefItem, Dossier, EvidenceRef …
│           ├── api.ts       # mock data now, FastAPI for the brief when LINEREADY_API_URL is set
│           └── mock/        # synthetic SHJ night shift + sample screen data
└── api/                     # (next) FastAPI + LangGraph backend from the architecture doc
```

## Run the UI

Requires Node.js 18.18 or newer.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 (redirects to `/tonight`). Day / Night mode and the role (engineer, shift lead, trainee) are under **Me** in the navigation. Night is the default between 19:00 and 07:00.

To read from a backend instead of the mock data, create `web/.env.local`:

```
LINEREADY_API_URL=http://localhost:8000
```

The UI then calls `GET /brief/current` and expects the `ShiftBrief` shape in `src/lib/types.ts`.

## UI rules carried over from the design

- Every AI claim shows at least one source. No source means no claim.
- No sign, defer or release actions anywhere in the UI. Review is Accept, Edit or Not relevant.
- Touch targets are at least 48 px for gloved use.
- Status is always colour + icon + word. Red means act before departure and nothing else; amber = for information / predictive, green = ready or exact controlled-source match, violet = training. Primary buttons are charcoal.
- Navigation depends on role: engineers see Tonight, Aircraft, Ask, Manuals; shift leads add Readiness; trainees see Coach.
