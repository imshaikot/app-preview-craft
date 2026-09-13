// ffmpeg helpers: probe inputs, split screen recordings into frames, and
// encode rendered frames (piped, never written to disk) into the output.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

export function hasFfmpeg() {
  return spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0
}

export function requireFfmpeg() {
  if (!hasFfmpeg()) {
    throw new Error('ffmpeg not found. Install it (brew install ffmpeg / apt install ffmpeg) or set FFMPEG_PATH.')
  }
}

export const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|gif)$/i

export function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`)
  const info = JSON.parse(r.stdout)
  const v = info.streams.find((s) => s.codec_type === 'video')
  if (!v) throw new Error(`${file} has no video stream`)
  const [n, d] = (v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number)
  const rotation = Number(v.tags?.rotate ?? v.side_data_list?.find((s) => s.rotation != null)?.rotation ?? 0)
  const swap = Math.abs(rotation) % 180 === 90
  return {
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    duration: Number(info.format.duration ?? v.duration ?? 0),
    fps: d ? n / d : 30,
    hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
  }
}

function run(args, label) {
  return new Promise((ok, fail) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', fail)
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg ${label} failed (${code}): ${err.trim()}`))))
  })
}

/**
 * Split a recording into JPEG frames at `fps`, scaled to at most `maxHeight`.
 * `trim` = [start, end] seconds. Returns the frame count.
 */
export async function extractFrames(input, outDir, { fps = 30, maxHeight = 2400, trim, quality = 3 } = {}) {
  mkdirSync(outDir, { recursive: true })
  const args = []
  if (trim?.[0]) args.push('-ss', String(trim[0]))
  args.push('-i', input)
  if (trim?.[1]) args.push('-t', String(trim[1] - (trim[0] ?? 0)))
  args.push('-vf', `fps=${fps},scale=-2:'min(${maxHeight},ih)':flags=lanczos`, '-q:v', String(quality), '-an', join(outDir, '%05d.jpg'))
  await run(args, 'frame extraction')
  return readdirSync(outDir).filter((f) => f.endsWith('.jpg')).length
}

/** Poster frame for a recording (used for blurred backdrops). */
export async function posterFrame(input, out, at = 0.5) {
  await run(['-ss', String(at), '-i', input, '-frames:v', '1', '-q:v', '3', out], 'poster')
}

export const FORMATS = {
  mp4: { ext: 'mp4', alpha: false },
  hevc: { ext: 'mp4', alpha: false },
  mov: { ext: 'mov', alpha: true },
  webm: { ext: 'webm', alpha: true },
  gif: { ext: 'gif', alpha: false },
}

/**
 * Start an encoder fed with image frames on stdin.
 * format: mp4 | hevc | mov (ProRes 4444, alpha) | webm (VP9, alpha) | gif
 */
export function createEncoder({ out, fps, width, height, format = 'mp4', frameCodec = 'mjpeg', audio, silentAudio = false, metadata = {}, crf = 17, duration, gifWidth, gifFps }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', frameCodec, '-framerate', String(fps), '-i', '-']
  let audioIndex = null
  if (audio) {
    args.push('-i', audio)
    audioIndex = 1
  } else if (silentAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
    audioIndex = 1
  }
  args.push('-map', '0:v')
  if (audioIndex != null) args.push('-map', `${audioIndex}:a`)
  const even = `scale=trunc(iw/2)*2:trunc(ih/2)*2`
  switch (format) {
    case 'mov':
      args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0')
      break
    case 'webm':
      args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good')
      break
    case 'hevc':
      args.push('-vf', even, '-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-crf', String(crf + 3), '-preset', 'medium', '-tag:v', 'hvc1', '-movflags', '+faststart')
      break
    case 'gif':
      // GIFs balloon fast: cap at 480px wide and 15fps unless asked otherwise.
      args.push('-vf', `fps=${Math.min(fps, gifFps ?? 15)},scale='min(${gifWidth ?? 480},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=180:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0')
      break
    case 'mp4':
    default:
      args.push('-vf', even, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-preset', 'medium', '-profile:v', 'high', '-movflags', '+faststart', '-r', String(fps))
  }
  if (audioIndex != null && format !== 'gif') {
    const fadeStart = Math.max(0, (duration ?? 0) - 1)
    if (audio) args.push('-af', `afade=t=out:st=${fadeStart}:d=1`)
    args.push('-c:a', format === 'webm' ? 'libopus' : format === 'mov' ? 'pcm_s16le' : 'aac', '-b:a', '256k', '-shortest')
  }
  for (const [k, v] of Object.entries(metadata)) args.push('-metadata', `${k}=${v}`)
  args.push(out)

  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  let err = ''
  p.stderr.on('data', (d) => (err += d))
  const done = new Promise((ok, fail) => {
    p.on('error', fail)
    p.on('close', (code) => (code === 0 ? ok(out) : fail(new Error(`ffmpeg encode failed (${code}): ${err.trim()}\n  args: ${args.join(' ')}`))))
  })
  // Surface a dead encoder instead of writing into a closed pipe forever.
  p.stdin.on('error', () => {})
  return {
    write(buf) {
      if (p.exitCode != null) return Promise.reject(new Error(`ffmpeg exited early: ${err.trim()}`))
      return new Promise((ok) => (p.stdin.write(buf) ? ok() : p.stdin.once('drain', ok)))
    },
    async end() {
      p.stdin.end()
      return done
    },
    abort() {
      p.kill('SIGKILL')
    },
  }
}
