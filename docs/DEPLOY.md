# Despliegue de Climb Tracker v2 (Vercel + Supabase + Riot)

Guía paso a paso para publicar la app. En todo el documento, `APP_URL` es el origen público
definitivo, sin barra final (por ejemplo `https://climb-tracker.vercel.app`).

---

## 1. Supabase (Auth + Postgres)

1. Entra en <https://supabase.com/dashboard> → **New project**.
   - Elige la región más cercana a tus usuarios (para LAN: `us-east-1`).
   - Guarda la contraseña de la base de datos; la necesitarás en `DATABASE_URL`.
2. **Migraciones** — ejecútalas **en orden** en *SQL Editor* (pega el contenido de cada archivo y pulsa *Run*):
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_indexes.sql`

   (Alternativa con CLI: `npx supabase link --project-ref <ref>` y `npx supabase db push`.)
   La 0002 activa RLS sin políticas: la clave `anon` no puede leer ni escribir tablas por PostgREST;
   todo el acceso a datos pasa por el servidor.
3. **Auth → URL Configuration**:
   - **Site URL**: `APP_URL`
   - **Redirect URLs**: añade `APP_URL/auth/callback`
     (y `http://localhost:4200/auth/callback` si quieres probar magic link en local).
4. **Auth → Providers → Email**: actívalo (magic link). Puedes desactivar "Confirm email" de
   contraseña porque solo se usa enlace mágico. Para producción configura un **SMTP propio**
   (Auth → SMTP Settings): el SMTP integrado de Supabase tiene un límite muy bajo de correos/hora.
5. Copia las claves en **Project Settings → API**: `Project URL`, `anon public` y `service_role`.
6. Copia las cadenas de conexión en **Project Settings → Database → Connection string**:
   - **Transaction pooler (puerto 6543)** → para la app en Vercel.
   - **Direct connection (puerto 5432)** → solo para el script de importación / migraciones.

> **Aviso:** en el plan gratuito, Supabase **pausa los proyectos tras ~1 semana sin actividad**.
> Si la app deja de responder con errores de base de datos, entra al dashboard y pulsa *Restore*.
> Para evitarlo, usa un plan de pago o asegúrate de tener tráfico periódico.

---

## 2. Vercel

1. <https://vercel.com/new> → **Import Git Repository** → elige este repo. Framework: Next.js
   (se detecta solo). Build command `npm run build`, sin cambios.
2. **Settings → Environment Variables** (entorno *Production*; repite en *Preview* si lo usas):

| Variable | Valor / de dónde sale |
|---|---|
| `APP_URL` | Dominio público final, sin `/` final (ej. `https://climb-tracker.vercel.app`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → *Project URL*. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → *anon public*. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → *service_role*. **Secreta**, solo servidor. |
| `DATABASE_URL` | Cadena **Transaction pooler, puerto 6543** (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`). **Nunca** la directa 5432 en Vercel. |
| `RIOT_API_KEY` | Riot Developer Portal → tu app → *Production API Key* (ver §3). **Secreta**. |
| `RIOT_PLATFORM` | `la1` (LAN) u otra plataforma (`la2`, `na1`, `euw1`…). |
| `RIOT_REGION` | `americas` para LAN/LAS/NA/BR; `europe` / `asia` según la plataforma. |
| `RSO_ENABLED` | `0` hasta que Riot apruebe RSO; luego `1` (ver §3). |
| `RSO_CLIENT_ID` | Riot → aplicación RSO → *Client ID* (obligatorio si `RSO_ENABLED=1`). |
| `RSO_CLIENT_SECRET` | Riot → aplicación RSO → *Client Secret*. **Secreta**. |
| `RSO_REDIRECT_URI` | Exactamente `APP_URL/api/auth/rso/callback`. |

   **Nunca** definas `AUTH_MOCK` ni `RIOT_MOCK` en producción. `AUTH_MOCK=1` con
   `NODE_ENV=production` hace que la app lance un error a propósito; `RIOT_MOCK=1` serviría datos falsos.
   `RIOT_ID`, `CLIMB_DB_PATH` y `MOCK_USER_ID` tampoco hacen falta en Vercel.
3. **Deploy**. Cuando tengas el dominio definitivo, verifica que `APP_URL`, la *Site URL* y las
   *Redirect URLs* de Supabase y `RSO_REDIRECT_URI` usan ese mismo dominio, y redeploya.
4. `/api/sync` declara `maxDuration = 10` s y procesa lotes de ≤15 partidas en ≤8 s; el cliente
   repite la llamada con `cursor` hasta `hasMore=false`. Funciona en el plan Hobby.
5. Comprobación: abre `APP_URL/api/status` (debe responder 200), luego `APP_URL/entrar`, pide un
   enlace mágico y vincula tu Riot ID en `/cuenta`.

---

## 3. Riot Games (API key y RSO)

1. Entra en <https://developer.riotgames.com> con tu cuenta de Riot.
2. **Register Product → Production API Key**: describe la app, indica `APP_URL` y enlaza
   `APP_URL/privacidad` y `APP_URL/terminos` (Riot los exige; el disclaimer ya está en la app).
   Mientras esperas la aprobación puedes usar la *Development key* (caduca cada 24 h y tiene límites bajos)
   — no sirve para uso multiusuario real.
3. Cuando aprueben la app, copia la **Production API Key** en `RIOT_API_KEY` (Vercel) y redeploya.
4. **RSO (Riot Sign-On)**: solicita acceso a RSO para tu producto en el portal
   (requiere app de producción aprobada). En la aplicación RSO registra el redirect URI
   **exacto**: `APP_URL/api/auth/rso/callback`.
5. Con el *Client ID* y *Client Secret* aprobados, define en Vercel `RSO_CLIENT_ID`,
   `RSO_CLIENT_SECRET`, `RSO_REDIRECT_URI` y por último `RSO_ENABLED=1`. Redeploya.
   Si falta alguna de las tres, la app falla al arrancar (validación de `lib/server-env.ts`).

---

## 4. Importar datos locales (v1, SQLite) a Supabase

1. Inicia sesión en la app desplegada al menos una vez (crea tu usuario en Supabase).
2. Copia tu UUID: Supabase → **Authentication → Users** → columna *UID*.
3. En tu máquina, con la cadena **directa (puerto 5432)**:

```bash
# Git Bash / macOS / Linux
DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  npx tsx scripts/import-sqlite.ts --user-id <uuid> [--sqlite data/climb.db]
```

```powershell
# PowerShell
$env:DATABASE_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
npx tsx scripts/import-sqlite.ts --user-id <uuid>
Remove-Item Env:DATABASE_URL
```

   Sin `--sqlite` usa `data/climb.db`. No ejecutes la importación contra el pooler 6543.

---

## 5. Desarrollo local (sin Supabase ni Riot)

```bash
npm install
# .env.local (no se sube a git):
#   AUTH_MOCK=1
#   RIOT_MOCK=1
#   APP_URL=http://localhost:4200
#   (DATABASE_URL vacío → PGlite local con las mismas migraciones)
npm run dev -- -p 4200
```

- `AUTH_MOCK=1` inicia sesión con un usuario fijo (o el UUID de la cookie `ct_mock_user` / `MOCK_USER_ID`).
- `RIOT_MOCK=1` usa las fixtures de `lib/riot/fixtures/` (Riot ID de prueba `xDieguinho#9250`).
- Calidad antes de desplegar: `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- `npm run build` / `next start` fijan `NODE_ENV=production`, así que **no** se pueden combinar
  con `AUTH_MOCK=1`: para probar con mocks usa `next dev`.
