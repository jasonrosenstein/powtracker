import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { PlanProvider } from './components/Plan.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlanProvider>
      <App />
    </PlanProvider>
  </StrictMode>,
)
