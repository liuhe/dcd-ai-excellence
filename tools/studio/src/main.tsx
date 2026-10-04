import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MDModalProvider } from './components/MDModal'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MDModalProvider>
      <App />
    </MDModalProvider>
  </StrictMode>,
)
