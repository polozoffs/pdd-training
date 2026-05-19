import { useState, useEffect } from 'react'
import axios from 'axios'
import './Quiz.css'

// Speed mode is a UI preference — keep in localStorage only
const SPEED_MODE_KEY = 'pdd_speed_mode'

function Quiz() {
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [score, setScore] = useState({ correct: 0, incorrect: 0 })
  const [failedQuestions, setFailedQuestions] = useState([])
  const [quizComplete, setQuizComplete] = useState(false)
  const [language, setLanguage] = useState('en')
  const [loading, setLoading] = useState(true)
  const [progressInfo, setProgressInfo] = useState({ seen: 0, total: 0, cycleNumber: 1 })
  const [speedMode, setSpeedMode] = useState(
    () => localStorage.getItem(SPEED_MODE_KEY) === 'true'
  )

  // Server-side progress state (needed for save calls)
  const [shuffledIds, setShuffledIds] = useState([])
  const [currentPosition, setCurrentPosition] = useState(0)
  const [cycleNumber, setCycleNumber] = useState(1)
  const [sessionBatchIds, setSessionBatchIds] = useState([])
  const [sessionStartPosition, setSessionStartPosition] = useState(0)

  useEffect(() => {
    fetchQuestions()
  }, [])

  // Persist speed mode preference locally
  useEffect(() => {
    localStorage.setItem(SPEED_MODE_KEY, speedMode.toString())
  }, [speedMode])

  // Save mid-session progress to server whenever answer state changes
  useEffect(() => {
    if (questions.length > 0 && !loading && sessionBatchIds.length > 0) {
      axios.put('/api/progress/me', {
        shuffled_ids: shuffledIds,
        current_position: currentPosition,
        cycle_number: cycleNumber,
        session_batch: sessionBatchIds,
        session_index: currentIndex,
        session_score: score,
        session_failed: failedQuestions,
        session_position: sessionStartPosition,
        speed_mode: speedMode,
      }).catch(() => {/* silent — don't break UX */})
    }
  }, [score, failedQuestions, currentIndex, questions.length, loading])

  // Shuffle array using Fisher-Yates algorithm
  const shuffleArray = (array) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const fetchQuestions = async () => {
    try {
      // Load progress from server (single source of truth)
      const progressRes = await axios.get('/api/progress/me')
      const progress = progressRes.data

      // Restore an incomplete session if one exists on the server
      if (progress.session_batch && progress.session_batch.length > 0) {
        const questionsResponse = await axios.post('/api/questions/sequential', {
          question_ids: progress.session_batch
        })
        const statsResponse = await axios.get('/api/stats')

        setQuestions(questionsResponse.data)
        setCurrentIndex(progress.session_index || 0)
        setScore(progress.session_score || { correct: 0, incorrect: 0 })
        setFailedQuestions(progress.session_failed || [])
        setShuffledIds(progress.shuffled_ids || [])
        setCurrentPosition(progress.current_position || 0)
        setCycleNumber(progress.cycle_number || 1)
        setSessionBatchIds(progress.session_batch)
        setSessionStartPosition(progress.session_position || 0)
        setSpeedMode(progress.speed_mode || false)
        setProgressInfo({
          seen: progress.session_position || 0,
          total: statsResponse.data.total_questions,
          cycleNumber: progress.cycle_number || 1,
          questionsInBatch: questionsResponse.data.length,
        })
        setLoading(false)
        return
      }

      // No active session — start a fresh batch
      const statsResponse = await axios.get('/api/stats')
      const totalQuestions = statsResponse.data.total_questions

      const allQuestionsResponse = await axios.get('/api/questions')
      const allIds = allQuestionsResponse.data.map(q => q.id)

      let ids = progress.shuffled_ids || null
      let pos = progress.current_position || 0
      let cycle = progress.cycle_number || 1

      // Create a new shuffle if needed
      if (!ids || ids.length !== allIds.length || pos >= allIds.length) {
        if (pos >= allIds.length && ids && ids.length > 0) {
          cycle += 1
        }
        ids = shuffleArray(allIds)
        pos = 0
      }

      const batchSize = 30
      const nextBatchIds = ids.slice(pos, pos + batchSize)

      const questionsResponse = await axios.post('/api/questions/sequential', {
        question_ids: nextBatchIds
      })

      setQuestions(questionsResponse.data)
      setShuffledIds(ids)
      setCurrentPosition(pos)
      setCycleNumber(cycle)
      setSessionBatchIds(nextBatchIds)
      setSessionStartPosition(pos)
      setProgressInfo({
        seen: pos,
        total: totalQuestions,
        cycleNumber: cycle,
        questionsInBatch: questionsResponse.data.length,
      })

      // Save new batch to server
      await axios.put('/api/progress/me', {
        shuffled_ids: ids,
        current_position: pos,
        cycle_number: cycle,
        session_batch: nextBatchIds,
        session_index: 0,
        session_score: { correct: 0, incorrect: 0 },
        session_failed: [],
        session_position: pos,
        speed_mode: speedMode,
      })

    } catch (error) {
      console.error('Error fetching questions:', error)
      alert('Failed to load questions. Please make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const currentQuestion = questions[currentIndex]

  const handleAnswerSelect = (answerNumber) => {
    if (showResult) return
    
    // Set the selected answer
    setSelectedAnswer(answerNumber)

    // Immediately check if correct and show result
    const isAnswerCorrect = currentQuestion.answers.find(
      a => a.number === answerNumber
    )?.is_correct

    setIsCorrect(isAnswerCorrect)

    if (isAnswerCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }))
      
      // Speed UP mode: Auto-advance on correct answer
      if (speedMode) {
        setShowResult(true)
        setTimeout(() => {
          handleNextQuestion()
        }, 800) // Brief delay to show correct feedback
        return
      }
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }))
      // Track failed question
      setFailedQuestions(prev => [...prev, currentQuestion])
    }

    setShowResult(true)
  }

  const handleNextQuestion = () => {
    setSelectedAnswer(null)
    setShowResult(false)
    setIsCorrect(false)
    
    // Check if this was the last question
    if (currentIndex >= questions.length - 1) {
      setQuizComplete(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const handleRestartQuiz = async () => {
    // Advance global position by the number of questions in the completed batch
    const newPosition = sessionStartPosition + sessionBatchIds.length

    // Save completed position and clear session on server
    await axios.put('/api/progress/me', {
      shuffled_ids: shuffledIds,
      current_position: newPosition,
      cycle_number: cycleNumber,
      session_batch: null,
      session_index: 0,
      session_score: { correct: 0, incorrect: 0 },
      session_failed: [],
      session_position: 0,
      speed_mode: speedMode,
    }).catch(() => {})

    setCurrentPosition(newPosition)
    setSessionBatchIds([])

    // Reset quiz state and load next batch
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setIsCorrect(false)
    setScore({ correct: 0, incorrect: 0 })
    setFailedQuestions([])
    setQuizComplete(false)
    setLoading(true)
    fetchQuestions()
  }

  const handleRepeatFailed = () => {
    setQuestions(failedQuestions)
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setIsCorrect(false)
    setScore({ correct: 0, incorrect: 0 })
    setFailedQuestions([])
    setQuizComplete(false)
  }

  const handleQuitQuiz = () => {
    if (window.confirm('Are you sure you want to quit this quiz?')) {
      window.location.href = '/'
    }
  }

  const handleResetProgress = async () => {
    if (window.confirm('⚠️ This will reset your entire progress and start from the beginning. Are you sure?')) {
      await axios.post('/api/progress/reset').catch(() => {})
      window.location.reload()
    }
  }

  const getAnswerClass = (answer) => {
    if (!showResult) {
      return selectedAnswer === answer.number ? 'answer-selected' : ''
    }
    
    if (answer.is_correct) {
      return 'answer-correct'
    }
    
    if (selectedAnswer === answer.number && !answer.is_correct) {
      return 'answer-incorrect'
    }
    
    return ''
  }

  const getQuestionText = (textObj) => {
    if (!textObj) return ''
    if (language === 'en') return textObj.text_en || textObj.text_es || ''
    if (language === 'es') return textObj.text_es || textObj.text_en || ''
    if (language === 'ru') return textObj.text_ru || textObj.text_es || textObj.text_en || ''
    return textObj.text_es || textObj.text_en || ''
  }

  if (loading) {
    return (
      <div className="quiz-container">
        <div className="card">
          <div className="loading">Loading questions...</div>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="quiz-container">
        <div className="card">
          <h2>No questions available</h2>
          <p>Please add questions through the admin panel.</p>
        </div>
      </div>
    )
  }

  if (quizComplete || currentIndex >= questions.length) {
    const hasFailed = score.incorrect > 3
    const passPercentage = Math.round((score.correct / questions.length) * 100)
    
    return (
      <div className="quiz-container">
        <div className="card results-card">
          <h2>{hasFailed ? '❌ Quiz Failed' : '✅ Quiz Passed!'}</h2>
          
          <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
            <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
              📊 Overall Progress: {progressInfo.seen} / {progressInfo.total} questions completed
              <div style={{ marginTop: '5px' }}>
                <div style={{ 
                  width: '100%', 
                  height: '20px', 
                  backgroundColor: '#e9ecef', 
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${(progressInfo.seen / progressInfo.total) * 100}%`, 
                    height: '100%', 
                    backgroundColor: '#28a745',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
                <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
                  {Math.round((progressInfo.seen / progressInfo.total) * 100)}% complete • 
                  {progressInfo.total - progressInfo.seen} questions remaining • 
                  Cycle #{progressInfo.cycleNumber}
                </div>
              </div>
            </div>
          </div>
          
          <div className="results-summary">
            <div className="result-stat">
              <div className="result-number correct">{score.correct}</div>
              <div className="result-label">Correct</div>
            </div>
            <div className="result-stat">
              <div className="result-number incorrect">{score.incorrect}</div>
              <div className="result-label">Incorrect</div>
            </div>
            <div className="result-stat">
              <div className="result-number total">{questions.length}</div>
              <div className="result-label">Total</div>
            </div>
          </div>
          
          <div className="result-percentage" style={{ 
            color: hasFailed ? '#dc3545' : '#28a745',
            fontWeight: 'bold',
            fontSize: '1.5rem',
            margin: '20px 0'
          }}>
            Score: {passPercentage}% - {hasFailed ? 'More than 3 mistakes!' : 'Passed!'}
          </div>

          {failedQuestions.length > 0 && (
            <div className="failed-questions-section" style={{ 
              marginTop: '20px', 
              padding: '15px', 
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <h3 style={{ marginBottom: '15px', color: '#dc3545' }}>
                Failed Questions ({failedQuestions.length}):
              </h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {failedQuestions.map((q, idx) => (
                  <div key={q.id} style={{ 
                    marginBottom: '10px', 
                    padding: '10px',
                    backgroundColor: 'white',
                    borderRadius: '5px',
                    borderLeft: '3px solid #dc3545'
                  }}>
                    <strong>Q{idx + 1}:</strong> {getQuestionText(q.question).substring(0, 100)}...
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {failedQuestions.length > 0 && (
              <button className="btn btn-primary" onClick={handleRepeatFailed}>
                🔄 Repeat Failed Questions ({failedQuestions.length})
              </button>
            )}
            <button className="btn btn-success" onClick={handleRestartQuiz}>
              ➡️ Next Quiz Session (30 Questions)
            </button>
            <button className="btn" onClick={handleResetProgress} style={{
              backgroundColor: '#ffc107',
              color: '#000'
            }}>
              🔄 Reset All Progress
            </button>
            <button className="btn" onClick={() => window.location.href = '/'} style={{
              backgroundColor: '#6c757d',
              color: 'white'
            }}>
              🏠 Return to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-container">
      <div className="quiz-header card">
        <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#6c757d', textAlign: 'center' }}>
          📊 Overall Progress: {progressInfo.seen + currentIndex + 1} / {progressInfo.total} 
          {' '}({Math.round(((progressInfo.seen + currentIndex + 1) / progressInfo.total) * 100)}%)
          {' • Cycle #'}{progressInfo.cycleNumber}
        </div>
        <div className="quiz-progress">
          Question {currentIndex + 1} of {questions.length} (This Session)
        </div>
        <div className="quiz-score" style={{ 
          display: 'flex', 
          gap: '15px', 
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <span className="score-correct">✓ {score.correct}</span>
          <span className="score-incorrect" style={{
            color: score.incorrect > 3 ? '#dc3545' : '#dc3545',
            fontWeight: score.incorrect > 3 ? 'bold' : 'normal'
          }}>
            ✗ {score.incorrect}
            {score.incorrect > 3 && ' (FAILED)'}
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <input 
              type="checkbox" 
              id="speedMode" 
              checked={speedMode} 
              onChange={(e) => setSpeedMode(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <label htmlFor="speedMode" style={{ 
              cursor: 'pointer', 
              margin: 0,
              fontWeight: speedMode ? '600' : 'normal',
              color: speedMode ? '#10b981' : '#6c757d',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap'
            }}>
              ⚡ Speed UP
            </label>
          </div>
        </div>
        <div className="language-selector">
          <label>Language: </label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="ru">Русский</option>
          </select>
        </div>
        <button 
          className="btn" 
          onClick={handleQuitQuiz}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            padding: '5px 15px',
            fontSize: '0.9rem'
          }}
        >
          ❌ Quit Quiz
        </button>
      </div>

      <div className="card question-card">
        {currentQuestion.image && (
          <div className="question-image">
            <img 
              src={`/images/${currentQuestion.image}`} 
              alt={`Question ${currentQuestion.id}`}
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          </div>
        )}

        <div className="question-text">
          <h3>{getQuestionText(currentQuestion.question)}</h3>
        </div>

        <div className="answers-list">
          {currentQuestion.answers.map((answer) => (
            <button
              key={answer.number}
              className={`answer-button ${getAnswerClass(answer)}`}
              onClick={() => handleAnswerSelect(answer.number)}
              disabled={showResult}
            >
              <span className="answer-number">{answer.number}</span>
              <span className="answer-text">
                {getQuestionText(answer)}
              </span>
            </button>
          ))}
        </div>

        {showResult && !isCorrect && currentQuestion.explanation && (
          <div className="explanation">
            <h4>Explanation:</h4>
            <p>
              {typeof currentQuestion.explanation === 'string' 
                ? currentQuestion.explanation 
                : getQuestionText(currentQuestion.explanation)}
            </p>
          </div>
        )}

        <div className="question-actions">
          {showResult && (
            <button className="btn btn-success" onClick={handleNextQuestion}>
              Next Question →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Quiz
