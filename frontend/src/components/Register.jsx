import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Bot protection
  const [honeypot, setHoneypot] = useState('')
  const [formOpenAt] = useState(() => Date.now())
  const [captchaA] = useState(() => Math.floor(Math.random() * 9) + 1)
  const [captchaB] = useState(() => Math.floor(Math.random() * 9) + 1)
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Honeypot: silently reject if filled (only bots do this)
    if (honeypot) return

    // Timing: reject if form submitted in under 3 seconds
    if (Date.now() - formOpenAt < 3000) {
      setError('Пожалуйста, заполните форму внимательно.')
      return
    }

    // Math CAPTCHA
    if (parseInt(captchaAnswer, 10) !== captchaA + captchaB) {
      setError('Неверный ответ на проверочный вопрос.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await register(username, email, password, honeypot, formOpenAt)
      navigate('/quiz')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card card">
        <h2>Create Account</h2>
        <p className="auth-subtitle">Start your PDD journey</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Honeypot — invisible to humans, bots fill it in */}
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              type="text"
              name="website"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Name</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="Your name"
              minLength={2}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Min 8 characters"
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <div className="form-group">
            <label htmlFor="captcha">Сколько будет {captchaA} + {captchaB}?</label>
            <input
              id="captcha"
              type="number"
              value={captchaAnswer}
              onChange={e => setCaptchaAnswer(e.target.value)}
              required
              placeholder="Введите число"
              autoComplete="off"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
