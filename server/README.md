# SL-Meet Socket & Signaling Server (`sl-meet-socket-server`)

Real-time WebRTC signaling, room state coordination, host moderation, and ASL dataset distribution backend built with **Node.js, Express 4, and Socket.io 4**. Ready for zero-config deployment on [Render](https://render.com/) via [`render.yaml`](./render.yaml).

---

## Architecture

```text
server/
├── server.js                   # Express REST API + Socket.io signaling & room state server
├── render.yaml                 # Render Web Service deployment blueprint
├── .env.example                # Environment variable template
├── package.json                # Dependencies & scripts
└── tests/
    └── room-security.test.mjs  # Unit tests for admin auth, host transfer & cross-room WebRTC isolation
```

---

## Security & Reliability Features

- **Timing-Safe Admin Authentication (`requireAdminAuth`)**: Admin mutation routes strictly validate the `x-admin-key` HTTP header using `crypto.timingSafeEqual` (query-string keys are rejected). Halts startup in `production` if `ADMIN_SECRET` is unset.
- **Cross-Room WebRTC Isolation (`arePeersInSameRoom`)**: `webrtc_offer`, `webrtc_answer`, and `webrtc_candidate` events verify that both sender and target sockets belong to the same active room before relaying SDP/ICE payloads.
- **Authenticated Host Governance (`transferHostToNextNonGuest`)**: Guests cannot claim host privileges; if the host disconnects, host ownership transfers only to the next authenticated (non-guest) participant, and `end_room` / `kick_peer` / `mute_peer` enforce strict host verification.
- **Cached Async Dataset I/O**: Reads/writes `data/dataset.json` asynchronously with in-memory caching and broadcasts `dataset_updated` events to connected clients on changes.

---

## REST API Endpoints

| Method | Path | Auth | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/` | Public | Service metadata & version JSON |
| `GET` | `/health` | Public | Render health check (`200 OK`) |
| `GET` | `/api/gestures/dataset` | Public | Fetch active server-side ASL gesture dataset |
| `POST` | `/api/admin/verify` | `x-admin-key` | Verify admin secret key |
| `POST` | `/api/admin/deploy` | `x-admin-key` | Broadcast `dataset_updated` event to all connected clients |
| `POST` | `/api/gestures/dataset` | `x-admin-key` | Import/replace full gesture dataset JSON |
| `POST` | `/api/gestures/sample` | `x-admin-key` | Create or update a single gesture sample vector |
| `PUT` | `/api/gestures/sample/:id` | `x-admin-key` | Edit sample label or description |
| `DELETE` | `/api/gestures/sample/:id` | `x-admin-key` | Delete a single gesture sample by ID |
| `DELETE` | `/api/gestures/label/:name` | `x-admin-key` | Delete all samples belonging to a gesture label |

---

## Socket.io Events

- **Room Lifecycle**: `join_room`, `leave_room`, `end_room`, `room_users`, `user_joined`, `user_left`, `room_ended`
- **WebRTC Signaling**: `webrtc_offer`, `webrtc_answer`, `webrtc_candidate`
- **Accessibility & Media State**: `gesture_stream`, `speech_caption_stream`, `peer_media_status`, `role_updated`, `screen_share_status`
- **In-Call Chat & Moderation**: `chat_message`, `mute_peer`, `mute_peer_request`, `kick_peer`, `kick_peer_request`

---

## Environment Variables (`server/.env`)

```env
PORT=4000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
ADMIN_SECRET=your-strong-admin-secret
NODE_ENV=development
```

---

## Scripts

```bash
# Start with nodemon auto-reload (http://localhost:4000)
npm --prefix server run dev

# Start production server
npm --prefix server start

# Run security & authorization unit tests (4 test cases)
npm --prefix server test
```

