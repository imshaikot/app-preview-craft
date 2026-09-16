# Changelog

## 0.1.0 — 2026-09-17

First release.

- Five categories: `app-store`, `social-card`, `screen-video`, `device-video`, `device-mockup`.
- 40 themes; the App Store set is modelled on popular app categories (fitness, finance,
  mindfulness, productivity, food, travel, music, games, photo, health data).
- 3D devices: iPhone 17 Pro, iPhone 17 Pro Max, iPhone 12 Pro, Galaxy S21 Ultra, MacBook Pro 16"
  (CC-BY-4.0, credited in every render that shows them).
- Screenshot treatments with sharp, screen recordings and video output with ffmpeg
  (MP4, HEVC, ProRes 4444 with alpha, VP9 with alpha, GIF).
- Every theme property overridable: `--set`, theme files with `extends`, `app-preview-craft.json`
  project configs with per-slide overrides and multi-job renders.
- Preview studio: live WebGL previews, drag-and-drop, inline copy editing, export, "Copy command".
- `doctor.mjs` environment check and a 25-check `selftest.mjs`.
