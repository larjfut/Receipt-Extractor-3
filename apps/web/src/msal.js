// apps/web/src/msal.js

import { PublicClientApplication } from '@azure/msal-browser'

const tenantId = import.meta.env.VITE_TENANT_ID
const clientId = import.meta.env.VITE_SPA_CLIENT_ID
const scope = import.meta.env.VITE_API_SCOPE

if (!tenantId || !clientId || !scope) {
  console.warn('MSAL env missing. Set VITE_TENANT_ID, VITE_SPA_CLIENT_ID, VITE_API_SCOPE.')
}
if (scope && scope.endsWith('.default')) {
  console.warn('VITE_API_SCOPE should be a *named* scope like "api://<API-CLIENT-ID>/access_as_user", not ".default".')
}

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin
  },
  cache: { cacheLocation: 'sessionStorage' },
  system: { allowRedirectInIframe: true }
})

// Ensure we initialize once, before any other MSAL calls
let initPromise = null
export function initMsal() {
  if (!initPromise) {
    initPromise = (async () => {
      await msalInstance.initialize()
      // Resolve any pending redirect flows (no-op if none)
      await msalInstance.handleRedirectPromise()
    })()
  }
  return initPromise
}

export async function login() {
  await initMsal()
  await msalInstance.loginRedirect({ scopes: [scope] })
}

export async function getToken() {
  await initMsal()
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length === 0) {
    await login() // will redirect; function won't return
  }
  const account = msalInstance.getAllAccounts()[0]
  try {
    const res = await msalInstance.acquireTokenSilent({ account, scopes: [scope] })
    return res.accessToken
  } catch (e) {
    console.warn('Silent token acquisition failed, falling back to redirect:', e?.message || e)
    await msalInstance.acquireTokenRedirect({ account, scopes: [scope] })
    return '' // not reached; redirect occurs
  }
}

