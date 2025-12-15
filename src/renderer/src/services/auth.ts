import pkceChallenge from 'pkce-challenge'
import { jwtDecode } from 'jwt-decode'

const CLIENT_ID = '9w07ijqNLMn5EJhBGi8mNyt4Y2l3cp0c'
const REDIRECT_URI = 'http://localhost:5173/callback' // Ensure this matches Yoto Dashboard
const AUTH_URL = 'https://login.yotoplay.com/authorize'

export interface UserProfile {
  sub: string
  email?: string
  name?: string
  [key: string]: any
}

// Simple in-memory or localStorage for renderer (production app might use IPC to main store)
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'yoto_access_token',
  REFRESH_TOKEN: 'yoto_refresh_token',
  ID_TOKEN: 'yoto_id_token',
  PKCE_VERIFIER: 'yoto_pkce_verifier'
}

export const authService = {
  async initiateLogin() {
    const { code_verifier, code_challenge } = await pkceChallenge()
    localStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, code_verifier)

    const params = new URLSearchParams({
      audience: 'https://api.yotoplay.com',
      scope: 'openid profile email offline_access manage_library',
      response_type: 'code',
      client_id: CLIENT_ID,
      code_challenge: code_challenge,
      code_challenge_method: 'S256',
      redirect_uri: REDIRECT_URI
    })

    window.location.href = `${AUTH_URL}?${params.toString()}`
  },

  async handleCallback(code: string) {
    const codeVerifier = localStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER)
    if (!codeVerifier) throw new Error('No PKCE verifier found')

    // Use IPC to Main process to avoid CORS issues in Renderer
    // @ts-ignore
    const data = await window.electron.ipcRenderer.invoke('exchange-token', {
        code,
        codeVerifier,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI
    })

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token)
    if (data.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token)
    if (data.id_token) localStorage.setItem(STORAGE_KEYS.ID_TOKEN, data.id_token)
    
    localStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER)
    
    return data
  },

  isAuthenticated() {
    return !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  },

  getAccessToken() {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  },

  getIdToken() {
    return localStorage.getItem(STORAGE_KEYS.ID_TOKEN)
  },

  getUser(): UserProfile | null {
    // Prefer ID token for profile info, fall back to access token
    const token = localStorage.getItem(STORAGE_KEYS.ID_TOKEN) || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    if (!token) return null
    try {
      const decoded = jwtDecode<UserProfile>(token)
      console.log('Decoded Token Scopes:', (decoded as any).scope || 'No scope field')
      return decoded
    } catch {
      return null
    }
  },

  logout() {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.ID_TOKEN)
    window.location.href = '/'
  }
}
