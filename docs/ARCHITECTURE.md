# Climb Tracker — Architecture

Status: **Accepted** (orion, 2026-11-22). No open decisions. Contract changes follow §14.

Local, single-user web app that syncs the SoloQ games of **xDieguinho#9250** (LAN, platform `la1`, regional route `americas`) from the Riot API into a local SQLite file and turns them into progress charts, phase goals (Bronze → Platinum) and rule-based coaching tips. UI text is Spanish; code, comments and this document are English.

---

## 1. Context and shape

```
Browser (React 19, Spanish UI)
   │  Server Components render pages (read via lib/services, no HTTP self-fetch)
   │  Client components: fetch POST /api/sync, PUT /api/journal/[id] → router.refresh()
   ▼
Next.js 15 server (App Router, Node runtime, local only)
   app/api/**  ── thin adapters: validate → lib/services → ServiceResult → JSON
   lib/services ── use cases (application layer)
      ├── lib/sync   (incremental sync orchestration)
      ├── lib/riot   (typed Riot client: HTTP or fixtures, rate limiter, retries)
      ├── lib/db     (better-sqlite3 connection, migrations, repositories)
      └── lib/coach  (PURE: metrics, ladder score, goals, coach rules)
   ▼
data/climb.db (SQLite, WAL)        Riot API (americas / la1) — only from the server
```

Pattern: **layered modular monolith with a pure domain core**. `lib/coach` is the domain (no I/O, no clock, no framework imports); `lib/services` is the application layer; `lib/db`, `lib/riot` are infrastructure; `app/` is delivery. Dependency direction is inward only:

| Module | May import | Must NOT import |
|---|---|---|
| `lib/types.ts`, `lib/errors.ts` | nothing (types/consts only) | anything with runtime I/O |
| `lib/coach/**` | `lib/types` | db, riot, next, react, node:* , `Date.now()` |
| `lib/riot/**` | `lib/types`, `lib/env` (via caller) | db, coach, next |
| `lib/db/**` | `lib/types`, `lib/env`, `better-sqlite3` | riot, coach, next |
| `lib/sync/**` | riot, db, coach (ranks), types | next, react |
| `lib/services/**` | everything in `lib/` | react, components |
| `app/api/**` | `lib/services`, `lib/api`, `lib/validation`, `lib/errors` | `lib/db`, `lib/riot` directly |
| `app/**` pages | `lib/services`, `components/**`, `lib/coach/ranks` (formatting) | `lib/db`, `lib/riot` directly |
| `components/**` | `lib/types`, `lib/errors`, `lib/coach/ranks`, `lib/ddragon` | `lib/services`, `lib/db`, `lib/riot`, `lib/env` |

Server-only modules (`lib/env.ts`, `lib/db/connection.ts`, `lib/services`, `lib/api/http.ts`) start with `import "server-only"` so an accidental client import fails the build. Vitest aliases `server-only` to `tests/stubs/server-only.ts`.

---

## 2. Folder structure and ownership

Each path has exactly one owner. Agents edit only their own paths; if you need a change elsewhere, ask the owner (or orion for contracts). Stub functions throw `notImplemented(owner, fn)`; replace the body, keep the signature.

```
.
├── app/
│   ├── layout.tsx, page.tsx                 nova
│   ├── globals.css                          lumen   (Tailwind v4 @theme tokens)
│   ├── loading.tsx, error.tsx, not-found.tsx  nova  (to create)
│   ├── partidas/page.tsx, partidas/[id]/page.tsx   nova
│   ├── metas/page.tsx, ajustes/page.tsx     nova
│   └── api/**/route.ts                      cobalt  (already wired to lib/services)
├── components/
│   ├── ui/        StatCard, RankBadge, GoalMeter, MatchRow, ChampionIcon   lumen
│   ├── charts/    LpChart, TrendChart, ChampionWinrateChart (+ helpers)    prism
│   ├── layout/    AppShell (header/nav)                                    nova
│   └── features/  SyncButton, JournalForm, ChampionFilter                  nova
├── lib/
│   ├── types.ts        contracts (rows, domain, HTTP)                      orion
│   ├── errors.ts       error code → HTTP status + Spanish message          orion
│   ├── not-implemented.ts  scaffold helper (delete when unused)            orion
│   ├── env.ts          server config, the ONLY reader of RIOT_API_KEY      cobalt
│   ├── validation.ts   zod request schemas                                 cobalt
│   ├── api/http.ts     ServiceResult → NextResponse helpers                cobalt
│   ├── services/       use cases used by routes and pages                  cobalt
│   ├── sync/           incremental sync                                    cobalt
│   ├── riot/           client, dto, rate limiter, mock, mappers, errors    cobalt
│   ├── db/             connection, migrations, repositories/*             cobalt
│   ├── coach/          ranks, metrics, goals, coach (pure)                 forge
│   └── ddragon.ts      Data Dragon icon URLs                               lumen
├── tests/
│   ├── scaffold.test.ts             orion
│   ├── riot/, db/, sync/, api/      cobalt
│   ├── coach/                       forge
│   ├── charts/                      prism (pure scale/format helpers only)
│   ├── stubs/server-only.ts         orion
│   └── fixtures/riot/**  cobalt     fixtures/coach/**  forge
├── data/climb.db         runtime, gitignored (created automatically)
└── docs/ARCHITECTURE.md  orion
```

Shared files (`package.json`, `package-lock.json`, configs) are owned by orion. **Do not add dependencies** while agents run in parallel (lockfile conflicts). Pre-installed and sufficient: next 15.5, react 19, better-sqlite3 13, zod 4, server-only, tailwindcss 4, vitest 5, eslint 9. Charts are hand-rolled SVG (ADR-004); no testing-library/jsdom (component logic that needs tests goes into pure helpers).

Scripts: `npm run dev` (port 4200), `npm run build`, `npm start` (port 4200), `npm run lint` (`eslint .`), `npm run typecheck` / `npx tsc --noEmit`, `npm test` (vitest run). Never use port 3000 or 4100-4199.

---

## 3. SQLite schema

Authoritative DDL: `lib/db/migrations.ts` (migration v1). Row types: `*Row` in `lib/types.ts`; domain types in camelCase. Conventions: timestamps are epoch **milliseconds** (`INTEGER`); booleans `0|1`; `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`; schema version in `PRAGMA user_version`. Migrations are append-only.

### summoner
| column | type | notes |
|---|---|---|
| puuid | TEXT PK | from account-v1 |
| game_name | TEXT NOT NULL | |
| tag_line | TEXT NOT NULL | |
| platform | TEXT NOT NULL | `la1` |
| updated_at | INTEGER NOT NULL | |
Index: `ux_summoner_riot_id` UNIQUE (lower(game_name), lower(tag_line), platform). The tracked player is the row whose puuid is in `settings.tracked_puuid`.

### matches (SoloQ only, queue 420)
| column | type | notes |
|---|---|---|
| match_id | TEXT PK | e.g. `LA1_1234567890` |
| game_creation | INTEGER NOT NULL | `info.gameCreation` (ms) |
| game_duration_s | INTEGER NOT NULL | `info.gameDuration` (seconds) |
| queue_id | INTEGER NOT NULL | 420 |
| patch | TEXT NOT NULL | `info.gameVersion` major.minor, e.g. `15.23` |
| is_remake | INTEGER 0/1 | 1 if my `gameEndedInEarlySurrender` OR duration < 300 s |
| raw_json | TEXT NULL | full MatchDto JSON (enables re-deriving columns in future migrations without refetching) |
| inserted_at | INTEGER NOT NULL | |
Index: `ix_matches_queue_creation (queue_id, game_creation DESC)`.

### match_participant (my stats, one row per match)
| column | type | source (match-v5 participant = me) |
|---|---|---|
| match_id | TEXT FK→matches ON DELETE CASCADE | |
| puuid | TEXT FK→summoner | |
| champion_id / champion_name | INTEGER / TEXT | `championId` / `championName` (Data Dragon id) |
| team_id | INTEGER (100/200) | `teamId` |
| team_position | TEXT ('' if unknown) | `teamPosition` |
| win | INTEGER 0/1 | `win` |
| kills, deaths, assists | INTEGER | |
| cs_total | INTEGER | `totalMinionsKilled + neutralMinionsKilled` |
| gold_earned | INTEGER | `goldEarned` |
| damage_to_champions | INTEGER | `totalDamageDealtToChampions` |
| vision_score | INTEGER | `visionScore` |
| control_wards_bought | INTEGER | `visionWardsBoughtInGame` |
| team_kills | INTEGER | sum of `kills` of all participants with my `teamId` (kill-participation denominator) |
| opponent_champion_id / opponent_champion_name | INTEGER / TEXT NULL | enemy (other teamId) with the same non-empty `teamPosition`; NULL if none/ambiguous |
| opponent_cs_total | INTEGER NULL | opponent's `totalMinionsKilled + neutralMinionsKilled` |
| cs_diff_10 | INTEGER NULL | `challenges.laneMinionsFirst10Minutes` (me − opponent); NULL if either missing or no opponent |
| max_cs_advantage | INTEGER NULL | `challenges.maxCsAdvantageOnLaneOpponent` |
PK `(match_id, puuid)`. Indexes: `ix_mp_puuid_champion (puuid, champion_name)`, `ix_mp_puuid_opponent (puuid, opponent_champion_name)`.

Gold/damage diff **at 15 min is not stored** in v1: match-v5 `challenges` has no reliable gold@15 field and the timeline endpoint would double request cost (ADR-005). CS@10 diff is the early-lane metric.

### rank_snapshots
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| puuid | TEXT FK→summoner | |
| taken_at | INTEGER NOT NULL | sync time |
| queue_type | TEXT NOT NULL | `RANKED_SOLO_5x5` |
| tier | TEXT NULL | NULL = unranked |
| division | TEXT NULL | Riot `rank` (I..IV) |
| lp, wins, losses | INTEGER NOT NULL | |
Index: `ix_rank_snapshots_puuid_taken (puuid, queue_type, taken_at)`. A row is inserted only if (tier, division, lp, wins, losses) differ from the latest snapshot — keeps the LP chart free of duplicate points; "last sync" lives in settings.

### journal_entries
| column | type | notes |
|---|---|---|
| match_id | TEXT PK FK→matches ON DELETE CASCADE | |
| death_reasons | TEXT NOT NULL DEFAULT '[]' | JSON array of `DeathReason` codes (unknown codes dropped on read) |
| lesson | TEXT NOT NULL DEFAULT '' | ≤ 1000 chars |
| tilt | INTEGER NULL CHECK 1..5 | |
| updated_at | INTEGER NOT NULL | |

### settings
| key | value |
|---|---|
| `tracked_puuid` | puuid of the tracked Riot ID |
| `last_sync_at` | epoch ms of last successful sync |
| `last_sync_error_code` | `ApiErrorCode` of the last failed sync; deleted on success |
The Riot API key is **never** stored in the database.

---

## 4. Data access conventions (cobalt)

- One connection per process (`getDb()`, cached on `globalThis`); `data/` is created with `mkdirSync({recursive:true})`; `CLIMB_DB_PATH` overrides the path (tests use `:memory:` via `openDatabase`).
- Repositories take `db` as first argument (testable with in-memory DBs) and return domain types; SQL is **always parameterized** (`?`/named params). Dynamic `ORDER BY`/columns only from whitelists.
- `insertMatch` writes `matches` + `match_participant` in one transaction with `INSERT OR IGNORE` → idempotent.
- All pages and route handlers that touch the DB are dynamic (`export const dynamic = "force-dynamic"`; routes also `runtime = "nodejs"`) so `next build` never opens the DB.
- Every list query is bounded (`limit` ≤ 100). Stats/goal aggregation loads the player's non-remake `MatchRecord`s once per request (hundreds of rows, trivial for SQLite) and hands them to `lib/coach`.

---

## 5. HTTP API contracts

All JSON. Types in `lib/types.ts` (names in brackets). Success = the DTO itself (no envelope). Error = `ApiErrorBody`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Revisa los datos enviados.", "fields": { "tilt": "Invalid input" } } }
```

| code | HTTP | default `message` (Spanish, from `lib/errors.ts`) |
|---|---|---|
| BAD_REQUEST | 400 | La petición no es válida. |
| VALIDATION_ERROR | 422 | Revisa los datos enviados. (+`fields`) |
| MATCH_NOT_FOUND | 404 | No encontramos esa partida. |
| SUMMONER_NOT_FOUND | 404 | No encontramos ese Riot ID en LAN… |
| SYNC_IN_PROGRESS | 409 | Ya hay una sincronización en curso… |
| RIOT_KEY_MISSING | 503 | Falta la API key de Riot… o activa RIOT_MOCK=1… |
| RIOT_KEY_INVALID | 502 | Riot rechazó la API key (caducada o inválida)… |
| RIOT_RATE_LIMITED | 503 | Riot está limitando las peticiones… (+`retryAfterS`) |
| RIOT_UNAVAILABLE | 502 | Los servidores de Riot no responden… |
| INTERNAL_ERROR | 500 | Ocurrió un error inesperado… |

Responses carry `Cache-Control: no-store`. Unexpected exceptions are caught by `handle()` → 500 with the generic message; logs contain `err.message` only (never headers, never the key).

### POST /api/sync → `SyncResponse`
Body: none. Runs the incremental sync (§6).
```json
{ "newMatches": 12, "totalMatches": 87, "hasMore": false,
  "rank": { "id": 5, "puuid": "…", "takenAt": 1763800000000, "queueType": "RANKED_SOLO_5x5",
            "tier": "BRONZE", "division": "III", "lp": 45, "wins": 30, "losses": 28, "ladderScore": 545 },
  "snapshotCreated": true, "syncedAt": 1763800000000, "durationMs": 4120, "mock": false }
```
Errors: 409 SYNC_IN_PROGRESS, 503 RIOT_KEY_MISSING, 502 RIOT_KEY_INVALID, 404 SUMMONER_NOT_FOUND, 503 RIOT_RATE_LIMITED, 502 RIOT_UNAVAILABLE. Matches saved before a failure stay saved (next sync resumes).

### GET /api/matches?champion=&limit=&offset= → `MatchListResponse`
`champion` optional, `/^[A-Za-z]{1,30}$/` (Data Dragon id, e.g. `MissFortune`); unknown champion → empty `items`, not an error. `limit` 1..100 (default 20), `offset` ≥ 0 (default 0). Invalid → 422 VALIDATION_ERROR. Items newest first, remakes included (flagged `isRemake`).
```json
{ "items": [ { "matchId": "LA1_1", "gameCreation": 1763800000000, "gameDurationS": 1820, "patch": "15.23",
  "isRemake": false, "championId": 222, "championName": "Jinx", "win": true, "kills": 8, "deaths": 3,
  "assists": 6, "kda": 4.67, "csTotal": 190, "csPerMin": 6.26, "opponentChampionName": "Caitlyn",
  "hasJournal": false } ],
  "total": 87, "limit": 20, "offset": 0, "champions": ["Jinx", "MissFortune", "Tristana", "Ashe"] }
```

### GET /api/matches/[id] → `MatchDetailResponse`
`id` must match `/^[A-Z0-9]{2,5}_\d{1,20}$/`, otherwise (or unknown) 404 MATCH_NOT_FOUND.
```json
{ "match": { "...MatchRecord": "…", "durationMin": 30.33, "csPerMin": 6.26, "kda": 4.67,
             "killParticipation": 0.61, "goldPerMin": 410.2, "damagePerMin": 702.5,
             "visionPerMin": 0.59, "csDiffVsOpponent": -12 },
  "tips": [ { "ruleId": "NO_CONTROL_WARD", "severity": "low", "message": "…" } ],
  "journal": null }
```
`tips` are computed with the phase of the latest rank snapshot; `[]` for remakes.

### GET /api/journal/[matchId] → `JournalResponse`
`{ "entry": JournalEntry | null }`. 404 MATCH_NOT_FOUND if the match does not exist.

### PUT /api/journal/[matchId] → `JournalResponse`
Body `JournalInput`:
```json
{ "deathReasons": ["no_vision", "jungle_gank"], "lesson": "Wardear el río antes del minuto 3.", "tilt": 2 }
```
`deathReasons` ⊆ `DEATH_REASONS` (deduplicated), `lesson` trimmed ≤ 1000 chars, `tilt` 1..5 or null. Upsert (idempotent): returns `{ "entry": { "matchId": "…", "deathReasons": [...], "lesson": "…", "tilt": 2, "updatedAt": 1763800000000 } }`. Errors: 400 BAD_REQUEST (non-JSON), 422 VALIDATION_ERROR, 404 MATCH_NOT_FOUND.

### GET /api/stats → `StatsResponse`
```json
{ "summoner": { "puuid": "…", "gameName": "xDieguinho", "tagLine": "9250", "platform": "la1", "updatedAt": 0 },
  "rank": RankSnapshot | null,
  "ladder": [ { "takenAt": 0, "tier": "BRONZE", "division": "III", "lp": 45, "ladderScore": 545 } ],
  "totals": AggregateStats | null,      // all non-remake games
  "recent": AggregateStats | null,      // last 10 non-remake games
  "streak": { "kind": "loss", "count": 2 } | null,
  "trend": [ TrendPoint ],              // oldest first, MA5 null for the first 4 points
  "byChampion": [ ChampionStats ], "byOpponent": [ OpponentStats ],
  "coach": CoachSummary }
```
Empty DB → 200 with nulls/empty arrays (pages show empty states), never an error.

### GET /api/goals → `GoalsResponse`
```json
{ "phase": "BRONZE", "rank": RankSnapshot | null, "sampleSize": 20, "windowSize": 20, "minSample": 5,
  "goals": [ { "id": "bronze_cs_per_min", "phase": "BRONZE", "metric": "csPerMin", "comparator": "gte",
               "target": 6, "label": "6+ CS por minuto", "value": 5.6, "status": "yellow",
               "progress": 0.93, "carried": false } ] }
```

### GET /api/status → `StatusResponse`
```json
{ "riotId": "xDieguinho#9250", "platform": "la1", "region": "americas", "apiKeyConfigured": true,
  "mockMode": false, "lastSyncAt": 1763800000000, "lastSyncErrorCode": null, "matchCount": 87,
  "summonerResolved": true }
```
Never fails (DB errors → counts 0). Never returns the key or any part of it.

---

## 6. Sync algorithm (`lib/sync/sync.ts`, cobalt)

1. Single-flight: a module-level promise lock; a second concurrent call → `SYNC_IN_PROGRESS`.
2. Config: if `!mock && !riotApiKey` → `RIOT_KEY_MISSING` (no network call). Mock → fixture client, no limiter.
3. `account-v1 by-riot-id` → upsert `summoner`, set `settings.tracked_puuid`.
4. Collect candidate ids: `match-v5 ids` with `queue=420&start=0&count=100`, then `start=100` while the page is full and `SYNC_LOOKBACK_IDS = 200` not reached; stop early when a whole page is already stored.
5. `missing = candidates − existingMatchIds` (newest first); fetch at most `SYNC_MAX_NEW_MATCHES = 40` per run (≈46 requests total — always inside 100/2 min). For each: `getMatch` → `mapMatch` → skip if `queueId ≠ 420` or I am not a participant → `insertMatch` (own transaction). A 404 on one match is skipped. Stop fetching if elapsed > 90 s.
6. `hasMore = missing.length > fetched` (or time budget hit) → UI suggests syncing again. Re-running continues the backfill because `missing` is recomputed (idempotent, no duplicates).
7. `league-v4 entries/by-puuid` (fallback §7) → SoloQ entry (`RANKED_SOLO_5x5`) or unranked → `insertSnapshotIfChanged`.
8. Success: `settings.last_sync_at = now`, delete `last_sync_error_code`. Failure: map `RiotApiError` → `ApiErrorCode`, store `last_sync_error_code`, return `{ok:false}`.

Riot error mapping: 401/403 → RIOT_KEY_INVALID; 404 on account → SUMMONER_NOT_FOUND; 429 after retries → RIOT_RATE_LIMITED (`retryAfterS`); 5xx/network/timeout after retries, or 400 → RIOT_UNAVAILABLE.

---

## 7. Riot client (`lib/riot`, cobalt)

Header `X-Riot-Token: <key>` (only place the key is used). Base URLs: `https://americas.api.riotgames.com`, `https://la1.api.riotgames.com`. Path segments are `encodeURIComponent`-ed.

| method | endpoint | host |
|---|---|---|
| `getAccountByRiotId` | `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | americas |
| `getMatchIds` | `/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start={s}&count={c≤100}` | americas |
| `getMatch` | `/lol/match/v5/matches/{matchId}` | americas |
| `getLeagueEntries` | `/lol/league/v4/entries/by-puuid/{puuid}` | la1 |
| fallback (only if by-puuid returns 404) | `/lol/summoner/v4/summoners/by-puuid/{puuid}` → `/lol/league/v4/entries/by-summoner/{id}` | la1 |

**Rate limiting** (`RateLimiter`): sliding windows 20 req / 1 s AND 100 req / 120 s (dev key), one shared limiter per process for both hosts (conservative; Riot's app limit is per region, method limits are far above our volume). `acquire()` waits until both windows have room.

**Retries** (`maxRetries = 3`): 429 → wait `Retry-After` seconds (default 1 s if absent) then retry; 5xx / network error / 10 s timeout (`AbortSignal.timeout(10_000)`) → backoff 500 ms · 2^attempt; 401/403/404/400 → no retry. Clock/sleep/fetch are injected → tests run without real time or network.

**Mock mode** (`RIOT_MOCK=1`): `createFixtureRiotClient(path.join(process.cwd(), "tests/fixtures/riot"))`, no key required, no limiter. Layout:
```
tests/fixtures/riot/account.json          AccountDto
tests/fixtures/riot/match-ids.json        string[] newest first (mock applies start/count)
tests/fixtures/riot/matches/{id}.json     MatchDto
tests/fixtures/riot/league-entries.json   LeagueEntryDto[] (Bronze III)
```
Fixture requirements: ≥ 12 synthetic SoloQ games across Jinx, MissFortune, Tristana, Ashe; wins and losses; one remake; one game with `teamPosition: ""` (no lane opponent); the two most recent games are losses (exercises the tilt warning); `challenges` present in most games and absent in at least one. Fixtures must be synthetic/anonymized (no real third-party puuids or names).

---

## 8. Ranks and ladder score (`lib/coach/ranks.ts`)

Tier order: IRON < BRONZE < SILVER < GOLD < PLATINUM < EMERALD < DIAMOND < MASTER < GRANDMASTER < CHALLENGER. Division order inside a tier: IV < III < II < I.

```
IRON..DIAMOND:  ladderScore = tierIndex × 400 + divisionIndex × 100 + clamp(lp, 0, 100)
                (tierIndex IRON=0…DIAMOND=6; divisionIndex IV=0, III=1, II=2, I=3)
MASTER+:        ladderScore = 2800 + max(lp, 0)   (no divisions; GM/Challenger are LP cut-offs)
```
Anchors: Bronze III 0 LP = 500 (today), Platinum IV 0 LP = 1600 (`GOAL_LADDER_SCORE`), Diamond I 100 LP = 2800 = Master 0 LP. Unranked → `ladderScore: null` (excluded from `ladder`). `rankFromLadderScore` inverts the formula for chart axis labels; `formatRank` renders "Bronce III · 45 LP".

Phase mapping: unranked / IRON / BRONZE → **BRONZE**, SILVER → **SILVER**, GOLD and above → **GOLD**.

---

## 9. Phase goals (`lib/coach/goals.ts`, forge)

Evaluated over the most recent `GOAL_WINDOW = 20` non-remake games (all champions). If fewer than `MIN_GOAL_SAMPLE = 5` games → `value: null`, `status: "insufficient"`, `progress: 0`.

| id | phase | metric | rule | label |
|---|---|---|---|---|
| bronze_cs_per_min | BRONZE | csPerMin | ≥ 6 | 6+ CS por minuto |
| bronze_deaths | BRONZE | avgDeaths | ≤ 5 | 5 muertes o menos por partida |
| silver_cs_per_min | SILVER | csPerMin | ≥ 7 | 7+ CS por minuto |
| silver_control_wards | SILVER | controlWardsPerGame | ≥ 1 | 1+ control ward por partida |
| gold_kill_participation | GOLD | killParticipation | ≥ 0.50 | 50%+ de participación en kills |
| gold_deaths | GOLD | avgDeaths | ≤ 4 | 4 muertes o menos por partida |

Goals shown per phase (`PHASE_GOALS`): BRONZE = bronze_cs, bronze_deaths. SILVER = silver_cs, silver_wards, bronze_deaths (carried). GOLD = gold_kp, gold_deaths, silver_cs (carried), silver_wards (carried).

Metric values come from `aggregate()` (§ metrics: csPerMin = Σcs/Σminutes, avgDeaths = Σdeaths/games, controlWardsPerGame = Σwards/games, killParticipation = Σ(k+a)/Σteam_kills, 0 if Σteam_kills = 0).

Traffic light (tolerance 10 %):
- `gte`: green if value ≥ target; yellow if value ≥ target × 0.9; else red. progress = min(1, value / target).
- `lte`: green if value ≤ target; yellow if value ≤ target × 1.1; else red. progress = value ≤ target ? 1 : max(0, 1 − (value − target) / target).
Comparisons use the unrounded value; UI rounds for display (1 decimal; KP as %).

---

## 10. Coach rules (`lib/coach/coach.ts`, forge)

Pure and deterministic: same input → same output (no clock, no randomness; sort by `gameCreation`, then `matchId`). Remakes are ignored everywhere. Phase targets: `csTarget` = 6 (BRONZE) / 7 (SILVER, GOLD); `deathTarget` = 5 (BRONZE, SILVER) / 4 (GOLD).

### Per-match tips (`tipsForMatch`) — 1 to 3 tips
Evaluate all rules; sort by severity (high > medium > low > positive), ties by the order below; keep the first 3. If no negative rule fires → exactly one `GOOD_GAME`.

| # | ruleId | condition | severity | message template (Spanish) |
|---|---|---|---|---|
| 1 | HIGH_DEATHS | deaths ≥ 8 / deaths > deathTarget | high / medium | "Moriste {deaths} veces (meta: {deathTarget} o menos). Antes de avanzar, mira el minimapa: si no ves al jungla rival, juega más atrás." |
| 2 | LOW_CS | csPerMin < csTarget − 1 / csPerMin < csTarget | high / medium | "Hiciste {csPerMin} CS/min (meta: {csTarget}). Concéntrate en el last-hit y recoge oleadas laterales entre objetivos." |
| 3 | LOST_LANE_CS | csDiff10 ≤ −15 | medium | "Llegaste al minuto 10 con {abs} CS menos que tu rival. Prioriza farmear seguro antes que intercambiar." |
| 4 | NO_CONTROL_WARD | controlWardsBought = 0 | medium (SILVER, GOLD) / low (BRONZE) | "No compraste ninguna control ward. Compra una en cada regreso a base." |
| 5 | LOW_KILL_PARTICIPATION | teamKills ≥ 10 and KP < 0.40 | medium (GOLD) / low | "Participaste en el {kp}% de las kills de tu equipo. Agrúpate para dragones y peleas cuando tu línea esté empujada." |
| 6 | LOW_VISION | visionPerMin < 0.4 | low | "Tu puntuación de visión fue baja ({visionPerMin}/min). Usa tu trinket y limpia wards con la control ward." |
| 7 | GOOD_GAME | no rule 1-6 fired | positive | win: "¡Buena partida! Cumpliste lo básico: farmeo, muertes y visión." loss: "Tus números fueron buenos aunque perdiste. Sigue así: la constancia sube LP." |

### Recent summary (`summarizeRecent`) — last 10 non-remake games
`games` = count, `stats` = `aggregate(last10)` (null if 0 games), `tilt` = `isTilted()`, `insights` = up to 4 tips sorted like above (ties by order below).

| # | ruleId | condition | severity | message template |
|---|---|---|---|---|
| 1 | TILT_LOSS_STREAK | 2 most recent games are losses (`tilt = true`) | high | "Llevas {n} derrotas seguidas: descansa 10-15 minutos antes de jugar otra." (n = current loss streak) |
| 2 | TILT_SELF_REPORTED | ≥ 2 of the 3 most recent journal entries (by game time) have tilt ≥ 4 | high | "Tu diario indica tilt alto en las últimas partidas. Haz una pausa o termina la sesión por hoy." |
| 3 | TOP_DEATH_REASON | most frequent death reason among window entries, count ≥ 3 (ties by `DEATH_REASONS` order) | medium | "Tu causa de muerte más repetida es «{label}» ({count} veces). Enfócate en eso la próxima partida." |
| 4 | DEATHS_TREND | ≥ 10 games; avg deaths last 5 − previous 5: ≥ +1 / ≤ −1 | medium / positive | "Estás muriendo más ({a} vs {b})…" / "Estás muriendo menos ({a} vs {b}). ¡Bien!" |
| 5 | CS_TREND | ≥ 10 games; csPerMin last 5 − previous 5: ≤ −0.5 / ≥ +0.5 | medium / positive | "Tu farmeo bajó ({a} vs {b} CS/min)…" / "Tu farmeo mejoró ({a} vs {b} CS/min)." |
| 6 | WORST_CHAMPION | champion with ≥ 3 games and winrate ≤ 0.34 (lowest; ties: more games, then name) | low | "Con {champ} vas {w}-{l} en tus últimas partidas. Considera practicarlo en normales." |
| 7 | BEST_CHAMPION | champion with ≥ 3 games and winrate ≥ 0.60 (highest; ties: more games, then name) | positive | "{champ} es tu mejor pick ahora ({w}-{l}). Priorízalo en SoloQ." |

Numbers in messages: 1 decimal, percentages as integers. Champion names displayed as-is (forge may add a display map, e.g. MissFortune → "Miss Fortune").

---

## 11. Architecture decision records

**ADR-001 SQLite driver: better-sqlite3 13.x.** Context: native module risk on Windows/Node 24. Verified on this machine: `better-sqlite3@13.2.0` ships N-API prebuilds inside the package (`prebuilds/win32-x64.node`), loads on Node 24.21 without node-gyp, runs under Vitest (forks pool), and a compiled Next 15.5 route using it (with `serverExternalPackages: ["better-sqlite3"]`) created `data/…/climb.db` and migrated. npm 11 reports its `install` script as "not covered by allowScripts" — **do not approve it**: it would run `node-gyp rebuild` (needs VS Build Tools) and is unnecessary. Alternative kept as plan B: `node:sqlite` (built-in, still experimental warnings) — swap is contained in `lib/db/connection.ts` + repositories. Consequence: synchronous DB API (fine for single-user local app).

**ADR-002 Mutations through Route Handlers, reads through a services layer.** Pages (Server Components) call `lib/services` directly; client components call `POST /api/sync` and `PUT /api/journal/[matchId]` then `router.refresh()`. Chosen over Server Actions because the plan requires explicit, curl-testable JSON contracts and QA exercises them; one code path (services) serves both. Trade-off: slightly more boilerplate than actions.

**ADR-003 Snapshots for LP history, deduplicated.** Riot gives no historical LP; a snapshot is stored on each sync only when rank data changed. Chart starts the first day the app is used (UI must say so).

**ADR-004 Charts as hand-rolled SVG (no chart library).** Small data (≤ a few hundred points), need for honest axes and accessible text alternatives, and no new dependencies during parallel work. Trade-off: prism writes scales/ticks manually (keep them as pure, tested helpers).

**ADR-005 No match timeline in v1.** Gold/damage @15 need `/timeline` (+1 request per match, halving sync throughput). v1 uses `cs_diff_10` and `max_cs_advantage` from `challenges`. Adding later = migration v2 + backfill from Riot (raw_json does not contain timeline).

**ADR-006 Remakes stored but excluded** from stats, goals, coach and streaks (listed with a badge).

**ADR-007 Per-run sync cap of 40 matches.** Keeps one sync inside the dev-key 2-minute budget and the HTTP request short; `hasMore` + recomputed missing set makes repeated clicks a safe backfill.

---

## 12. Security

- `RIOT_API_KEY` read only in `lib/env.ts`; used only in `lib/riot` HTTP client header. Never in responses (`/api/status` exposes a boolean), logs, errors, `NEXT_PUBLIC_*`, settings table or fixtures.
- `.env.local` and `data/*.db` are gitignored. `.env.example` documents variables with an empty key.
- All SQL parameterized; all route input validated with zod (`lib/validation.ts`); match ids regex-checked before reaching the DB.
- Error bodies contain code + Spanish message only; no stack traces.
- App is local only (`next dev/start -p 4200`), no auth by design (single user, localhost).

---

## 13. Gotchas

- npm 11 `allowScripts`: leave better-sqlite3's install script unapproved (ADR-001). If `node_modules` is reinstalled on another arch, prebuilds cover win/linux/mac x64+arm64.
- Any module importing `lib/db` must only run on the server and in dynamic routes/pages (`force-dynamic`), or `next build` would open/create the DB.
- Next 15: route `params` and page `params`/`searchParams` are Promises — `await` them.
- `next lint` is deprecated in 15.5; `npm run lint` runs `eslint .` (flat config, `next/core-web-vitals` + `next/typescript`, `no-explicit-any` and `no-non-null-assertion` as errors). `next build` still lints and type-checks.
- `noUncheckedIndexedAccess` is on: array index access returns `T | undefined`.
- `championName` from match-v5 is the Data Dragon id (`MissFortune`); display names may need a map. DDragon version is pinned in `lib/ddragon.ts`.
- Dev keys expire every 24 h → RIOT_KEY_INVALID message tells the user to regenerate (or request a Personal API Key).
- Mock fixtures are read from `process.cwd()/tests/fixtures/riot`; run the app from the project root.

---

## 14. Change policy and changelog

`lib/types.ts`, `lib/errors.ts` and this document are the contract. Allowed without orion: additive optional fields / new union members, mirrored here with a changelog line. Breaking changes (rename/remove/semantics) require orion.

- 2026-11-22 — v1 accepted (orion).
