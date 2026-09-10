#!/usr/bin/env node
// Prepare the 3D device models the stage renders.
//
//   node scripts/models.mjs [--from ~/Downloads/cc] [--max 2048]
//
// Reads the Sketchfab GLBs, re-encodes their textures as WebP (sharp), and
// compresses geometry with meshoptimizer (WASM, decoded in the browser by
// three.js). Material names are kept intact because the stage finds each
// screen by material name. Credits are read from every file's asset.extras,
// checked against the catalog, and written next to the models: CC-BY-4.0
// requires them.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { DEVICES, creditLine } from '../stage/catalog/devices.js'
import { SKILL } from './server.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const expand = (p) => resolve(p.replace(/^~(?=$|\/)/, homedir()))
const FROM = expand(opt('--from', '~/Downloads/cc'))
const MAX = Number(opt('--max', 2048))
const OUT = join(SKILL, 'assets', 'models')
const only = opt('--only', null)

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

mkdirSync(OUT, { recursive: true })
const credits = []
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`

for (const [id, dev] of Object.entries(DEVICES)) {
  if (only && only !== id) continue
  const src = join(FROM, dev.source)
  const dst = join(OUT, dev.file)
  if (!existsSync(src)) {
    if (existsSync(dst)) {
      console.log(`  keep  ${id}  (source missing, prepared model present)`)
      credits.push({ id, ...dev.credit })
      continue
    }
    console.error(`  miss  ${id}  ${src} not found`)
    process.exitCode = 1
    continue
  }

  const doc = await io.read(src)
  const extras = doc.getRoot().getAsset().extras ?? {}
  // The catalog credit must agree with what the file itself says.
  if (extras.author && !extras.author.startsWith(dev.credit.author)) {
    console.error(`  warn  ${id}: file says author "${extras.author}", catalog says "${dev.credit.author}"`)
  }
  if (extras.license && !extras.license.startsWith(dev.credit.license)) {
    console.error(`  warn  ${id}: file license "${extras.license}" differs from catalog "${dev.credit.license}"`)
  }

  const names = doc.getRoot().listMaterials().map((m) => m.getName())
  if (!names.includes(dev.screen.material)) {
    console.error(`  fail  ${id}: screen material "${dev.screen.material}" not in model`)
    process.exitCode = 1
    continue
  }

  await doc.transform(
    // Materials are not deduplicated: merging two identical materials would
    // rename one of them and lose the screen or a body finish.
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    prune({ keepAttributes: true, keepExtras: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [MAX, MAX], quality: 88 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  doc.getRoot().getAsset().extras = { ...extras, preparedBy: 'app-preview-craft/scripts/models.mjs' }
  await io.write(dst, doc)
  console.log(`  done  ${id.padEnd(18)} ${mb(statSync(src).size).padStart(8)} -> ${mb(statSync(dst).size)}`)
  credits.push({ id, ...dev.credit, fileExtras: extras })
}

writeFileSync(join(OUT, 'credits.json'), JSON.stringify(credits, null, 2) + '\n')
writeFileSync(
  join(SKILL, 'assets', 'CREDITS.md'),
  [
    '# 3D model credits',
    '',
    'The device models in `assets/models/` are licensed under Creative Commons Attribution 4.0',
    '(https://creativecommons.org/licenses/by/4.0/). They were re-encoded (WebP textures,',
    'meshopt geometry) but not otherwise modified. Any render that shows one of them must credit',
    'its author — the CLI writes a CREDITS.txt beside every such render and embeds the line in',
    'video metadata.',
    '',
    ...Object.values(DEVICES).map((d) => `- ${creditLine(d.credit)}`),
    '',
    'Apple, iPhone and MacBook are trademarks of Apple Inc.; Samsung and Galaxy are trademarks of',
    'Samsung Electronics. The models are fan-made likenesses and are not endorsed by either company.',
    '',
  ].join('\n'),
)
console.log(`  wrote assets/models/credits.json and assets/CREDITS.md`)
