# SL-Meet — Hướng dẫn refactor UI phụ đề (Caption UI)

> Tài liệu dành cho coding agent (Claude Code / Cursor / Copilot Agent...). Đọc hết mục 0–4 trước khi sửa file nào. Làm theo từng Phase, mỗi Phase một commit riêng, chỉ sang Phase sau khi đạt "Tiêu chí hoàn thành" của Phase trước. Khi gặp quyết định sản phẩm chưa rõ, **hỏi người dùng** (xem mục 12), không tự quyết.

---

## 0. Bối cảnh & mục tiêu

SL-Meet là ứng dụng họp trực tuyến Electron + React 18 + Vite + Tailwind + lucide-react (WebRTC P2P, Socket.io). Có hai vai trò (`client/src/constants/roles.js`):

| Vai trò | Ý nghĩa | Cần đọc gì |
|---|---|---|
| `SIGNER` | Người khiếm thính/nghe kém, giao tiếp bằng ngôn ngữ ký hiệu | **Speech-to-text caption** (giọng nói của người khác) |
| `NON_SIGNER` | Người nghe được, nói bằng mic | **Bản dịch ngôn ngữ ký hiệu** (AI translation) của signer |

**Vấn đề của UI hiện tại:**
1. Cả hai loại caption dùng chung một viên pill nổi (`AslSubtitleOverlay`) chồng lên đáy tile video, chỉ khác dòng tiêu đề `LIVE CAPTION` / `TRANSLATION`.
2. Overlay che vùng ngực/tay/khuôn mặt của người ký — đúng thông tin mà ASL và đọc môi cần.
3. Speech caption chỉ giữ **một** caption mới nhất mỗi người gửi và tự biến mất sau cố định 5 giây (`ageMs < 5000`); người đọc chậm bị lỡ chữ, không có chỗ xem lại.
4. Trong lưới nhiều tile, chữ nằm trong từng tile rất nhỏ và phân tán.
5. Bản dịch ký hiệu chỉ hiện một chuỗi `currentSentence` rồi biến mất ~3 giây sau khi người ký ngừng; không thể hiện trạng thái "máy đang ghép từng ký hiệu".
6. Không có người dùng-tùy-chỉnh (cỡ chữ, độ mờ nền, vị trí), không có trạng thái "đang có tiếng nhưng chưa ra chữ".

**Mục tiêu:** thay bằng một **Caption Dock** cố định bên dưới vùng video, thiết kế riêng cho từng vai trò, không che khuôn mặt/tay, có thể tùy chỉnh, và dễ đọc.

**Hình dung đích (tham khảo):**
- Signer: dải roll-up 2–4 dòng, mỗi dòng có `[icon mic] Tên người nói` (màu theo người) + chữ lớn; câu final màu trắng đặc, câu interim mờ/nghiêng; footer nhỏ có trạng thái + nút cỡ chữ / lịch sử / cài đặt.
- Non-signer: header `[icon hand] AI translation · beta`, hàng chip ký hiệu nhận diện được (chip cuối viền đứt = đang chờ), bên dưới là câu đã ghép; câu vừa chốt xếp ngay phía trên, mờ hơn.

**Không nằm trong phạm vi (non-goals):**
- Không sửa thuật toán nhận dạng ký hiệu / MediaPipe (`useMediaPipe`, `useHandTrackingWorker`, `gestureClassifier`, `aslTranslator`...). Riêng `useAslAggregator` chỉ được **thêm** state để phản chiếu token (Phase 3), không đổi logic phát hiện.
- Không đổi pipeline STT (đã có tài liệu `SL-Meet_STT_Refactor_Guide.md`) — nhưng UI phải tương thích với cả trước và sau refactor đó.
- Không đổi giao thức socket / `server/server.js` trong Phase 1–4.
- Không thêm thư viện UI mới (chỉ Tailwind + lucide-react).

---

## 1. Hiện trạng (đã xác minh từ source)

### Các file liên quan
| File | Vai trò hiện tại |
|---|---|
| `client/src/components/RoomView.jsx` | Giữ toàn bộ state; gọi `useSpeechToText`, `useAslAggregator`, `useSocket`; render `MeetingLayoutEngine`, các drawer, `MeetingControlBar` |
| `client/src/components/room/MeetingLayoutEngine.jsx` | 3 layout: `spotlight`, `sidebar`, `tiled`. Hàm `getTileCaptionData(p)` quyết định caption cho từng tile |
| `client/src/components/room/MeetingVideoTile.jsx` | Render tile; cuối file render `AslSubtitleOverlay` từ prop `captionData` |
| `client/src/components/room/AslSubtitleOverlay.jsx` | Pill `absolute bottom-8 left-1/2`, `bg-black/80`, chữ `text-base md:text-lg lg:text-xl` |
| `client/src/hooks/useAslAggregator.js` | Trả về `{ currentSentence, transcriptLogs, pushGesture, clearTranscript, notifyHandReset }`. Buffer token là `bufferRef` nội bộ, **không** được expose |
| `client/src/hooks/useSocket.js` | `speechCaptions` (map `senderId → {text,isFinal,senderName,timestamp}`, chỉ giữ cái mới nhất), `sendSpeechCaption`, `remoteGestures` |
| `client/src/components/room/MeetingControlBar.jsx` | Nút STT "Captions" (chỉ hiện với `SIGNER`), nhận `sttStatus` |
| `client/src/components/room/MeetingChatDrawer.jsx`, `MeetingParticipantsDrawer.jsx` | Drawer trượt phải, theme Google Meet dark; Chat và People loại trừ lẫn nhau |
| `client/src/utils/exportTranscript.js` | Xuất transcript từ `transcriptLogs` + `speechLogs` + chat |
| `client/src/index.css` | Có CSS global **xóa mọi outline/box-shadow khi focus** (xem 1.2) |
| `client/tailwind.config.js` | Chỉ có `brand`, `dark`, font Inter; chưa có token caption |

### 1.1 Luồng dữ liệu caption (quan trọng)
- **Speech caption (cho signer):** `useSpeechToText({ stream, enabled, onCaption })` chạy **trên máy signer**; `onCaption` trong `RoomView` ghi vào `localSpeechCaptions[speakerId]` (kèm `senderName`, `timestamp`, `isFinal`). `combinedSpeechCaptions = {...speechCaptions, ...localSpeechCaptions}` được truyền xuống layout engine. Câu final còn được đẩy vào `speechLogs` (dùng cho export). Việc gán `speakerId/speakerName` hiện là **suy đoán** (`activeSpeakerPeer`). `sendSpeechCaption` đã có trong `useSocket` nhưng RoomView hiện **không gọi**.
- **ASL translation:** cử chỉ cục bộ (`handleGestureDetected`) và cử chỉ từ xa (`remoteGestures`) đều được `pushGesture` vào **cùng một** aggregator; `currentSentence` là chuỗi hiển thị, tự xóa ~`silenceTimeoutMs + 400ms` sau khi ngừng. `transcriptLogs` có các mục `{ id, timestamp, time, sender, type: 'ASL', text }` khi câu được chốt.
- **Ai thấy gì hiện nay:** `isAiEnabled` (mặc định `true`, nút "SL Subtitles") bật bản dịch cho mọi vai trò; nó hiện trên tile của `activeSignerId`. Nút STT chỉ có ở `SIGNER`. `ROLE_META[role].receivesSpeechCaptions` là `true` cho signer, `false` cho non-signer.
- **Cleanup nên làm:** `const [subtitleText, setSubtitleText] = useState('AI Subtitle Standby')` trong `RoomView` là state chết (không dùng). Trong `MeetingVideoTile`, nhánh `isAiEnabled && subtitleText ? <AslSubtitleOverlay …/>` cũng chết vì layout engine không truyền hai prop này.

### 1.2 Các bẫy kỹ thuật phải xử lý
1. **Chiều cao tile dùng `vh` cố định.** Layout engine đặt `max-h-[75vh]`, `65vh`, `38vh`, `36vh`, `80vh` (sidebar). Khi thêm Dock giữa `<main>` và `<MeetingControlBar>`, `<main>` (flex-1, `overflow-hidden`) bị thấp đi và tile có thể bị **cắt**. Phải trừ chiều cao Dock (mục 6, Phase 1).
2. **CSS global xóa focus outline** (`*:focus-visible { outline:none !important; box-shadow:none !important }`) → bàn phím không thấy focus. Control mới trong Dock phải có chỉ báo focus riêng bằng selector đủ đặc hiệu (mục 8).
3. **Aggregator dùng chung** cho cử chỉ cục bộ lẫn từ xa → `currentSentence` có thể trộn. Đây là hạn chế đã biết, **không sửa** ở đây; chỉ ghi chú trong báo cáo cuối.
4. `RoomView` re-render rất thường xuyên; Dock phải `React.memo` và nhận props ổn định.
5. Ứng dụng chạy trong Electron 29 (Chromium ≥ 122): `Array.prototype.findLastIndex`, `ResizeObserver`, `mask-image`, `localStorage` đều dùng được.

---

## 2. Ràng buộc bắt buộc

- Giữ nguyên **chữ ký export** của `AslSubtitleOverlay` (`{ subtitleText, title }`) — vẫn được dùng cho chế độ placement `overlay`.
- Giữ nguyên props hiện có của `MeetingControlBar`; chỉ được **thêm** prop tùy chọn.
- Giữ nguyên hợp đồng của `useSpeechToText` và `useSocket`; chỉ **đọc** `speechCaptions`.
- Không phá `exportTranscript.js` và nguồn `speechLogs` / `transcriptLogs`.
- Giữ bảng màu hiện có: nền `#202124`, `#28292C`, `#3C4043`, accent `#8AB4F8`, đỏ `#EA4335`, nền app `#121212`. Màu bổ sung chỉ dùng cho caption (mục 5.2).
- Chuỗi UI bằng **tiếng Anh** (đồng bộ app hiện tại: "Captions ON", "Turn ON SL Subtitles"...). Tài liệu này viết tiếng Việt.
- Không dùng thư viện mới; không dùng `backdrop-blur` nặng trên Dock (tốn GPU khi video chạy).
- Không đổi hành vi ở vai trò/tính năng không liên quan (chat, người tham gia, share screen, pin, layout).

---

## 3. Quy tắc hiển thị theo vai trò (policy)

| Điều kiện | Dock hiển thị gì |
|---|---|
| `SIGNER` và `isSttEnabled` | **Speech lane** (roll-up). Nếu `isHandTrackingEnabled` thì thêm **ASL self-preview** thu gọn bên dưới |
| `SIGNER` và STT tắt, hand tracking bật | Chỉ ASL self-preview thu gọn |
| `NON_SIGNER` và `isAiEnabled` | **ASL strip** (chips + câu) |
| `NON_SIGNER` và `isAiEnabled` tắt | Không render Dock |
| Còn lại | Không render Dock (và `--dock-h` = 0) |

Ghi chú: signer **không** còn thấy bản dịch của signer khác (không cần đọc ký hiệu qua chữ). Đây là quyết định sản phẩm cần xác nhận — xem mục 12 — nhưng cứ cài theo bảng và để cờ `SHOW_REMOTE_TRANSLATION_FOR_SIGNER = false` trong `captionConfig.js` để đổi dễ.

Khi Dock hiển thị, `placement === 'dock'` (mặc định) → tile **không** vẽ overlay caption. Khi người dùng chọn `placement === 'overlay'` → giữ hành vi cũ (overlay trên tile) và không render Dock.

---

## 4. Việc cần làm trước khi sửa (Phase 0)

1. Đọc đầy đủ các file ở bảng mục 1, cùng `client/package.json` (xem có test runner nào không), `client/vite.config.js`.
2. Chụp **ảnh baseline** màn hình hiện tại (lưu `docs/caption-ui/before/`): 3 layout (`tiled`, `sidebar`, `spotlight`) × 2 cỡ cửa sổ (1366×768, 1920×1080) × 2 vai trò. Nếu không tự chạy được app, tạo thư mục + checklist trống và nhờ người dùng chụp — **không bịa ảnh/số liệu**.
3. Tạo `client/src/config/captionConfig.js`:

```js
export const CAPTION_CONFIG = {
  SHOW_REMOTE_TRANSLATION_FOR_SIGNER: false,
  MAX_ENTRIES: 6,            // số dòng speech giữ trong bộ đệm
  DWELL_MIN_MS: 3500,
  DWELL_MAX_MS: 12000,
  DWELL_BASE_MS: 2500,
  DWELL_PER_WORD_MS: 450,
  INTERIM_TTL_MS: 8000,
  SIZES_PX: { m: 20, l: 24, xl: 28 },
  SPEAKER_COLORS: ['#8AB4F8', '#81C995', '#FDD663', '#F28B82', '#C58AF9'],
  ASL_ACCENT: '#C58AF9',
  PREFS_KEY: 'slmeet.captionPrefs.v1',
};
```

**Tiêu chí hoàn thành Phase 0:** có `captionConfig.js`, có thư mục baseline (ảnh thật hoặc checklist trống), chưa đổi hành vi.

---

## 5. Đặc tả thiết kế

### 5.1 Cấu trúc Dock

```
CaptionDock                      (fixed-height lane, shrink-0, nằm giữa <main> và <MeetingControlBar>)
├─ SpeechLane                    (signer)  roll-up N dòng, anchor đáy, mask mờ phía trên
│   └─ SpeechLine × n            [mic] Tên  ·  Chữ
├─ AslStrip                      (non-signer; hoặc self-preview của signer, thu gọn)
│   ├─ PrevSentence              câu vừa chốt (mờ)
│   ├─ SignChips                 chip ký hiệu đang gom (chip cuối đứt nét = chờ)
│   └─ LiveSentence              câu đang ghép
└─ DockFooter                    trạng thái (trái) · nút Aa / History / Settings (phải)
```

### 5.2 Token thiết kế
| Thành phần | Giá trị |
|---|---|
| Container | `w-full max-w-4xl mx-auto shrink-0 rounded-xl border border-white/10 px-4 py-3 mb-1.5`; nền `rgba(0,0,0,opacity)` với `opacity` mặc định `0.85` (cho phép 0.6–1.0) |
| Cỡ chữ caption | `m=20px`, `l=24px` (mặc định), `xl=28px`; `line-height: 1.4`; `font-weight: 500` |
| Số hàng cố định | mặc định 3 (speech), 2 (ASL); người dùng chọn 2–4 |
| Chiều cao lane | `calc(var(--caption-fs) * 1.4 * rows)` — **cố định**, không nhảy khi chữ xuất hiện/biến mất |
| Chữ final | `#FFFFFF` |
| Chữ interim | `text-slate-400 italic` |
| Tên người nói | 13px, semibold, màu theo người (băm `senderId` vào `SPEAKER_COLORS`); luôn kèm icon `Mic` 14px và **tên** — màu chỉ là lớp phụ |
| ASL header | icon `Hand` 14px + `AI translation · beta`, màu `ASL_ACCENT`, 12px |
| Chip ký hiệu | 14px semibold `px-2 py-0.5 rounded-md bg-[#3C4043] text-slate-100`; chip chờ: `border border-dashed border-slate-500 text-slate-400 bg-transparent` |
| Footer | 12px, `text-slate-400`; icon 16px |
| Chuyển động | entry mới trượt lên + fade 150ms; `motion-reduce:transition-none` |
| Tương phản | chữ/nền tối thiểu 4.5:1, mục tiêu 7:1 (kiểm tra với nền Dock mờ nhất cho phép) |

### 5.3 Quy tắc đọc
- Mỗi dòng speech tối đa ~2 dòng hiển thị (wrap tự nhiên), neo đáy, dòng cũ bị đẩy lên và mờ dần (CSS `mask-image: linear-gradient(to bottom, transparent, #000 35%)`).
- **Thời gian lưu theo độ dài câu**, không cố định: `dwell = clamp(BASE + words × PER_WORD, MIN, MAX)` cho câu final; interim giữ tối đa `INTERIM_TTL_MS` hoặc đến khi bị thay.
- **Đóng băng khi hover/focus** vào Dock: dừng đếm hết hạn; rời chuột thì reset lại thời gian lưu cho các dòng đang hiển thị.
- Trạng thái trống:
  - Có người đang nói (`isSpeaking`) nhưng chưa có chữ → hiện `Listening…` kèm ba chấm động (tên người nếu biết).
  - STT `loading` → `Loading speech model… NN%` (dùng `sttProgress`); `error` → `Captions unavailable`.
  - ASL chưa thấy tay → `Waiting for signing…` (thay cho `....` hiện tại).

---

## 6. Phase 1 — Khung Dock + tích hợp layout + tùy chọn lưu trữ

### 6.1 Prefs (localStorage)
`client/src/hooks/useCaptionPrefs.js`:

```js
import { useCallback, useState } from 'react';
import { CAPTION_CONFIG } from '../config/captionConfig';

const DEFAULTS = { size: 'l', opacity: 0.85, placement: 'dock', rows: 3, showNames: true };

function load() {
  try {
    const raw = localStorage.getItem(CAPTION_CONFIG.PREFS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

export function useCaptionPrefs() {
  const [prefs, setPrefsState] = useState(load);
  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(CAPTION_CONFIG.PREFS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [prefs, setPrefs];
}
```
Kiểm tra giá trị hợp lệ khi load (size ∈ {m,l,xl}, rows ∈ 2..4, opacity ∈ [0.6,1]); giá trị lạ thì rơi về mặc định.

### 6.2 Component khung
Tạo `client/src/components/room/captions/`:
- `CaptionDock.jsx` (chính, `React.memo`)
- `SpeechLane.jsx`, `AslStrip.jsx`, `DockFooter.jsx` (tạm để placeholder ở Phase 1)
- `captionUtils.js` (hàm thuần, xem 7.1)

`CaptionDock` phải:
1. Quyết định có render hay không theo bảng mục 3 (nhận `role`, `isSttEnabled`, `isAiEnabled`, `isHandTrackingEnabled`, `prefs`); không render nếu `prefs.placement !== 'dock'`.
2. Đo chiều cao bằng `ResizeObserver` và ghi CSS variable `--dock-h` (px, gồm cả margin) lên `document.documentElement`; **reset về `0px` khi unmount hoặc không render**.
3. Có `data-caption-ui` ở root để áp CSS focus (mục 8).

### 6.3 Tích hợp `RoomView.jsx`
Đặt Dock giữa `</main>` và `<MeetingControlBar>`:

```jsx
<CaptionDock
  role={userRole}
  prefs={captionPrefs}
  onPrefsChange={setCaptionPrefs}
  isSttEnabled={isSttEnabled}
  sttStatus={sttStatus}
  sttProgress={sttProgress}
  isAiEnabled={isAiEnabled}
  isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
  /* các prop dữ liệu thêm ở Phase 2–3 */
/>
```
Truyền thêm `captionPlacement={captionPrefs.placement}` cho `MeetingLayoutEngine`; trong `getTileCaptionData`, nếu `captionPlacement === 'dock'` thì `return null`.

### 6.4 Sửa chiều cao tile để không bị cắt
Trong `MeetingLayoutEngine.jsx` thay các `max-h-[Nvh]` bằng công thức trừ `--dock-h` (dùng `_` thay dấu cách trong Tailwind arbitrary value). Với lưới nhiều hàng, **chia `--dock-h` cho số hàng**:

| Vị trí | Hiện tại | Đề xuất (kiểm chứng bằng mắt) |
|---|---|---|
| tiled, 1 tile | `max-h-[75vh]` | `max-h-[calc(75vh_-_var(--dock-h,0px))]` |
| tiled, 2 tile | `max-h-[65vh]` | `max-h-[calc(65vh_-_var(--dock-h,0px))]` |
| tiled, 3–4 tile (2 hàng) | `max-h-[38vh]` | `max-h-[calc(38vh_-_var(--dock-h,0px)_/_2)]` |
| tiled, 5–9 tile (3 hàng) | `max-h-[36vh]` | `max-h-[calc(36vh_-_var(--dock-h,0px)_/_3)]` |
| sidebar, cột phải | `max-h-[80vh]` | `max-h-[calc(80vh_-_var(--dock-h,0px))]` |
| spotlight / sidebar main | `h-full max-h-full` | giữ nguyên (đã tương đối theo container) |

Nếu một lưới (ví dụ 5–9 tile) vốn đã bị chật trước khi có Dock, **không cố sửa** — chỉ đảm bảo Dock không làm tệ hơn và ghi chú trong báo cáo.

### 6.5 Dọn dẹp tại tile
Ở `MeetingVideoTile.jsx`: vẫn render `AslSubtitleOverlay` khi `captionData` có text (chế độ overlay). Xóa nhánh chết `isAiEnabled && subtitleText` và hai prop tương ứng nếu không còn nơi nào truyền.

**Tiêu chí hoàn thành Phase 1:**
- Dock xuất hiện/ẩn đúng theo bảng mục 3 (có thể chỉ hiện khung rỗng với chiều cao cố định).
- Ở cả 3 layout × 1366×768 và 1920×1080: **không có tile bị cắt**, `--dock-h` về `0px` khi Dock ẩn.
- Chọn `placement = overlay` (đặt tay trong localStorage) → quay lại hành vi cũ.
- Không còn warning React/console mới; chat/people drawer vẫn mở/đóng bình thường.

---

## 7. Phase 2 — Speech lane (cho signer)

### 7.1 Hàm thuần `captionUtils.js`

```js
import { CAPTION_CONFIG as C } from '../../../config/captionConfig';

export const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function dwellMs(entry) {
  if (!entry.isFinal) return C.INTERIM_TTL_MS;
  const ms = C.DWELL_BASE_MS + wordCount(entry.text) * C.DWELL_PER_WORD_MS;
  return Math.min(C.DWELL_MAX_MS, Math.max(C.DWELL_MIN_MS, ms));
}

export function colorForSender(senderId) {
  let h = 0;
  for (let i = 0; i < senderId.length; i++) h = (h * 31 + senderId.charCodeAt(i)) >>> 0;
  return C.SPEAKER_COLORS[h % C.SPEAKER_COLORS.length];
}
```

### 7.2 `useCaptionFeed` (tách khỏi `onCaption` để ít xâm lấn)
`client/src/hooks/useCaptionFeed.js` — quan sát map `combinedSpeechCaptions` (đã có sẵn trong `RoomView`) và dựng bộ đệm các dòng:

- Mỗi lần `timestamp` của một người gửi đổi → coi là cập nhật mới.
- Nếu dòng gần nhất của người đó là **interim** → thay tại chỗ; nếu là **final** hoặc chưa có → thêm dòng mới.
- Chỉ giữ `MAX_ENTRIES` dòng gần nhất.
- Hết hạn theo `dwellMs` (tick 500 ms) trừ khi `frozen`; khi hết đóng băng thì đặt lại `shownAt = now` cho các dòng còn lại.

```js
export function useCaptionFeed(captionMap, { frozen = false } = {}) {
  // trả về mảng entries: { id, senderId, senderName, text, isFinal, ts, shownAt }
}
```
Yêu cầu hành vi (agent tự cài, có test ở mục 10):
1. Hai cập nhật có cùng `senderId` + `timestamp` chỉ tạo một entry.
2. Interim → final của cùng người: một dòng, không nhân đôi.
3. Final → interim mới: hai dòng (dòng cũ giữ nguyên).
4. Người rời phòng (key biến mất khỏi map) → dòng cũ vẫn hiển thị đến khi hết hạn.
5. Không rò rỉ interval khi unmount.

Hook này **không** thay `speechLogs` (vẫn dùng cho export).

### 7.3 Render `SpeechLane`
- Hàng: `[Mic] Tên` (nếu `prefs.showNames`) + chữ; màu tên theo `colorForSender`; interim nghiêng mờ, final trắng.
- Neo đáy: `flex flex-col justify-end`, `overflow-hidden`, chiều cao cố định theo `rows`, mask mờ phía trên.
- Trạng thái trống theo mục 5.3 (Listening / loading / unavailable). Để dựng `Listening…`, truyền vào Dock danh sách `speakingNames` suy ra từ `updatedParticipants` (người có `isSpeaking` và không phải local) — đã có sẵn dữ liệu trong `RoomView`.
- Hover/focus vào lane → `frozen = true` (state ở `CaptionDock`, truyền vào `useCaptionFeed`).

**Tiêu chí hoàn thành Phase 2:**
- Hai người nói luân phiên → hai màu/tên khác nhau, đúng thứ tự, tối đa `rows` dòng nhìn thấy.
- Câu dài ở lại lâu hơn câu ngắn (xác nhận bằng log `dwellMs`).
- Hover vào dải: chữ không biến mất; rời chuột: biến mất sau thời gian lưu.
- Bật STT khi chưa có ai nói → hiện `Listening…`/trạng thái tải, không phải khung trống.
- Hoạt động đúng cả khi chạy một mình (speaker `local`, tên `You`).
- Không phụ thuộc vào việc interim bị tắt (sau STT refactor, `isFinal: true` là chủ yếu): UI vẫn đúng chỉ với final.

---

## 8. Phase 3 — ASL strip (non-signer) và self-preview (signer)

### 8.1 Expose token từ `useAslAggregator` (thay đổi tối thiểu)
Hiện chỉ có `currentSentence`. Cần chip, nên thêm **một state phản chiếu**:

```js
const [liveTokens, setLiveTokens] = useState([]);
// helper duy nhất:
const syncLiveTokens = useCallback(() => {
  setLiveTokens([
    ...bufferRef.current,
    ...(phraseStateRef.current.state === 'PENDING_PHRASE' ? phraseStateRef.current.tokens : []),
  ]);
}, []);
```
- **Đọc toàn bộ thân `pushGesture` và các callback trước khi sửa**; gọi `syncLiveTokens()` ngay sau **mọi** chỗ làm thay đổi `bufferRef.current` hoặc `phraseStateRef.current.tokens`, và `setLiveTokens([])` trong `commitCurrentSentence` / `clearTranscript` / reset.
- Không đổi bất kỳ điều kiện/ngưỡng/timer nào. Trả thêm `liveTokens` trong object return.
- Chip hiển thị: các token đã chốt trong buffer là chip đặc; token đang chờ trong `PENDING_PHRASE` là chip đứt nét.

### 8.2 Câu vừa chốt
Dùng `transcriptLogs` (loại `ASL`) — lấy mục cuối cùng, hiển thị mờ phía trên câu đang ghép trong `dwellMs`-tương-đương (cùng công thức, coi như final). Không cần sửa hook cho phần này.

### 8.3 Render `AslStrip`
- Header: `Hand` + `AI translation · beta` (`ASL_ACCENT`).
- Hàng chip (`liveTokens`), bên dưới là `currentSentence`; khi cả hai rỗng và `isAiEnabled` → `Waiting for signing…`.
- Chiều cao cố định (header + hàng chip + 2 hàng câu), không nhảy.
- Tên người ký (nếu muốn) lấy từ `updatedParticipants` theo `effectiveSignerId`.
- **Self-preview cho signer:** cùng component nhưng `compact` (không có `PrevSentence`, nhãn đổi thành `What others read`). Nó phản ánh aggregator **cục bộ** — ghi chú trong UI/tài liệu rằng đây là xấp xỉ vì mỗi máy tự gom cử chỉ.

### 8.4 Độ tin cậy (TÙY CHỌN — chỉ làm nếu dữ liệu có thật)
`pushGesture` nhận `confidence` nhưng chỉ dùng để lọc (`< 0.68` bị bỏ). Chỉ hiển thị "độ tin cậy" nếu bạn thêm được state `lastConfidence` (trung bình các cử chỉ vừa nhận) mà không đổi logic; nếu không, **bỏ qua**, đừng hiển thị số giả.

**Tiêu chí hoàn thành Phase 3:**
- Ký một chuỗi (ví dụ HELLO → MY → NAME → tên đánh vần) → chip xuất hiện lần lượt, chip chờ đứt nét rồi thành đặc, câu ghép hiện bên dưới, câu chốt ở lại mờ phía trên.
- Hạ tay → trạng thái `Waiting for signing…` thay vì khung trống.
- Non-signer thấy strip; signer thấy self-preview thu gọn (khi hand tracking bật); không còn overlay trên tile ở `placement = dock`.
- So sánh với baseline: kết quả dịch (`currentSentence`, `transcriptLogs`) **giống hệt** trước khi sửa với cùng chuỗi cử chỉ (xác nhận không đổi logic).

---

## 9. Phase 4 — Cài đặt, lịch sử, truy cập bàn phím

### 9.1 Popover cài đặt (`CaptionSettingsPopover.jsx`)
Mở từ nút ⚙ trong `DockFooter`. Điều khiển: cỡ chữ (M/L/XL), độ mờ nền (slider 0.6–1.0), số hàng (2–4), hiện tên người nói (toggle), vị trí (`Dock` / `Overlay on video`). Đổi là áp dụng ngay và lưu qua `useCaptionPrefs`. Có nút `Reset to defaults`. Đóng khi bấm ngoài hoặc `Esc`.

### 9.2 Ngăn kéo lịch sử (`CaptionHistoryDrawer.jsx`)
- Theme giống `MeetingChatDrawer` (`#202124` / `#28292C`).
- Nội dung: gộp và sắp xếp `[...transcriptLogs, ...speechLogs]` theo `timestamp` (cùng cách `handleExportTranscript` đã làm); mỗi mục có giờ, người gửi, loại (icon `Mic` / `Hand`), chữ; tự cuộn xuống cuối; có nút `Download transcript` gọi lại `handleExportTranscript`.
- State `isCaptionHistoryOpen` trong `RoomView`; **loại trừ lẫn nhau** với Chat và People (làm theo cách `handleToggleChat` / `handleTogglePeople` đang làm).

### 9.3 Truy cập (a11y)
- Dock: `role="log"`, `aria-label="Live captions"`, `aria-live="off"` (tránh spam trình đọc màn hình).
- Mọi nút trong Dock có `aria-label` và `title`; toggle dùng `aria-pressed`.
- **Chỉ báo focus:** vì `index.css` xóa outline toàn cục bằng `!important`, thêm trong `index.css` một quy tắc có độ đặc hiệu cao hơn, giới hạn trong Dock và drawer mới:

```css
[data-caption-ui] :focus-visible {
  outline: 2px solid #8AB4F8 !important;
  outline-offset: 2px !important;
}
```
- Tôn trọng `prefers-reduced-motion` (tắt trượt/fade).
- Phím tắt tùy chọn: `C` bật/tắt Dock hoặc mở cài đặt **chỉ khi** không đang gõ trong input/textarea (kiểm tra `event.target`). Nếu không chắc không xung đột với phím tắt hiện có, bỏ qua.

**Tiêu chí hoàn thành Phase 4:**
- Đổi cỡ chữ/độ mờ/số hàng áp dụng tức thì và còn nguyên sau khi tải lại.
- Chọn `Overlay on video` → quay lại overlay cũ và Dock biến mất; chọn lại `Dock` → ngược lại, `--dock-h` đúng.
- Điều hướng hoàn toàn bằng Tab thấy được focus ở mọi nút Dock/popover/drawer; `Esc` đóng popover/drawer.
- Mở History: thấy các câu speech và ASL xen kẽ đúng thời gian; export vẫn hoạt động như trước.

---

## 10. Kiểm thử

1. Nếu `package.json` đã có test runner (Vitest/Jest) → viết test cho `dwellMs`, `colorForSender`, và logic hợp nhất của `useCaptionFeed` (5 hành vi ở 7.2). **Nếu chưa có**, không thêm framework nặng: tách logic hợp nhất thành hàm thuần `mergeCaptionEntries(prev, incoming, maxEntries)` và viết script `scripts/caption-utils.check.mjs` dùng `node:assert`.
2. Checklist thủ công (ghi kết quả vào `docs/caption-ui/AFTER.md`, kèm ảnh):
   - [ ] 3 layout × (1366×768, 1920×1080): tile không bị cắt, Dock không đè control bar.
   - [ ] Signer: STT bật, 2 người nói luân phiên → roll-up đúng, màu/tên đúng.
   - [ ] Signer: STT tắt/đang tải/lỗi → trạng thái đúng.
   - [ ] Non-signer: signer ký chuỗi → chips + câu + câu chốt đúng.
   - [ ] Chạy một mình (không có peer) ở cả hai vai trò → không crash, có tên `You`.
   - [ ] Đổi vai trò giữa cuộc họp (`handleChangeRole`) → Dock đổi đúng, `--dock-h` cập nhật.
   - [ ] Peer rời phòng giữa chừng → dòng cũ hết hạn bình thường, không lỗi.
   - [ ] `placement = overlay` vẫn hoạt động như bản cũ.
   - [ ] Bật STT/ASL 10 lần liên tiếp: không rò rỉ interval/observer (kiểm tra console + Performance).
   - [ ] Bản build Electron (`npm run build` + chạy thử), không chỉ dev server.
3. Chạy lint/build của `client/`; không có cảnh báo mới liên quan file đã sửa.

---

## 11. Phase 5 (TÙY CHỌN — cần người dùng xác nhận trước)

- **Cảnh báo âm thanh nhiễu:** chỉ làm nếu pipeline STT (sau refactor) phát tín hiệu đáng tin (ví dụ tỷ lệ đoạn bị lọc cao). Khi đó hiện `Noisy audio, captions may be inaccurate` ở footer. Nếu chưa có tín hiệu, **không** làm giả.
- **Thu hồi câu ký hiệu (retract) cho người ký:** nút `Clear` hiện chỉ xóa local (`clearTranscript`); muốn người kia cũng thấy bị thu hồi cần thêm sự kiện socket (`server/server.js`, `useSocket.js`) — chỉ trình bày thiết kế, chờ duyệt.
- **Nhãn tin cậy ASL:** xem 8.4.
- **Tùy chọn font dễ đọc cho người đọc khó** (cần bundle font và kiểm tra giấy phép) — chỉ đề xuất.

---

## 12. Câu hỏi cần hỏi người dùng trước/trong khi làm

1. Signer có nên vẫn thấy bản dịch ký hiệu của **signer khác** không? (mặc định: không; xem cờ `SHOW_REMOTE_TRANSLATION_FOR_SIGNER`)
2. Có cần thu hồi câu ký hiệu đồng bộ cho người kia (đòi hỏi đổi server)? (mặc định: không)
3. Có muốn giữ chế độ `Overlay on video` làm tùy chọn lâu dài, hay chỉ dùng Dock? (mặc định: giữ)
4. Ngôn ngữ chuỗi UI: giữ tiếng Anh như hiện tại hay song ngữ? (mặc định: tiếng Anh)

---

## 13. Dọn dẹp, commit và báo cáo

- Xóa state chết `subtitleText`/`setSubtitleText` trong `RoomView` và nhánh chết trong `MeetingVideoTile` (mục 1.1, 6.5).
- Cập nhật `README.md`: mô tả Caption Dock, bảng policy theo vai trò, cách đổi `captionConfig.js`.
- Mỗi Phase một commit, định dạng:
```
captions(phase-N): <mô tả ngắn>

- Thay đổi chính
- Ảnh/số liệu trước-sau (nếu có)
- Rủi ro / việc chưa làm
```
- Báo cáo cuối cần nêu: các hạn chế đã biết (aggregator dùng chung cử chỉ cục bộ + từ xa; gán người nói của STT hiện là suy đoán; lưới 5–9 tile vốn đã chật), và các quyết định ở mục 12 đã được xác nhận hay còn để mặc định.

## 14. Khi gặp vấn đề

- Thấy code khác với mô tả trong tài liệu (phiên bản đã đổi) → ưu tiên code thực tế, ghi lại khác biệt trong commit.
- Không đạt tiêu chí của một Phase → **dừng và báo cáo** (nguyên nhân nghi ngờ, ảnh, log); không nhảy sang Phase sau.
- Muốn sửa thứ nằm ngoài phạm vi (mục 0) → hỏi trước.
