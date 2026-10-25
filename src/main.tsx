import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preserveLegacyAssessment } from './services/health/legacyMigration'

// Copy any pre-Project-II assessment aside BEFORE the app rewrites the draft
// (see legacyMigration.ts). Copy only - nothing is deleted.
preserveLegacyAssessment()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
