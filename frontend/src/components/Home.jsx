import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import './Home.css'

function Home() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/stats')
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>PDD</h1>
        <p className="subtitle">Practice Spanish driving theory test</p>
      </div>

      {!loading && stats && (
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-number">{stats.total_questions}</div>
            <div className="stat-label">Total Questions</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.questions_with_images}</div>
            <div className="stat-label">With Images</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.questions_with_explanations}</div>
            <div className="stat-label">With Explanations</div>
          </div>
        </div>
      )}

      <div className="action-cards">
        <div className="card">
          <h2>📝 Take Quiz</h2>
          <p>Practice with randomized questions to test your knowledge</p>
          <Link to="/quiz">
            <button className="btn btn-primary btn-large">Start Quiz</button>
          </Link>
        </div>

        <div className="card">
          <h2>⚙️ Admin Panel</h2>
          <p>Edit questions, answers, and images</p>
          <Link to="/admin">
            <button className="btn btn-secondary btn-large">Go to Admin</button>
          </Link>
        </div>
      </div>

      <div className="info-section card">
        <h3>About</h3>
        <p>
          Practice Spanish driving theory test questions.
          Features:
        </p>
        <ul>
          <li>Practice with all available questions</li>
          <li>View questions in multiple languages</li>
          <li>Edit questions and answers through the admin panel</li>
          <li>Add or remove questions as needed</li>
        </ul>
        <p>
          <strong>Note:</strong> All changes are saved directly to JSON files, so no compilation is needed.
        </p>
      </div>
    </div>
  )
}

export default Home
