# Caption UI Baseline & Refactor Evaluation Checklist

This document tracks UI evaluation for the Caption Dock across meeting layouts, resolutions, and user roles.

---

## 1. Visual Verification Matrix (Pre vs Post Refactor)

| Layout Mode | Resolution | Role | Caption Mode | Expected Video Tile State | Expected Caption Dock State |
|---|---|---|---|---|---|
| **Spotlight** | 1366 × 768 | `SIGNER` | Speech Lane (`isSttEnabled`) | Auto-fits within viewport, aspect-video maintained, **zero overlap** | Anchored below video stage, roll-up 2-4 lines, speaker color badge |
| **Spotlight** | 1920 × 1080 | `NON_SIGNER` | ASL Strip (`isAiEnabled`) | Center stage unobstructed, no floating overlay on chest/hands | `AI translation · beta`, sign chips, live sentence, previous sentence faded |
| **Sidebar** | 1366 × 768 | `SIGNER` | Speech Lane | Main tile & side participant stack adjust with `--dock-h`, no overflow scroll cutoff | Full-width dock, clear contrast, responsive font sizing |
| **Sidebar** | 1920 × 1080 | `NON_SIGNER` | ASL Strip | Unobstructed video tiles | Crisp gesture chips with dashed pending states |
| **Tiled (1-2)** | Any | Both | Any | Centered 16:9 tiles auto-scaled, `--dock-h` accounted for | Dock cleanly separated from meeting controls |
| **Tiled (3-4)** | Any | Both | Any | 2-row grid matrix scaled: `max-h-[calc(38vh_-_var(--dock-h,0px)_/_2)]` | Stable dock height |
| **Tiled (5-9)** | Any | Both | Any | 3-row grid matrix scaled: `max-h-[calc(36vh_-_var(--dock-h,0px)_/_3)]` | Video grid maintains visibility |

---

## 2. Interactive Feature Verification Checklist

- [ ] **Controller Toggles:**
  - `SIGNER` clicks `Captions` on `MeetingControlBar` -> Caption Dock mounts/unmounts cleanly, `--dock-h` updates smoothly.
  - `NON_SIGNER` clicks `SL` on `MeetingControlBar` -> Caption Dock mounts/unmounts cleanly, `--dock-h` updates smoothly.
- [ ] **Dynamic Dwell Timing:**
  - Short phrase (1-2 words): stays for ~3.5s.
  - Long sentence (>10 words): stays for ~7s - 9s.
- [ ] **Freeze on Hover:**
  - Hovering cursor over Caption Dock suspends all dismiss timers; captions stay readable until mouse leaves.
- [ ] **Settings Popover:**
  - Font size change (M / L / XL) updates immediately and persists across page reload.
  - Opacity slider (60% to 100%) adjusts background glass transparency.
  - Rows selector (2, 3, 4 lines) updates dock height and tile scaling.
- [ ] **Caption History Drawer:**
  - Shows chronological log of speech captions and ASL sentences.
  - `Download Transcript` button exports `.txt` file successfully.
  - Mutually exclusive with Chat and People drawers.
- [ ] **Accessibility:**
  - Pressing `Tab` focuses dock controls with high-contrast `#8AB4F8` focus ring (`[data-caption-ui] :focus-visible`).
  - Pressing `Esc` closes popover/drawer.
