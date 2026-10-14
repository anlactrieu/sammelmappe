import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import '@fontsource/big-shoulders-display/latin-700'
import '@fontsource/big-shoulders-display/latin-800'
import '@fontsource/big-shoulders-display/latin-900'
import '@fontsource/jetbrains-mono/latin-400'
import '@fontsource/jetbrains-mono/latin-600'
import '@fontsource/jetbrains-mono/latin-700'
import '@fontsource/schibsted-grotesk/latin-400'
import '@fontsource/schibsted-grotesk/latin-500'
import '@fontsource/schibsted-grotesk/latin-700'
import '@fontsource/schibsted-grotesk/latin-800'
import './styles.css'

registerSW({ immediate: true })
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
