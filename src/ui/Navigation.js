/**
 * Navigation — in-page links routed through Lenis so the smooth
 * scroll and the browser's own history both behave.
 */
export class Navigation {
  constructor({ scrollManager }) {
    this.scrollManager = scrollManager
    this.links = [...document.querySelectorAll('[data-scroll-to]')]
    this.navLinks = [...document.querySelectorAll('.nav__links a')]

    const topButton = document.querySelector('.scroll-top')
    const footer = document.querySelector('.footer')
    const progressRing = topButton?.querySelector('.scroll-top__progress')
    const progressPct = topButton?.querySelector('.scroll-top__pct')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (topButton && progressRing) {
      let readTimer = null
      const updateProgress = () => {
        const footerOverlap = footer ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top) : 0
        const { scroll, limit } = scrollManager.lenis
        const progress = limit > 0 ? Math.min(1, Math.max(0, scroll / limit)) : 0
        progressRing.style.strokeDashoffset = String(100 * (1 - progress))
        if (progressPct) {
          const text = String(Math.round(progress * 100)).padStart(2, '0')
          if (progressPct.textContent !== text) progressPct.textContent = text
        }
        // Keep the floating control above the footer without adding empty
        // space to the footer itself, including when its rows wrap on mobile.
        topButton.style.setProperty('--scroll-top-lift', `${footerOverlap}px`)
      }
      // While the page is moving the arrow steps aside and the ring reads
      // out the number; the arrow returns once the scroll goes quiet.
      const markReading = () => {
        topButton.classList.add('is-reading')
        clearTimeout(readTimer)
        readTimer = setTimeout(() => topButton.classList.remove('is-reading'), 700)
      }
      scrollManager.lenis.on('scroll', () => {
        updateProgress()
        markReading()
      })
      window.addEventListener('resize', updateProgress, { passive: true })
      if (footer) new ResizeObserver(updateProgress).observe(footer)
      updateProgress()
    }

    let dashTimer = null
    this.links.forEach((link) => {
      link.addEventListener('click', (e) => {
        const target = link.dataset.scrollTo
        if (!target) return
        e.preventDefault()
        // The top button dashes on the way out: arrow out the top, back in
        // from below, ring flash.
        if (topButton && link === topButton && !reducedMotion.matches) {
          topButton.classList.remove('is-dashing')
          void topButton.offsetWidth // restart the animation on a repeat click
          topButton.classList.add('is-dashing')
          clearTimeout(dashTimer)
          dashTimer = setTimeout(() => topButton.classList.remove('is-dashing'), 600)
        }
        scrollManager.scrollToSection(target)
        history.replaceState(null, '', target)
      })
    })

    scrollManager.onSectionChange((id) => this.setActive(id))
  }

  /** Restore after the preloader releases the scroll lock. */
  restoreHash() {
    if (!location.hash) return
    let id
    try { id = decodeURIComponent(location.hash.slice(1)) } catch { return }
    const target = document.getElementById(id)
    if (!target) return
    this.scrollManager.scrollToSection(target, { immediate: true })
  }

  setActive(id) {
    this.navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.scrollTo === `#${id}`)
    })
  }
}
