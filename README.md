# Receipt Extractor — Complete Local Repo

This repo contains:
- `apps/web` — React + Vite SPA with MSAL auth
- `apps/server` — Node/Express API with Azure AD access-token validation, Azure Document Intelligence OCR, and Microsoft Graph submission (with file attachments)
- `apps/mock-server` — Optional Flask mock API for demos

## Prereqs
- Node 18+ (recommend 20)
- Python 3.10+ (only if using the mock server)
- Azure tenant with two app registrations (SPA and API), an Azure Document Intelligence resource, and a SharePoint site + list

## 1) Environment
Copy and edit env:
```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
```
Fill in root `.env`:
- `TENANT_ID` — Directory (tenant) ID
- `CLIENT_ID` / `CLIENT_SECRET` — **API app** client and secret
- `APPLICATION_ID_URI` — From API app > Expose an API (e.g., `api://261b67cf-...`)
- `SPA_CLIENT_ID` — SPA app client ID
- `SCOPE_NAME` — Scope name on API app, e.g., `access_as_user`
- `SITE_ID`, `LIST_ID` — Your SharePoint targets
- `AZURE_DOC_INTELLIGENCE_ENDPOINT`, `AZURE_DOC_INTELLIGENCE_KEY`
- `AUTH_BYPASS` — set to `true` only for local tests to disable auth (never set in production)

Fill in `apps/web/.env`:
```
VITE_TENANT_ID=<TENANT_ID>
VITE_SPA_CLIENT_ID=<SPA client ID>
VITE_API_SCOPE=<APPLICATION_ID_URI>/<SCOPE_NAME>
VITE_API_PORT=4000
```

## 2) Azure App Setup (summary)
- API app:
  - Expose an API → Application ID URI (keep)
  - Add scope `access_as_user` (Enabled)
- SPA app:
  - Authentication → Platform: Single-page application (redirect URI includes `http://localhost:5173`)
  - API permissions → My APIs → Receipt Extractor API → Delegated `access_as_user` → Grant admin consent
  - Do **not** Expose an API on the SPA

## 3) Install and run
```bash
npm install
npm run dev
```
This starts:
- API on http://localhost:4000
- Vite dev server on http://localhost:5173 (proxying `/api` to 4000)

Mock mode (optional):
```bash
python3 -m pip install -r apps/mock-server/requirements.txt
npm run dev:mock
```
This runs Flask on 5001 and the SPA proxied to it.

## 4) Test flow
1. Open the SPA → sign in with Microsoft (MSAL redirect)
2. Upload a receipt (image or PDF) → `/api/upload` runs OCR and caches files server-side
3. Review fields → draw signature
4. Submit → `/api/submit` creates a SharePoint list item and attaches the cached files (and signature.png)

If OCR or Graph env is missing, the API returns mock data so you can exercise the UI.

## 5) Troubleshooting
- 401: Check token `aud` equals your API URI and `scp` includes your scope
- 403: Scope missing → ensure SPA requests the named scope (`.../access_as_user`)
- CORS: API allows `http://localhost:5173`
- OCR: Endpoint, key, and region must match your Azure resource
- Graph: Ensure application permission `Sites.ReadWrite.All` is granted for the API app
