import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Quiz from './components/Quiz'
import Admin from './components/Admin'
import Home from './components/Home'
import Login from './components/Login'
import Register from './components/Register'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import './App.css'

function NavBar() {
  const { user, logout, loading } = useAuth()

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">PDD</Link>
        <ul className="nav-menu">
          <li className="nav-item">
            <Link to="/" className="nav-link">Home</Link>
          </li>
          {user && (
            <li className="nav-item">
              <Link to="/quiz" className="nav-link">Quiz</Link>
            </li>
          )}
          {user?.role === 'admin' && (
            <li className="nav-item">
              <Link to="/admin" className="nav-link">Admin</Link>
            </li>
          )}
        </ul>
        <div className="nav-auth">
          {!loading && (
            user ? (
              <div className="nav-user">
                <span className="nav-username">👤 {user.username}</span>
                <button onClick={logout} className="nav-logout-btn">Sign Out</button>
              </div>
            ) : (
              <div className="nav-links">
                <Link to="/login" className="nav-link">Sign In</Link>
                <Link to="/register" className="nav-btn">Register</Link>
              </div>
            )
          )}
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <Router basename="/pdd">
      <AuthProvider>
        <div className="App">
          <NavBar />

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/quiz" element={
                <ProtectedRoute>
                  <Quiz />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                  <Admin />
                </ProtectedRoute>
              } />
            </Routes>
          </main>

          <footer className="footer">
            <p>PDD • Internal Use Only</p>
          </footer>
        </div>
      </AuthProvider>
    </Router>
  )
}

export default App
