# SL-Meet — Hướng dẫn refactor Speech-to-Text (chống hallucination khi có tạp âm)

> Tài liệu dành cho coding agent (Claude Code / Cursor / Copilot Agent...). Đọc hết mục 0–3 trước khi sửa bất kỳ file nào. Làm theo từng Phase, mỗi Phase một commit riêng, và chỉ chuyển Phase khi đã đạt "Tiêu chí hoàn thành" của Phase trước.

---

## 0. Bối cảnh & mục tiêu

**Dự án:** SL-Meet — ứng dụng họp trực tuyến Electron + React 18 + Vite + Tailwind, WebRTC P2P, Socket.io, MediaPipe (nhận dạng ký hiệu), và Whisper chạy trên client (transformers.js, WASM CPU) để phụ đề giọng nói cho người dùng khiếm thính (vai trò `SIGNER`).

**Vấn đề:** Sau buổi demo, khi môi trường yên tĩnh thì STT khá ổn; khi có tạp âm thì chữ hiển thị nhảy lung tung giữa các từ ngẫu nhiên (hallucination).

**Mục tiêu refactor:**
1. Giảm mạnh hallucination khi có tạp âm (quạt, quán cà phê, tiếng gõ phím, nhiều người nói).
2. Chữ hiển thị ổn định, không nhấp nháy/đổi liên tục.
3. Không phá vỡ API hiện có của các component khác.

**Không nằm trong phạm vi (non-goals):**
- Không sửa luồng MediaPipe / ASL (`useMediaPipe`, `useHandTrackingWorker`, `gestureClassifier`, `aslTranslator`, `useAslAggregator`...).
- Không đổi UI của `MeetingControlBar`, `AslSubtitleOverlay`... ngoài những gì mục 6 yêu cầu.
- Không đổi server (`server/server.js`) trong Phase 1–4. Phase 5 chỉ thực hiện khi người dùng xác nhận.

---

## 1. Hiện trạng (đã xác minh từ source)

### Các file liên quan
| File | Vai trò |
|---|---|
| `client/src/hooks/useSpeechToText.js` | Thu audio qua AudioWorklet (inline Blob), VAD bằng RMS, gom đoạn, gửi worker |
| `client/src/workers/whisper.worker.js` | Chạy `@huggingface/transformers` pipeline ASR, lọc hallucination |
| `client/src/services/whisperWorkerManager.js` | Singleton quản lý worker + preload model |
| `client/src/components/RoomView.jsx` | Tạo `sttAudioStream`, gọi `useSpeechToText`, gán người nói, ghi log |
| `client/src/hooks/useLocalMedia.js` | `getUserMedia` (hiện dùng `audio: true`) |
| `client/public/worklets/pcm-capture-processor.js` | Worklet dạng file nhưng **hiện không được dùng** |
| `client/src/services/modelCache.js` | `indexedDbCache` cho transformers.js (workaround `file://` của Electron) |

### Các nguyên nhân gốc rễ đã xác định
1. **VAD chỉ là ngưỡng RMS** (`RMS_SPEECH_THRESHOLD = 0.016`, EMA 0.7/0.3). Tạp âm lớn hơn ngưỡng bị coi là giọng nói → đoạn dài tới `MAX_UTTERANCE_DURATION_SEC = 10` giây → Whisper bịa chữ.
2. **Model `onnx-community/whisper-tiny.en` (quantized)**: nhỏ nhất, dễ hallucinate nhất; chỉ tiếng Anh.
3. **Interim decode lại toàn bộ buffer mỗi `INTERIM_INTERVAL_MS = 1400`** → text đổi liên tục giữa các lần khi có nhiễu.
4. **Audio STT lấy từ track WebRTC nhận về** (đã nén Opus). Trong `RoomView.jsx`, `new MediaStream(audioTracks)` có thể chứa nhiều track nhưng `AudioContext.createMediaStreamSource` chỉ dùng **một** track → với nhiều người nói chỉ nhận dạng được một người. Việc gán người nói qua `activeSpeakerPeer` là suy đoán.
5. **Bộ lọc hallucination chỉ so khớp chính xác** một `Set` ngắn các câu tiếng Anh.
6. `sttAudioStream` tạo trong `useMemo` phụ thuộc `peerStreams` → tham chiếu stream đổi khi peer cập nhật → `useEffect` trong hook khởi động lại toàn bộ pipeline (đóng/tạo lại `AudioContext`).
7. `useLocalMedia` gọi `getUserMedia({ audio: true })` — không khai báo tường minh `noiseSuppression`/`echoCancellation`/`autoGainControl`.

---

## 2. Ràng buộc bắt buộc (không được vi phạm)

- **Giữ nguyên chữ ký public của hook:**
  `useSpeechToText({ stream, enabled, onCaption })` → trả về `{ status, loadProgress, interimText, error, isListening }`.
  `status` ∈ `'idle' | 'loading' | 'ready' | 'listening' | 'error'`.
  `onCaption({ text, isFinal, segmentId })`.
- **Giữ nguyên chữ ký** các export của `whisperWorkerManager.js`: `getWhisperWorker`, `getWhisperStatus`, `subscribeWhisperWorker`, `preloadWhisperModel`.
- **Không được `stop()` các track gốc** của `peerStreams` / `localStream` (sẽ tắt tiếng cuộc họp). Luôn `track.clone()` trước khi đưa vào STT và chỉ stop bản clone.
- App chạy trong **Electron** (nhiều khả năng load `file://` khi build): mọi asset mới (ONNX, WASM, worklet) phải truy cập bằng **đường dẫn tương đối** và có trong bản build. Kiểm tra `client/vite.config.js` (`base`) và CSP trong `client/electron/main.js` (WASM có thể cần `'wasm-unsafe-eval'`).
- Không dùng WebGPU (comment trong worker cho biết đã gặp lỗi tương thích shader với Electron 29).
- Không thêm dependency ngoài danh sách ở từng Phase mà không giải thích lý do trong commit message.
- Trước khi dùng API của thư viện (`@ricky0123/vad-web`, `@huggingface/transformers`), **đọc README/type definitions của đúng version cài trong `node_modules`**. Tên option trong tài liệu này có thể khác theo version — ưu tiên theo version thực tế.

---

## 3. Việc cần làm trước khi sửa (Phase 0 — chuẩn bị & baseline)

### 3.1 Đọc code
Đọc đầy đủ: 7 file ở bảng mục 1, cùng `client/package.json`, `client/vite.config.js`, `client/electron/main.js`, và `useSocket.js` (để biết `sendSpeechCaption` hiện làm gì).

### 3.2 Thêm cờ debug
Tạo `client/src/config/sttConfig.js`:

```js
// Tập trung mọi hằng số STT để dễ tinh chỉnh / A-B test.
export const STT_CONFIG = {
  DEBUG: true,                       // log chi tiết; tắt khi release
  MODEL_NAME: 'onnx-community/whisper-tiny.en', // Phase 3 sẽ đổi
  LANGUAGE: null,                    // 'vi' | 'en' | null (chỉ dùng với model đa ngữ)
  ENABLE_INTERIM: true,              // Phase 4 sẽ đổi mặc định
  MIN_UTTERANCE_SEC: 0.4,
  MAX_UTTERANCE_SEC: 8,
};
```

Thêm log (khi `DEBUG`) ở các điểm: số đoạn VAD, thời lượng mỗi đoạn, text thô từ Whisper, lý do bị lọc (nếu có).

### 3.3 Ghi baseline
Tạo thư mục `client/src/dev/` hoặc `docs/stt-eval/` và ghi file `BASELINE.md` gồm bảng kết quả thủ công cho tối thiểu 4 kịch bản (mỗi kịch bản đọc cùng một đoạn văn ~20 giây):

| Kịch bản | Mô tả |
|---|---|
| A | Yên tĩnh |
| B | Quạt/điều hòa chạy |
| C | Nhạc nền hoặc video phát ở loa ngoài |
| D | Có người khác nói chuyện phía sau |

Với mỗi kịch bản ghi: số câu hiển thị rác, số từ sai ước lượng (hoặc WER nếu tính được), có nhấp nháy interim không. Nếu người dùng chưa cung cấp audio mẫu, **tạo checklist trống và hỏi người dùng thực hiện đo** — không bịa số liệu.

### 3.4 (Tùy chọn) Script benchmark offline
`scripts/stt-bench.mjs`: chạy transformers.js trong Node trên các file WAV 16 kHz mono, in transcript + thời gian, để so sánh model (`tiny.en`, `base.en`, `small.en`...) mà không cần mở app. Chỉ làm nếu `onnxruntime-node` cài được trong môi trường hiện tại.

**Tiêu chí hoàn thành Phase 0:** có `sttConfig.js`, log debug hoạt động, có `BASELINE.md` (số liệu thật hoặc checklist trống chờ người dùng đo). Chưa thay đổi hành vi.

---

## 4. Phase 1 — Khai báo tường minh ràng buộc mic

**File:** `client/src/hooks/useLocalMedia.js` (hai chỗ gọi `getUserMedia`: luồng chính và fallback chỉ-audio).

```js
const audioConstraints = {
  ...(audioId ? { deviceId: { exact: audioId } } : {}),
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};
// dùng audioConstraints thay cho `audioId ? {deviceId:{exact:audioId}} : true`
```

Lưu ý: `useLocalMedia` còn có phần phát hiện đang nói (analyser) — không được làm hỏng nó.

**Tiêu chí hoàn thành:**
- Gọi `track.getSettings()` trên audio track (log debug) cho thấy `noiseSuppression`, `echoCancellation`, `autoGainControl` đều `true` ở môi trường test.
- Đổi thiết bị mic (`changeAudioDevice`) vẫn hoạt động.
- Cuộc họp 2 máy vẫn nghe được nhau.

---

## 5. Phase 2 — Thay VAD RMS bằng Silero VAD

### 5.1 Cài đặt
```bash
cd client && npm install @ricky0123/vad-web
```
Làm theo README của version đã cài về: danh sách asset cần copy (file `.onnx` của Silero, `vad.worklet.bundle.min.js`, các file `ort-wasm*.wasm`/`.mjs`). Đưa chúng vào `client/public/vad/` (có thể dùng script `postinstall` hoặc plugin copy của Vite).

### 5.2 Các điểm nguy hiểm — bắt buộc xử lý
1. **Asset path trong Electron:** cấu hình `baseAssetPath` và `onnxWASMBasePath` theo đường dẫn **tương đối** (ví dụ `./vad/`) và đảm bảo hoạt động cả ở `npm run dev:electron` lẫn bản build.
2. **Không để VAD dừng track thật.** Mặc định `MicVAD` có thể gọi dừng track khi pause/destroy. Luôn cấp cho VAD một stream **gồm các track clone**, và tự quản lý vòng đời bản clone:
   ```js
   const clonedTracks = tracks.map((t) => t.clone());
   const vadStream = new MediaStream(clonedTracks);
   // cleanup: clonedTracks.forEach((t) => t.stop());
   ```
   Nếu version thư viện có `pauseStream`/`resumeStream`, cấu hình để chúng **không** dừng track gốc (resume trả lại cùng `vadStream`).
3. **Một track duy nhất:** `createMediaStreamSource` chỉ dùng một track. Nếu `stream` có nhiều audio track, trộn chúng thành một stream trước khi đưa cho VAD (xem 5.3).
4. Hai `onnxruntime-web` (một cho VAD ở main thread, một cho Whisper trong worker) có thể cùng tồn tại — kiểm tra không xung đột phiên bản/bộ nhớ; nếu xung đột, ghi lại và báo người dùng thay vì tự ý hack.

### 5.3 Helper trộn nhiều track
Tạo `client/src/services/audioMix.js`:

```js
// Trộn nhiều MediaStreamTrack thành 1 MediaStream (đã clone track).
// Trả về { stream, dispose } — dispose() dừng bản clone và đóng AudioContext.
export function createMixedStream(tracks) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  const clones = tracks.map((t) => t.clone());
  const sources = clones.map((c) => {
    const src = ctx.createMediaStreamSource(new MediaStream([c]));
    src.connect(dest); // KHÔNG nối vào ctx.destination (tránh phát ra loa)
    return src;
  });
  return {
    stream: dest.stream,
    dispose: () => {
      sources.forEach((s) => s.disconnect());
      clones.forEach((c) => c.stop());
      ctx.close().catch(() => {});
    },
  };
}
```
Nếu `tracks.length === 1`, có thể bỏ qua việc trộn và chỉ clone.

### 5.4 Viết lại `useSpeechToText.js`
Giữ nguyên phần subscribe worker (`getWhisperWorker`, `subscribeWhisperWorker`, xử lý `status/progress/error/result`). Thay **toàn bộ** khối "Audio capture & VAD pipeline" bằng:

```js
useEffect(() => {
  let cancelled = false;
  let vad = null;
  let mixed = null;

  if (!enabled || !stream) { setInterimText(''); return; }
  const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
  if (tracks.length === 0) return;

  (async () => {
    try {
      mixed = createMixedStream(tracks);
      vad = await MicVAD.new({
        getStream: async () => mixed.stream,
        // Tên & đơn vị (frame hay ms) phụ thuộc version — đọc type definitions:
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        // minSpeech ≈ 400ms, redemption ≈ 500ms, preSpeechPad ≈ 200ms
        baseAssetPath: './vad/',
        onnxWASMBasePath: './vad/',
        onSpeechEnd: (audio /* Float32Array 16kHz mono */) => {
          const sec = audio.length / 16000;
          if (sec < STT_CONFIG.MIN_UTTERANCE_SEC) return;
          segmentIdRef.current += 1;
          workerRef.current?.postMessage(
            { type: 'transcribe', audio, isFinal: true, segmentId: segmentIdRef.current },
            [audio.buffer] // chuyển quyền sở hữu buffer, tránh copy
          );
        },
      });
      if (cancelled) { vad.destroy?.(); mixed.dispose(); return; }
      vad.start();
      setStatus('listening');
    } catch (err) {
      console.error('[useSpeechToText] VAD init failed:', err);
      setError(err.message);
      setStatus('error');
    }
  })();

  return () => {
    cancelled = true;
    try { vad?.destroy?.(); } catch {}
    mixed?.dispose();
    setInterimText('');
  };
}, [enabled, stream]);
```

Chi tiết cần xử lý:
- Nếu đoạn nói dài hơn `MAX_UTTERANCE_SEC`, cần cắt (VAD có thể phát đoạn rất dài nếu người nói liên tục). Dùng `onFrameProcessed`/ngắt thủ công theo tài liệu version, hoặc chia đoạn ở worker.
- `postMessage` với transfer `audio.buffer`: đảm bảo không dùng lại `audio` sau đó.
- **Fallback an toàn:** giữ lại logic RMS cũ trong `client/src/hooks/legacyEnergyVad.js` và dùng khi Silero khởi tạo thất bại (kèm cảnh báo console). Bản fallback nên thêm ngưỡng **thích nghi**: theo dõi noise floor (EMA của RMS khi không nói), `threshold = max(0.012, noiseFloor * 3)`.
- Xóa các `useRef`/hằng số không còn dùng (`preRollChunksRef`, `silenceTimerRef`, `RMS_SPEECH_THRESHOLD`...) khỏi hook chính. Xóa luôn chuỗi worklet inline.

### 5.5 Ổn định `sttAudioStream` trong `RoomView.jsx`
Tính khóa từ ID track để `useMemo` không đổi tham chiếu khi chỉ `peerStreams` cập nhật:

```js
const sttTracks = useMemo(() => { /* gom track 'live' như cũ, thêm localStream fallback */ }, [peerStreams, localStream, isMuted, userRole, isSttEnabled]);
const sttTracksKey = sttTracks.map((t) => t.id).sort().join('|');
const sttAudioStream = useMemo(
  () => (sttTracks.length ? new MediaStream(sttTracks) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sttTracksKey]
);
```
Giữ nguyên logic chọn nguồn (peer trước, mic cục bộ chỉ khi ở một mình và không mute).

**Tiêu chí hoàn thành Phase 2:**
- Kịch bản B, C (quạt, nhạc nền): số câu rác giảm rõ rệt so với baseline (ghi vào `BASELINE.md`).
- Bật/tắt STT nhiều lần không rò rỉ `AudioContext` (kiểm tra qua `chrome://webrtc-internals` hoặc log) và **không** làm mất tiếng của cuộc họp.
- Hoạt động trong bản build Electron (không chỉ dev server).
- API hook không đổi; `RoomView`, `MeetingControlBar` chạy nguyên vẹn.

---

## 6. Phase 3 — Model & tham số giải mã & bộ lọc

**File:** `client/src/workers/whisper.worker.js`, `client/src/config/sttConfig.js`.

### 6.1 Đổi model
Đọc `MODEL_NAME` và `LANGUAGE` từ `STT_CONFIG`. Thử theo thứ tự và đo độ trễ + chất lượng (ghi vào `BASELINE.md`):

| Ứng viên | Ghi chú |
|---|---|
| `onnx-community/whisper-base.en` | Điểm khởi đầu khuyến nghị (nếu chỉ tiếng Anh) |
| `onnx-community/whisper-base` | Đa ngữ; đặt `LANGUAGE` cố định, ví dụ `'vi'` |
| `onnx-community/whisper-small(.en)` | Chính xác hơn nhưng có thể chậm trên WASM CPU; chỉ dùng nếu độ trễ ≤ ~2–3 giây/đoạn trên máy mục tiêu |

Kiểm tra tên model còn tồn tại trên Hugging Face trước khi dùng. Nếu cần tiếng Việt chất lượng cao, **không tự ý chọn** — ghi chú đề xuất PhoWhisper (chạy phía server/Python) và hỏi người dùng.

Với model đa ngữ, truyền `language` và `task: 'transcribe'`; với model `.en` thì **không** truyền `language`.

### 6.2 Tham số giải mã
```js
const options = {
  sampling_rate: 16000,
  return_timestamps: false,
  num_beams: 3,
  no_repeat_ngram_size: 3,
  // chỉ khi model đa ngữ:
  ...(STT_CONFIG.LANGUAGE ? { language: STT_CONFIG.LANGUAGE, task: 'transcribe' } : {}),
};
```
Bỏ `chunk_length_s`/`stride_length_s` vì mọi đoạn đã ngắn hơn 30 giây. Nếu một option không được version transformers.js đang dùng hỗ trợ, bỏ option đó và ghi chú trong commit.

### 6.3 Bộ lọc hallucination theo cấu trúc
Giữ `cleanTranscription` hiện có, thêm bước kiểm tra sau (truyền thời lượng = `audio.length / 16000`):

```js
function looksLikeHallucination(text, durationSec) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (words.length === 0) return true;
  const wps = words.length / durationSec;
  if (wps > 6 || (durationSec > 3 && wps < 0.3)) return true;       // quá dày / quá thưa
  if (words.length >= 5 && new Set(words).size / words.length < 0.4) return true; // lặp từ
  if (/(\b[\p{L}']+\b)(\s+\1){3,}/iu.test(text)) return true;      // "the the the the"
  return false;
}
```
Thêm:
- **Chống trùng:** bỏ kết quả final trùng nguyên văn với final liền trước trong vòng ~3 giây.
- Mở rộng danh sách cụm bị chặn bằng regex (các biến thể "thanks for watching", "subscribe", "subtitles by...", "please like and share..."), đồng thời với tiếng Việt nếu dùng model đa ngữ (ví dụ cụm "hãy đăng ký kênh").
- Khi một đoạn bị lọc, log lý do (khi `DEBUG`) để tinh chỉnh ngưỡng sau.

**Tiêu chí hoàn thành Phase 3:**
- Bảng so sánh model trong `BASELINE.md` có độ trễ trung bình/đoạn và nhận xét chất lượng.
- Độ trễ final ≤ ~2 giây cho đoạn ≤ 5 giây trên máy mục tiêu (nếu vượt, giữ model nhỏ hơn).
- Không có kết quả "câu rác lặp từ" trong kịch bản B/C/D.
- Kịch bản A (yên tĩnh) không tệ hơn baseline (không lọc nhầm câu đúng — ghi lại các lần lọc nhầm nếu có).

---

## 7. Phase 4 — Ổn định phụ đề (interim)

Nguyên nhân gây "nhảy chữ": mỗi lần interim decode lại toàn bộ audio đang tích lũy.

Với kiến trúc Silero VAD ở Phase 2, **mặc định tắt interim** (`ENABLE_INTERIM: false`) và dựa vào final (đã được cắt đoạn tốt, độ trễ chấp nhận được). Nếu cần giữ interim:
- Chỉ phát interim khi đoạn nói đã ≥ 1.5 giây và interval ≥ 2 giây.
- Áp dụng **bộ lọc ổn định:** chỉ hiển thị interim mới nếu phần đầu của nó trùng ≥ 60% số từ với interim trước; nếu không, giữ nguyên interim cũ (không đổi).
- Final luôn ghi đè interim.

Đảm bảo `RoomView` vẫn hiển thị đúng khi không có interim (`interimText` luôn `''`).

**Tiêu chí hoàn thành Phase 4:** trong kịch bản B/C/D, phụ đề không đổi chữ liên tục; mỗi câu hiển thị dưới dạng final ổn định.

---

## 8. Phase 5 (TÙY CHỌN — cần người dùng xác nhận trước) — STT phía người nói

**Không triển khai Phase này nếu người dùng chưa đồng ý.** Hãy trình bày thiết kế cho người dùng trước.

Ý tưởng: thay vì máy người nghe (SIGNER) giải mã audio đã nén Opus qua mạng, máy người nói chạy STT trên **mic gốc** rồi gửi text qua socket (đã có `sendSpeechCaption` và `speechCaptions` trong `useSocket`/`RoomView`).

Lợi ích: audio sạch hơn (chưa nén), khử nhiễu theo từng mic, gán người nói chính xác (không cần `activeSpeakerPeer`), hết giới hạn một-track.

Chi phí/việc cần làm:
1. Máy người nói phải tải và chạy Whisper (tốn CPU/RAM; cần đo).
2. Cần cơ chế báo hiệu: SIGNER bật phụ đề → server/relay thông báo cho các client khác bắt đầu STT cục bộ → text gửi về qua socket. Cần thêm sự kiện socket (vd. `stt:enable`, `stt:caption`) ở `server/server.js`, `services/socket.js`, `useSocket.js`.
3. Quyết định chính sách khi người nói không bật được STT (máy yếu): dùng lại pipeline phía người nghe làm fallback.

Chỉ báo cáo thiết kế + ước lượng công sức; chờ phê duyệt.

---

## 9. Dọn dẹp (cuối cùng)

- Xóa `client/public/worklets/pcm-capture-processor.js` nếu không còn nơi nào tham chiếu (grep trước khi xóa).
- Xóa biến/hằng không dùng, comment lỗi thời (ví dụ comment "whisper-tiny.en" nếu đã đổi).
- Tắt `STT_CONFIG.DEBUG` mặc định hoặc gắn vào `import.meta.env.DEV`.
- Cập nhật `README.md`: thêm mục STT (model, VAD, cách tinh chỉnh `sttConfig.js`, cách chạy đánh giá).
- Chạy `npm run build` trong `client/` và smoke test bản Electron.

---

## 10. Kiểm thử tổng thể (checklist trước khi báo hoàn thành)

- [ ] `npm run dev:electron` chạy, bật STT trong phòng họp 2 client, có phụ đề.
- [ ] Bản build Electron nạp được model VAD và Whisper (không lỗi 404/CSP).
- [ ] Bật/tắt STT 10 lần liên tiếp: không tăng bộ nhớ bất thường, không mất tiếng cuộc họp.
- [ ] Tắt mic người nói / thoát phòng: pipeline dọn dẹp sạch, không lỗi console.
- [ ] Nhiều người nói cùng phòng: kết quả vẫn ra (dù trộn chung), không crash.
- [ ] Kịch bản A/B/C/D đã đo lại, số liệu cập nhật trong `BASELINE.md`.
- [ ] Không có thay đổi ngoài phạm vi (git diff chỉ chạm các file ở mục 1 + file mới nêu trong tài liệu).

## 11. Quy ước commit

Mỗi Phase một commit, thông điệp dạng:
```
stt(phase-N): <mô tả ngắn>

- Thay đổi chính
- Số liệu trước/sau (nếu có)
- Ghi chú rủi ro / việc chưa làm
```

## 12. Khi gặp vấn đề

- Thư viện/version khác với giả định trong tài liệu → ưu tiên tài liệu của version thực tế, ghi lại khác biệt trong commit message.
- Không đạt tiêu chí của một Phase → **dừng, báo cáo** (nguyên nhân nghi ngờ, log, số liệu), không tự ý nhảy sang Phase sau.
- Cần quyết định sản phẩm (ngôn ngữ cần hỗ trợ, đổi kiến trúc Phase 5, chọn model theo cấu hình máy) → hỏi người dùng, đừng tự quyết.
