// Headless Chrome with a working WebGL context, via puppeteer-core and the
// Chrome already installed on the machine. No browser download.
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import puppeteer from 'puppeteer-core'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const PATH_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']

const runnable = (p) => {
  try {
    accessSync(p, constants.X_OK)
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function findChrome() {
  const explicit = process.env.CHROME_PATH
  if (explicit) {
    if (runnable(explicit)) return explicit
    throw new Error(`CHROME_PATH=${explicit} is not an executable file.`)
  }
  const found =
    CANDIDATES.find(runnable) ??
    (process.env.PATH || '')
      .split(delimiter)
      .flatMap((d) => PATH_NAMES.map((n) => join(d, n)))
      .find(runnable)
  if (!found) {
    throw new Error(
      'No Chromium-based browser found. Install Chrome/Chromium/Edge or set CHROME_PATH.\n' +
        '  Without root: npx @puppeteer/browsers install chrome@stable',
    )
  }
  return found
}

// GPU first: on macOS, ANGLE over Metal renders three.js scenes an order of
// magnitude faster than SwiftShader. SwiftShader stays enabled as the fallback
// so a machine without a usable GPU still renders, just slower.
const GL_ARGS = {
  darwin: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  linux: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  win32: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
}

export async function launchBrowser({ headless = true } = {}) {
  const args = [
    ...(GL_ARGS[process.platform] ?? GL_ARGS.linux),
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--font-render-hinting=none',
  ]
  return puppeteer.launch({
    executablePath: findChrome(),
    headless,
    args,
    defaultViewport: null,
    protocolTimeout: 600_000,
  })
}

/** Open a page and surface its console errors and crashes on stderr. */
export async function openPage(browser, { width, height, verbose = false }) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error') errors.push(new Error(msg.text()))
    if (verbose || type === 'error' || type === 'warn') {
      const text = msg.text()
      // three.js deprecation chatter is noise for the user
      if (!/^THREE\.WebGLRenderer: |Deprecated/.test(text)) console.error(`  [page ${type}] ${text}`)
    }
  })
  page.errors = errors
  return page
}
