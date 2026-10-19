import { STACKED_LAYOUT_QUERY } from '../core/device.js'
import { createProjectPanelTexture } from '../webgl/textures/projectPanelTexture.js'

/** Reuse the actual panel textures in normal document flow on small screens. */
export class ProjectPreviews {
  constructor({ projects, panels, onLayout }) {
    this.projects = projects
    this.panels = panels
    this.onLayout = onLayout
    this.hosts = [...document.querySelectorAll('.work__preview')]
    this.query = matchMedia(STACKED_LAYOUT_QUERY)
    this.query.addEventListener('change', () => this.refresh())
    this.refresh()
  }

  refresh() {
    const inFlow = this.query.matches || !this.panels
    this.panels?.setVisible(!inFlow)
    if (inFlow && !this.built) {
      this.hosts.forEach((host, index) => {
        const canvas = this.panels?.panels[index]?.uniforms.uMap.value.image
          || createProjectPanelTexture(this.projects[index], { dpr: 0.6 })
        host.append(canvas)
        host.dataset.ready = 'true'
      })
      this.built = true
    }
    this.onLayout?.()
  }
}
