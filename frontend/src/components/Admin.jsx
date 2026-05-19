import { useState, useEffect } from 'react'
import axios from 'axios'
import './Admin.css'

function Admin() {
  const [questions, setQuestions] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [imageFile, setImageFile] = useState(null)

  useEffect(() => {
    fetchQuestions()
  }, [])

  const fetchQuestions = async () => {
    try {
      const response = await axios.get('/api/questions')
      setQuestions(response.data)
    } catch (error) {
      console.error('Error fetching questions:', error)
      alert('Failed to load questions')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (question) => {
    setEditingId(question.id)
    setEditForm(JSON.parse(JSON.stringify(question))) // Deep copy
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
    setImageFile(null)
  }

  const handleSaveEdit = async () => {
    try {
      // Upload image if new one is selected
      if (imageFile) {
        const formData = new FormData()
        formData.append('file', imageFile)
        const uploadResponse = await axios.post('/api/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        editForm.image = uploadResponse.data.filename
      }

      await axios.put(`/api/questions/${editingId}`, editForm)
      await fetchQuestions()
      setEditingId(null)
      setEditForm(null)
      setImageFile(null)
      alert('Question updated successfully!')
    } catch (error) {
      console.error('Error saving question:', error)
      alert('Failed to save question')
    }
  }

  const handleDelete = async (questionId) => {
    if (!confirm('Are you sure you want to delete this question?')) return

    try {
      await axios.delete(`/api/questions/${questionId}`)
      await fetchQuestions()
      alert('Question deleted successfully!')
    } catch (error) {
      console.error('Error deleting question:', error)
      alert('Failed to delete question')
    }
  }

  const handleInputChange = (field, value, lang = null) => {
    setEditForm(prev => {
      const newForm = { ...prev }
      if (lang) {
        // For question or answer text with language
        if (field.startsWith('question')) {
          newForm.question[`text_${lang}`] = value
        } else {
          // For answers
          const answerIndex = parseInt(field.split('_')[1]) - 1
          newForm.answers[answerIndex][`text_${lang}`] = value
        }
      } else {
        newForm[field] = value
      }
      return newForm
    })
  }

  const handleAnswerCorrectChange = (answerNumber) => {
    setEditForm(prev => ({
      ...prev,
      answers: prev.answers.map(ans => ({
        ...ans,
        is_correct: ans.number === answerNumber
      }))
    }))
  }

  const filteredQuestions = questions.filter(q => 
    q.id.toString().includes(searchTerm) ||
    q.question.text_en?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.question.text_es?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.question.text_ru?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="admin-container">
        <div className="card">
          <div className="loading">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header card">
        <h1>⚙️ Admin Panel</h1>
        <p>Edit questions and answers directly. Changes are saved to JSON files.</p>
        
        <div className="search-box">
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="admin-stats">
          Total Questions: <strong>{questions.length}</strong>
        </div>
      </div>

      <div className="questions-list">
        {filteredQuestions.map(question => (
          <div key={question.id} className="card question-item">
            {editingId === question.id ? (
              // Edit Mode
              <div className="edit-form">
                <h3>Editing Question #{question.id}</h3>
                
                <div className="form-group">
                  <label>Question Text (English)</label>
                  <textarea
                    value={editForm.question.text_en || ''}
                    onChange={(e) => handleInputChange('question', e.target.value, 'en')}
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Question Text (Spanish)</label>
                  <textarea
                    value={editForm.question.text_es || ''}
                    onChange={(e) => handleInputChange('question', e.target.value, 'es')}
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Question Text (Russian)</label>
                  <textarea
                    value={editForm.question.text_ru || ''}
                    onChange={(e) => handleInputChange('question', e.target.value, 'ru')}
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files[0])}
                  />
                  {editForm.image && !imageFile && (
                    <div className="current-image">
                      Current: {editForm.image}
                    </div>
                  )}
                </div>

                <div className="answers-edit">
                  <h4>Answers</h4>
                  {editForm.answers.map((answer, idx) => (
                    <div key={answer.number} className="answer-edit">
                      <div className="answer-header">
                        <span className="answer-label">Answer {answer.number}</span>
                        <label className="checkbox-label">
                          <input
                            type="radio"
                            name="correct-answer"
                            checked={answer.is_correct}
                            onChange={() => handleAnswerCorrectChange(answer.number)}
                          />
                          Correct Answer
                        </label>
                      </div>
                      
                      <input
                        type="text"
                        placeholder="English"
                        value={answer.text_en || ''}
                        onChange={(e) => handleInputChange(`answer_${answer.number}`, e.target.value, 'en')}
                      />
                      <input
                        type="text"
                        placeholder="Spanish"
                        value={answer.text_es || ''}
                        onChange={(e) => handleInputChange(`answer_${answer.number}`, e.target.value, 'es')}
                      />
                      <input
                        type="text"
                        placeholder="Russian"
                        value={answer.text_ru || ''}
                        onChange={(e) => handleInputChange(`answer_${answer.number}`, e.target.value, 'ru')}
                      />
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Explanation</label>
                  <textarea
                    value={editForm.explanation || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, explanation: e.target.value }))}
                    rows="3"
                  />
                </div>

                <div className="form-actions">
                  <button className="btn btn-success" onClick={handleSaveEdit}>
                    Save Changes
                  </button>
                  <button className="btn btn-secondary" onClick={handleCancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="question-view">
                <div className="question-header-row">
                  <h3>Question #{question.id}</h3>
                  <div className="question-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => handleEdit(question)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(question.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                {question.image && (
                  <div className="question-image-small">
                    <img src={`/images/${question.image}`} alt={`Question ${question.id}`} />
                  </div>
                )}

                <div className="question-content">
                  <p><strong>EN:</strong> {question.question.text_en}</p>
                  {question.question.text_es && (
                    <p><strong>ES:</strong> {question.question.text_es}</p>
                  )}
                  {question.question.text_ru && (
                    <p><strong>RU:</strong> {question.question.text_ru}</p>
                  )}
                </div>

                <div className="answers-view">
                  {question.answers.map(answer => (
                    <div key={answer.number} className={`answer-row ${answer.is_correct ? 'correct' : ''}`}>
                      <span className="answer-num">{answer.number}.</span>
                      <span className="answer-content">
                        {answer.text_en}
                        {answer.is_correct && <span className="correct-badge">✓ Correct</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {question.explanation && (
                  <div className="explanation-view">
                    <strong>Explanation:</strong> {question.explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredQuestions.length === 0 && (
        <div className="card">
          <p className="no-results">No questions found matching your search.</p>
        </div>
      )}
    </div>
  )
}

export default Admin
