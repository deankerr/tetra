import { RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

import { getRouter } from './router'

// The Vite SPA entrypoint owns the browser router instance.
const router = getRouter()
const rootElement = document.querySelector('#app')

// Vite serves a fresh root element, so missing markup means the app shell cannot boot.
if (rootElement === null) {
  throw new Error('Missing #app root element')
}

// React owns everything inside the static HTML root after Vite loads this module.
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<RouterProvider router={router} />)
}
