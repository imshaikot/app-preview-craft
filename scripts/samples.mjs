#!/usr/bin/env node
// Render the bundled sample app ("Tempo", a fictional running app) used by
// the studio, the theme previews and the self-test.
//
//   node scripts/samples.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchBrowser } from './browser.mjs'
import { SKILL, startServer } from './server.mjs'
import { createEncoder, requireFfmpeg } from './video.mjs'

const OUT = join(SKILL, 'assets', 'samples')
mkdirSync(OUT, { recursive: true })
const srv = await startServer()
const browser = await launchBrowser()
const url = (s) => `${srv.origin}/assets/samples/src/tempo.html?s=${s}`

async function shot(s, file, { width = 402, height = 874, dpr = 3, fullPage = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: dpr })
  await page.goto(url(s), { waitUntil: 'load' })
  await page.waitForFunction('window.ready === true')
  await page.screenshot({ path: join(OUT, file), fullPage, type: 'png' })
  await page.close()
  console.log(`  ${file}`)
}

try {
  for (const n of [1, 2, 3, 4, 5]) await shot(n, `tempo-0${n}.png`)
  await shot('tall', 'tempo-journal-tall.png', { fullPage: true })
  await shot('desk', 'tempo-desktop.png', { width: 1512, height: 982, dpr: 2 })

  // A short screen recording, to exercise the video-input path.
  requireFfmpeg()
  const page = await browser.newPage()
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 2 })
  await page.goto(url('rec'), { waitUntil: 'load' })
  await page.waitForFunction('window.ready === true')
  const fps = 30
  const enc = createEncoder({ out: join(OUT, 'tempo-recording.mp4'), fps, width: 804, height: 1748, format: 'mp4', crf: 20 })
  for (let i = 0; i < fps * 3.5; i++) {
    await page.evaluate((t) => window.seek(t), i / fps)
    await enc.write(await page.screenshot({ type: 'jpeg', quality: 92, optimizeForSpeed: true }))
  }
  await enc.end()
  console.log('  tempo-recording.mp4')

  // The live analytics dashboard, for laptop displays in video themes.
  const dash = await browser.newPage()
  await dash.setViewport({ width: 1512, height: 982, deviceScaleFactor: 1.5 })
  await dash.goto(url('bi'), { waitUntil: 'load' })
  await dash.waitForFunction('window.ready === true')
  const wide = createEncoder({ out: join(OUT, 'tempo-dashboard.mp4'), fps, width: 2268, height: 1472, format: 'mp4', crf: 20 })
  for (let i = 0; i < fps * 10; i++) {
    await dash.evaluate((t) => window.seek(t), i / fps)
    await wide.write(await dash.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true }))
  }
  await wide.end()
  console.log('  tempo-dashboard.mp4')
} finally {
  await browser.close()
  await srv.close()
}
