import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import Callback from './pages/Callback'
import './assets/main.css'

import TitleBar from './components/TitleBar'

function App(): React.JSX.Element {
  return (
    <Router>
      <div className="flex flex-col h-screen overflow-hidden">
        <TitleBar />
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/callback" element={<Callback />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
