import { palette } from '../core/theme.js'

/**
 * site.config.js
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for anything the 3D world or the JS UI
 * needs to know about. Copy that lives only in index.html stays
 * there — this file carries the structured data (projects, stack,
 * sections) so the WebGL scene can never drift from the DOM.
 *
 * Edit here, and the corridor panels + marquee update together.
 */

export const nav = [
  { id: 'about', index: '01', label: 'About' },
  { id: 'work', index: '02', label: 'Work' },
  { id: 'playground', index: '03', label: 'Stack' },
  { id: 'contact', index: '04', label: 'Contact' },
]

/** Accent colour per project — used for the 3D panel + DOM hover. */
export const projects = [
  {
    id: 'roadsense',
    category: 'Featured / Civic tech + ML',
    summary: 'Detect street defects on-device, track recurring sites, and take fixes through a closure audit.',
    highlights: ['On-device detection + geotagging', 'Closure audits + recycler routing'],
    access: 'Public repository',
    index: '01',
    title: 'RoadSense',
    year: '2026',
    accent: palette.accent,
    stack: ['Flutter', 'YOLOv8', 'TensorFlow Lite', 'React', 'MapLibre', 'AWS'],
    kicker: 'Street defects with a site history',
    repo: 'github.com/akshutgoyal/ROADSENSE',
  },
  {
    id: 'apnarecord',
    category: 'Featured / Web3 + Healthcare',
    summary: 'Patient-owned medical records with wallet login, soulbound tokens and contract-enforced access.',
    highlights: ['Consent checked on every call', 'Records anyone can verify'],
    access: 'Public repository',
    index: '02',
    title: 'ApnaRecord',
    year: '2026',
    accent: '#5b7cff',
    stack: ['Solidity', 'OpenZeppelin', 'ethers.js', 'MetaMask', 'Base Sepolia', 'React', 'Express', 'R2'],
    kicker: 'Patient-owned medical records',
    repo: 'github.com/akshutgoyal/ApnaRecord',
  },
  {
    id: 'aethel-launcher',
    category: 'Linux / Desktop',
    summary: 'One cloud-gaming session engine, shared by a desktop app, web dashboard, CLI and Qt interface.',
    highlights: ['Four interfaces, one supervisor', 'No telemetry or licence keys'],
    access: 'Private build',
    index: '03',
    title: 'Aethel Launcher',
    year: '2026',
    accent: '#ff9a62',
    stack: ['Python', 'GTK4', 'FastAPI', 'PySide6', 'Playwright'],
    kicker: 'One engine, four front-ends',
    repo: 'private — Aethel suite',
  },
  {
    id: 'aethel-todo',
    category: 'Local-first / Productivity',
    summary: 'A local task daemon with recurring chores, shared state and rewards you redeem against yourself.',
    highlights: ['One task + recurrence engine', 'Points, streaks + personal rewards'],
    access: 'Private build',
    index: '04',
    title: 'Aethel Todo',
    year: '2026',
    accent: '#c58bff',
    stack: ['Bun', 'React PWA', 'Local-first'],
    kicker: 'A daemon owns the state',
    repo: 'private — Aethel suite',
  },
  {
    id: 'aethel-harness',
    category: 'AI / Developer tools',
    summary: 'A plugin-first agent harness built around one append-only session log and explicit permissions.',
    highlights: ['Permissions that fail closed', 'Public VMC injector + extension'],
    access: 'Public extension',
    index: '05',
    title: 'Aethel Harness',
    year: '2026',
    accent: '#6ee7ff',
    stack: ['TypeScript', 'Node', 'Append-only log', 'Plugins'],
    kicker: 'The log is the only truth',
    repo: 'github.com/akshutgoyal/aethel-vmc-injector',
  },

  // ── public repos from the profile timeline (github.com/akshutgoyal)
  //    Order here is corridor order: the suite first, then the public
  //    work, then the archive that closes the section.
  {
    id: 'keylogger',
    category: 'C / Linux systems',
    summary: 'A step-by-step Linux key-event reader, written in C as a learning exercise for DTU EHAX.',
    highlights: ['Linux input events in C', 'DTU EHAX learning exercise'],
    access: 'Public learning repo',
    index: '06',
    title: 'Keylogger',
    year: '2026',
    accent: '#ffd166',
    stack: ['C'],
    kicker: 'A Linux key-event reader',
    repo: 'github.com/akshutgoyal/Keylogger',
  },
  {
    id: 'earnpt-automation',
    category: 'Browser / Automation',
    summary: 'Playwright automation that connects to a signed-in Chrome profile through the DevTools Protocol.',
    highlights: ['Uses an existing browser session', 'Prompt flows across AI tabs'],
    access: 'Public repository',
    index: '07',
    title: 'Earnpt Automation',
    year: '2026',
    accent: '#ff8fb0',
    stack: ['JavaScript', 'Playwright', 'CDP'],
    kicker: 'Playwright on a signed-in profile',
    repo: 'github.com/akshutgoyal/Earnpt-Automation',
  },
  {
    id: 'ddos-tester',
    category: 'Async / Load testing',
    summary: 'An async load tester that increases concurrency gradually to reveal rate limits and breaking points.',
    highlights: ['Gradual concurrency ramp', 'Authorised testing only'],
    access: 'Public repository',
    index: '08',
    title: 'DDOS Tester',
    year: '2025',
    accent: '#ff6b6b',
    stack: ['Python', 'aiohttp'],
    kicker: 'Find the breaking point on purpose',
    repo: 'github.com/akshutgoyal/DDOS-Tester',
  },
]

/** Marquee words for the stack section. */
export const marquee = [
  'React', 'Vue', 'Node.js', 'Laravel', 'MySQL', 'Python',
  'AWS', 'Solidity', 'Flutter', 'Redis', 'C++', 'Playwright',
]

/** Preloader status lines, cycled while the world is being built. */
export const bootLines = [
  'allocating scene graph',
  'compiling shaders',
  'seeding particle field',
  'baking project panels',
  'mapping star positions',
  'raising the lights',
  'ready',
]

/** Camera framing for the intro dolly (played once, after the preloader). */
export const introPose = {
  offset: [0, 0.6, 26], // added to the hero station, removed over the intro
  fovBoost: 22,         // extra fov at the start of the intro
  duration: 2.3,
}
