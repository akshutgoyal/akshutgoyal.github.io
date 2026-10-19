import { STACKED_LAYOUT_QUERY } from '../core/device.js'
import { projects } from '../config/site.config.js'

/** A keyboard-accessible picker keeps every project reachable without a long scroll. */
export class ProjectNavigator {
  constructor({ scrollManager }) {
    this.host = document.querySelector('.project-nav')
    this.gallery = document.querySelector('.work-gallery')
    this.rows = [...document.querySelectorAll('.work')]
    if (!this.host || !this.rows.length) return
    this.scroll = scrollManager
    this.picker = this.host.querySelector('.project-picker')
    this.trigger = this.host.querySelector('.project-picker__trigger')
    this.value = this.host.querySelector('.project-picker__value')
    this.menu = this.host.querySelector('.project-picker__menu')
    this.previous = this.host.querySelector('[data-project-previous]')
    this.next = this.host.querySelector('[data-project-next]')
    this.count = this.host.querySelector('.project-nav__count')
    this.active = -1
    this.open = false
    this.highlighted = 0
    this.titles = this.rows.map((row) => row.querySelector('h3').textContent.trim())
    this.options = this.rows.map((row, index) => {
      const project = projects.find((item) => `project-${item.id}` === row.id)
      const option = document.createElement('li')
      option.id = `project-option-${index}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', 'false')
      const number = document.createElement('span')
      number.className = 'project-picker__number'
      number.textContent = String(index + 1).padStart(2, '0')
      number.setAttribute('aria-hidden', 'true')
      const copy = document.createElement('span')
      copy.className = 'project-picker__copy'
      const name = document.createElement('span')
      name.className = 'project-picker__name'
      name.textContent = this.titles[index]
      const category = document.createElement('span')
      category.className = 'project-picker__category'
      category.textContent = project?.category || 'Selected project'
      copy.append(name, category)
      const check = document.createElement('span')
      check.className = 'project-picker__check'
      check.textContent = '✓'
      check.setAttribute('aria-hidden', 'true')
      option.append(number, copy, check)
      option.addEventListener('click', () => { this.close(); this.go(index) })
      option.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'touch') this.highlight(index, false)
      })
      this.menu.append(option)
      return option
    })
    this.trigger.addEventListener('click', () => this.open ? this.close() : this.show())
    this.trigger.addEventListener('keydown', (event) => this.onKey(event))
    // Options use aria-activedescendant; keep keyboard focus on the trigger
    // when clicking a row, without intercepting touch scrolling.
    this.menu.addEventListener('mousedown', (event) => event.preventDefault())
    this.picker.addEventListener('focusout', (event) => {
      if (!this.picker.contains(event.relatedTarget)) this.close()
    })
    document.addEventListener('pointerdown', (event) => {
      if (!this.picker.contains(event.target)) this.close()
    })
    this.previous.addEventListener('click', () => this.go(this.active - 1))
    this.next.addEventListener('click', () => this.go(this.active + 1))
    this.host.hidden = false
    this.setActive(0)
    let scheduled = false
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        this.read()
        if (this.open) this.positionMenu()
      })
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    this.read()
  }

  show() {
    this.open = true
    this.menu.hidden = false
    this.trigger.setAttribute('aria-expanded', 'true')
    this.positionMenu()
    this.highlight(this.active)
  }

  close() {
    this.open = false
    this.menu.hidden = true
    this.trigger.setAttribute('aria-expanded', 'false')
    this.trigger.removeAttribute('aria-activedescendant')
    this.search = ''
  }

  positionMenu() {
    const rect = this.host.getBoundingClientRect()
    const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68
    const below = window.innerHeight - rect.bottom - 16
    const above = rect.top - navHeight - 16
    const opensAbove = below < 240 && above > below
    this.picker.classList.toggle('is-above', opensAbove)
    this.menu.style.setProperty('--picker-height', `${Math.max(80, opensAbove ? above : below)}px`)
  }

  highlight(index, scroll = true) {
    this.highlighted = Math.max(0, Math.min(this.rows.length - 1, index))
    this.options.forEach((option, i) => option.classList.toggle('is-highlighted', i === this.highlighted))
    if (!this.open) return
    const option = this.options[this.highlighted]
    this.trigger.setAttribute('aria-activedescendant', option.id)
    if (scroll) {
      // Scroll only the menu, leaving the page and sticky navigator in place.
      const top = option.getBoundingClientRect().top - this.menu.getBoundingClientRect().top + this.menu.scrollTop - this.menu.clientTop
      if (top < this.menu.scrollTop) this.menu.scrollTop = top
      else if (top + option.offsetHeight > this.menu.scrollTop + this.menu.clientHeight) {
        this.menu.scrollTop = top + option.offsetHeight - this.menu.clientHeight
      }
    }
  }

  onKey(event) {
    const { key } = event
    if (key === 'Tab') { this.close(); return }
    if (key === 'Escape') {
      if (this.open) { event.preventDefault(); event.stopPropagation(); this.close() }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault()
      if (key === 'Enter' || key === ' ') {
        if (this.open) { const index = this.highlighted; this.close(); this.go(index) }
        else this.show()
      } else if (key === 'Home' || key === 'End') {
        if (!this.open) this.show()
        this.highlight(key === 'Home' ? 0 : this.rows.length - 1)
      } else if (!this.open) this.show()
      else this.highlight(this.highlighted + (key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      if (!this.open) this.show()
      clearTimeout(this.searchTimer)
      this.search = (this.search || '') + key.toLowerCase()
      const query = [...this.search].every((char) => char === this.search[0]) ? this.search[0] : this.search
      for (let step = 1; step <= this.rows.length; step++) {
        const index = (this.highlighted + step) % this.rows.length
        if (this.titles[index].toLowerCase().startsWith(query)) { this.highlight(index); break }
      }
      this.searchTimer = setTimeout(() => { this.search = '' }, 650)
    }
  }

  go(index, { immediate } = {}) {
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, index))]
    const stacked = matchMedia(STACKED_LAYOUT_QUERY).matches
    const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68
    const offset = stacked
      ? -navHeight - 8 - this.host.offsetHeight - 20
      : (row.offsetHeight - window.innerHeight) / 2
    // Lenis also applies CSS scroll-margin; compensate so the panel lands
    // at the requested position rather than adding the header space twice.
    const scrollMargin = parseFloat(getComputedStyle(row).scrollMarginTop) || 0
    this.scroll.scrollTo(row, { offset: offset + scrollMargin, immediate })
    history.replaceState(null, '', `#${row.id}`)
    this.setActive(this.rows.indexOf(row))
  }

  read() {
    const midpoint = window.innerHeight * 0.5
    let closest = 0
    let distance = Infinity
    this.rows.forEach((row, i) => {
      const rect = row.getBoundingClientRect()
      const score = Math.abs(rect.top + Math.min(rect.height, window.innerHeight) / 2 - midpoint)
      if (score < distance) { distance = score; closest = i }
    })
    this.setActive(closest)
  }

  setActive(index) {
    if (this.active === index) return
    this.active = index
    this.value.textContent = this.titles[index]
    this.options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)))
    this.previous.disabled = index === 0
    this.next.disabled = index === this.rows.length - 1
    this.count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.rows.length).padStart(2, '0')}`
    this.rows.forEach((row, i) => row.classList.toggle('is-current', i === index))
  }
}
