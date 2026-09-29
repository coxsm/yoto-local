import pkceChallenge from 'pkce-challenge'
import { jwtDecode } from 'jwt-decode'

const CLIENT_ID = '9w07ijqNLMn5EJhBGi8mNyt4Y2l3cp0c'
const AUTH_URL = 'https://login.yotoplay.com/authorize'
const TOKEN_URL = 'https://login.yotoplay.com/oauth/token'

/**
 * Must be registered as an allowed callback URL in the Yoto developer dashboard.
 * Dev keeps the original http://localhost:5173/callback; the hosted build uses the app root,
 * e.g. https://coxsm.github.io/yoto-local/ (Pages has no server-side routes).
 */
export const REDIRECT_URI = import.meta.env.DEV
  ? `${window.location.origin}/callback`
  : new URL(import.meta.env.BASE_URL, window.location.origin).href

export interface UserProfile {
  sub: string
  email?: string
  name?: string
  given_name?: string
  exp?: number
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'yoto_access_token',
  REFRESH_TOKEN: 'yoto_refresh_token',
  ID_TOKEN: 'yoto_id_token',
  PKCE_VERIFIER: 'yoto_pkce_verifier'
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params })
  })
  if (!response.ok) {
    throw new Error(`Yoto login failed (${response.status}): ${await response.text()}`)
  }
  return (await response.json()) as TokenResponse
}

function storeTokens(data: TokenResponse): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token)
  if (data.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token)
  if (data.id_token) localStorage.setItem(STORAGE_KEYS.ID_TOKEN, data.id_token)
}

function tokenExpiry(token: string): number | null {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token)
    return exp ? exp * 1000 : null
  } catch {
    return null
  }
}

export const authService = {
  async initiateLogin(): Promise<void> {
    const { code_verifier, code_challenge } = await pkceChallenge()
    localStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, code_verifier)

    const params = new URLSearchParams({
      audience: 'https://api.yotoplay.com',
      scope: 'openid profile email offline_access manage_library',
      response_type: 'code',
      client_id: CLIENT_ID,
      code_challenge,
      code_challenge_method: 'S256',
      redirect_uri: REDIRECT_URI
    })

    window.location.href = `${AUTH_URL}?${params.toString()}`
  },

  async handleCallback(code: string): Promise<void> {
    const codeVerifier = localStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER)
    if (!codeVerifier) throw new Error('Login session expired. Please try connecting again.')

    // login.yotoplay.com allows CORS, so the exchange happens directly in the browser.
    const data = await requestToken({
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
      code,
      redirect_uri: REDIRECT_URI
    })
    storeTokens(data)
    localStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER)
  },

  /** Returns an access token that is valid for at least another minute, refreshing if needed. */
  async getValidAccessToken(): Promise<string | null> {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    if (!token) return null
    const expiry = tokenExpiry(token)
    if (!expiry || expiry - Date.now() > 60_000) return token

    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
    if (!refreshToken) return null
    try {
      storeTokens(await requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken }))
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    } catch (error) {
      console.error('Token refresh failed', error)
      return null
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  },

  getUser(): UserProfile | null {
    // Prefer ID token for profile info, fall back to access token
    const token =
      localStorage.getItem(STORAGE_KEYS.ID_TOKEN) || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    if (!token) return null
    try {
      return jwtDecode<UserProfile>(token)
    } catch {
      return null
    }
  },

  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.ID_TOKEN)
  }
}
