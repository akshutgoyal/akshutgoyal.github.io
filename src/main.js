import './styles/main.css'
import { App } from './core/App.js'

/**
 * Entry point. Any failure past this line still has to leave a usable
 * page behind — the DOM content is complete without JavaScript, and
 * the watchdog in index.html will lift the preloader if we never boot.
 */
window.__portfolioBooted = true

const app = new App()

app.init().catch((err) => {
  console.error('[portfolio] boot failed', err)
  document.documentElement.classList.remove('is-loading')
  document.documentElement.classList.add('preloader-done', 'is-ready')
})

// Handy in dev: `portfolio.scroll.progress` etc.
if (import.meta.env?.DEV) window.portfolio = app
