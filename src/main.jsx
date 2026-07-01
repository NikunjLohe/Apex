import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { RanksProvider } from './contexts/RanksContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RanksProvider>
          <App />
        </RanksProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1A2235', color: '#F0F4FF', border: '0.5px solid rgba(201,152,10,0.4)' },
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
