#!/usr/bin/env node
// Check everything a render needs, and say how to fix what is missing.
//
//   node scripts/doctor.mjs [--fix]     --fix runs `npm install` in the skill
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL = fileURLToPath(new URL('..', import.meta.url))
const fix = process.argv.includes('--fix')
let failed = 0
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m, hint) => {
  failed++
  console.log(`  ✗ ${m}${hint ? `\n      → ${hint}` : ''}`)
}
const warn = (m, hint) => console.log(`  ! ${m}${hint ? `\n      → ${hint}` : ''}`)

const [major] = process.versions.node.split('.').map(Number)
major >= 20 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node} is too old`, 'install Node 20 or newer')

const deps = ['puppeteer-core', 'sharp', 'three', '@gltf-transform/core', 'meshoptimizer', '@fontsource-variable/inter']
let missing = deps.filter((d) => !existsSync(join(SKILL, 'node_modules', d)))
if (missing.length && fix) {
  console.log(`  … npm install in ${SKILL}`)
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: SKILL, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status === 0) missing = deps.filter((d) => !existsSync(join(SKILL, 'node_modules', d)))
}
missing.length ? bad(`npm packages missing: ${missing.join(', ')}`, `cd "${SKILL}" && npm install   (or run doctor with --fix)`) : ok('npm packages installed')

const models = join(SKILL, 'assets', 'models')
const glbs = existsSync(models) ? readdirSync(models).filter((f) => f.endsWith('.glb')) : []
glbs.length >= 5 ? ok(`${glbs.length} device models (${glbs.join(', ')})`) : bad('3D device models missing', 'node scripts/models.mjs --from <folder with the Sketchfab GLBs>')
existsSync(join(models, 'credits.json')) ? ok('model credits present (CC-BY-4.0)') : bad('assets/models/credits.json missing', 'node scripts/models.mjs')

const ff = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
if (ff.status === 0) {
  const want = ['libx264', 'libx265', 'prores_ks', 'libvpx-vp9', 'gif']
  const have = want.filter((e) => ff.stdout.includes(` ${e} `))
  ok(`ffmpeg (${have.join(', ')})`)
  const lacking = want.filter((e) => !have.includes(e))
  if (lacking.length) warn(`ffmpeg lacks ${lacking.join(', ')} — those video formats will fail`)
} else warn('ffmpeg not found — stills work, videos and screen recordings do not', 'brew install ffmpeg  ·  apt install ffmpeg  ·  or set FFMPEG_PATH')

if (!missing.includes('puppeteer-core')) {
  const { findChrome, launchBrowser } = await import('./browser.mjs')
  try {
    const chrome = findChrome()
    ok(`browser: ${chrome}`)
    const browser = await launchBrowser()
    try {
      const page = await browser.newPage()
      const gl = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2')
        if (!c) return null
        const ext = c.getExtension('WEBGL_debug_renderer_info')
        return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)
      })
      if (!gl) bad('headless Chrome has no WebGL2', 'update Chrome, or set CHROME_PATH to a newer Chromium')
      else if (/swiftshader/i.test(gl)) warn(`WebGL2 via software (${gl}) — 3D works but renders slowly`)
      else ok(`WebGL2: ${gl}`)
    } finally {
      await browser.close()
    }
  } catch (err) {
    bad(String(err.message ?? err).split('\n')[0], 'install Chrome/Chromium/Edge, or set CHROME_PATH')
  }
}

console.log(failed ? `\n${failed} problem(s).` : '\nReady.')
process.exitCode = failed ? 1 : 0
