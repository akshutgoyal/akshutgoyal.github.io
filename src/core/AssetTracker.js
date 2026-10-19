/**
 * AssetTracker — honest loading progress.
 *
 * Every async thing the site needs (fonts, panel textures, event
 * listeners) registers here. The preloader reads `.progress`, and
 * `.done` resolves when everything has settled. Nothing ever
 * rejects: a failed asset still counts as done, so the site can't
 * be held hostage by a single 404.
 */
export class AssetTracker {
  constructor() {
    /** @type {{label:string, weights:boolean, done:boolean}[]} */
    this.items = []
    this.listeners = new Set()
    this._progress = 0
    this._settled = null
  }

  /** Register a promise. Returns the same promise, never rejected. */
  track(label, promise) {
    const item = { label, done: false }
    this.items.push(item)
    // A zero-weight item (e.g. "listen to first scroll") still counts,
    // but it can also be resolved manually with `resolve(label)`.
    item.handle = promise

    Promise.resolve(promise)
      .catch((err) => {
        if (import.meta.env?.DEV) console.warn(`[assets] "${label}" failed:`, err)
      })
      .finally(() => {
        item.done = true
        this._recompute()
      })

    this._recompute()
    return promise
  }

  /** Manually mark a label complete — for event-driven steps. */
  resolve(label) {
    this.items.filter((i) => i.label === label).forEach((i) => (i.done = true))
    this._recompute()
  }

  onChange(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get progress() {
    return this._progress
  }

  get done() {
    if (!this._settled) {
      this._settled = new Promise((resolve) => {
        const check = () => (this._progress >= 1 ? resolve() : setTimeout(check, 40))
        check()
      })
    }
    return this._settled
  }

  _recompute() {
    const total = this.items.length || 1
    const done = this.items.filter((i) => i.done).length
    const next = done / total
    if (next !== this._progress) {
      this._progress = next
      this.listeners.forEach((fn) => fn(next))
    }
  }
}
