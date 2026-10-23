# Speech-to-Text Baseline Evaluation Matrix

This document tracks baseline and post-refactor speech-to-text accuracy, hallucination rates, and latency under 4 distinct acoustic scenarios for SL-Meet.

Each evaluation scenario consists of reading a standardized ~20-second English passage:
> *"Welcome everyone to our project presentation today. We are demonstrating real-time sign language recognition and offline speech-to-text transcription powered by WebRTC and WebAssembly."*

---

## 1. Evaluation Scenarios & Baseline Record (Pre-Refactor)

| Scenario | Acoustic Description | Model | Hallucination / Noise Phrases Observed | Text Flickering (Interim) | Latency (Estimated) | Notes |
|---|---|---|---|---|---|---|
| **A: Quiet Room** | Normal quiet indoor room, no ambient noise. | `whisper-tiny.en` | Rare / None (~0%) | Yes (interim text mutates every 1.4s) | ~400ms | Clean audio transcribes reasonably, but text flickers wildly during speech. |
| **B: Fan / AC Running** | Desk fan or AC blowing noise near the microphone. | `whisper-tiny.en` | **High (>60%)**: Constant random hallucinations (*"thank you"*, *"watching"*, *"bye"*, *"you"*). | Severe | ~1400ms continuous | Static RMS VAD (>0.016) treats fan noise as speech, generating continuous noise buffers. |
| **C: Background Music** | Low-to-moderate volume music or YouTube video played via speakers. | `whisper-tiny.en` | **High (>50%)**: YouTube subtitle hallucinations (*"thanks for watching"*, *"subscribe to my channel"*). | Severe | Continuous | Background melody triggers repetitive YouTube training text. |
| **D: Background Chatter** | Secondary person speaking in the background (café / hallway). | `whisper-tiny.en` | **Moderate-to-High**: Incoherent phrases, fragmented words mixed with background murmurs. | Severe | Delayed | Words from secondary speakers blend in without speaker attribution. |

---

## 2. Target Metrics (Post-Refactor with Silero VAD + Whisper-Base)

| Metric | Baseline (`whisper-tiny.en` + RMS VAD) | Target (`whisper-base.en` + Silero VAD) |
|---|---|---|
| **Hallucination under Fan/AC (Scenario B)** | > 60% of audio segments | < 5% (Silero cuts fan noise completely) |
| **Interim Text Flickering** | Frequent mutation every 1.4s | **0%** (Final-only display mode) |
| **WASM Crash / Timeout Rate** | High with previous base attempts | **0%** (Queue guard + INT8 Quantized) |
| **Per-Utterance Latency** | ~400ms (tiny) | ~900ms - 1300ms (acceptable for final subtitle) |
| **Word Error Rate (Clean English)** | ~15% | < 7% |

---

## 3. Verification Checklist for Subsequent Phases

- [ ] **Phase 1 Verification:**
  - `track.getSettings()` confirms `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`.
  - Mic switching works without dropping peer connection.
- [ ] **Phase 2 Verification:**
  - Silero VAD initializes from relative path `./vad/`.
  - Ambient fan noise produces zero audio chunks when nobody is speaking.
  - Multi-track audio mix does not leak to physical speakers.
- [ ] **Phase 3 Verification:**
  - `whisper-base.en` loads smoothly with progress feedback.
  - `looksLikeHallucination` catches repetitive loops and high WPS bursts.
  - 3-second deduplication stops duplicate final messages.
- [ ] **Phase 4 Verification:**
  - Captions appear cleanly after speaker pauses (~400ms), without jumping or flickering.
