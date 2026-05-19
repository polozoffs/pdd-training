import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still loading, null = not authenticated, object = user
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    // Check if already logged in on app load
    axios.get('/api/auth/me')
      .then(res => setUser(res.data))
      .catch(() => setUser(null))

    // Global interceptor: auto-logout on 401 (expired token)
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (
          err.response?.status === 401 &&
          !err.config.url?.includes('/api/auth/')
        ) {
          setUser(null)
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [])

  const register = async (username, email, password) => {
    const res = await axios.post('/api/auth/register', { username, email, password })
    setUser(res.data)
    return res.data
  }

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password })
    setUser(res.data)
    return res.data
  }

  const logout = async () => {
    await axios.post('/api/auth/logout').catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
