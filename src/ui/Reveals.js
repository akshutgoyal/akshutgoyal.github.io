import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * Reveals — the text choreography.
 *
 * Two primitives, used everywhere:
 *   [data-reveal="line"]  headlines that rise out of a mask, split per line
 *   [data-reveal="fade"]  blocks that lift 22px into place
 *
 * Nothing is built until `play()` is called, which App does the moment
 * the preloader hands over — so the first thing a visitor sees is the
 * hero masking up, not a page that already finished animating.
 *
 * SplitText's autoSplit + mask handles the annoying parts: re-splitting
 * after fonts land, and after a resize changes the line count.
 */
export class Reveals {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced
    this.splits = []
    this.played = false
  }

  play() {
    if (this.played) return
    this.played = true

    const lineEls = [...document.querySelectorAll('[data-reveal="line"]')]
    const fadeEls = [...document.querySelectorAll('[data-reveal="fade"]')]

    if (this.reduced) {
      gsap.set([...lineEls, ...fadeEls], { opacity: 1 })
      return
    }

    for (const el of fadeEls) {
      gsap.set(el, { opacity: 1 })
      gsap.set(el, { y: 26, autoAlpha: 0 })
      gsap.to(el, {
        y: 0,
        autoAlpha: 1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      })
    }

    for (const el of lineEls) {
      this.splits.push(
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          autoSplit: true,
          linesClass: 'rv-line',
          onSplit: (self) => {
            gsap.set(el, { opacity: 1 })
            gsap.set(self.lines, { yPercent: 118 })
            return gsap.to(self.lines, {
              yPercent: 0,
              duration: 1.15,
              ease: 'expo.out',
              stagger: 0.075,
              scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                toggleActions: 'play none none none',
              },
            })
          },
        })
      )
    }

    // Layout has changed (masks added, elements lifted) — re-measure.
    ScrollTrigger.refresh()
  }

  destroy() {
    this.splits.forEach((s) => s.revert())
    this.splits = []
  }
}
