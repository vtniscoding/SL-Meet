# 🎨 SL-Meet Standardized Icon Registry (`src/icons/`)

Tài liệu hướng dẫn quản lý và thay đổi Icon trong toàn bộ ứng dụng SL-Meet.

---

## 1. Mục đích & Lợi ích
Trước đây, các icon được `import` trực tiếp rải rác từ thư viện bên ngoài (`lucide-react`) trong hàng chục file components. Khi muốn đổi hình dáng hoặc thư viện icon (ví dụ: đổi icon Microphone, Camera, Hand Tracking, v.v.), lập trình viên phải tìm và sửa từng component.

**Với Registry `src/icons/`:**
- **Single Source of Truth**: Toàn bộ icon được định nghĩa và chuẩn hóa tại **`client/src/icons/index.js`**.
- **Đổi 1 nơi – Đổi toàn bộ**: Bạn chỉ cần thay đổi 1 dòng trong file này, mọi nút và thành phần trong app sẽ tự động cập nhật ngay lập tức.
- **Dễ dàng dùng Custom SVG hoặc thư viện khác**: Bạn có thể thay thế bất kỳ icon nào bằng component SVG tự thiết kế mà không cần sửa code component gọi nó.

---

## 2. Cách đổi Icon cho một nút bất kỳ

Mở file [`client/src/icons/index.js`](file:///d:/SL-Meet/client/src/icons/index.js):

### Ví dụ 1: Đổi icon Mic sang một icon khác từ `lucide-react`
```javascript
// Trước đây:
import { Mic } from 'lucide-react';
export const MicOnIcon = Mic;

// Muốn đổi sang Mic2:
import { Mic2 } from 'lucide-react';
export const MicOnIcon = Mic2;
```

### Ví dụ 2: Dùng thư viện ngoài (ví dụ Font Awesome cho Camera On/Off)
```javascript
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo, faVideoSlash } from '@fortawesome/free-solid-svg-icons';

export const CameraOnIcon = (props) => <FontAwesomeIcon icon={faVideo} {...props} />;
export const CameraOffIcon = (props) => <FontAwesomeIcon icon={faVideoSlash} {...props} />;
```

### Ví dụ 3: Đổi icon bất kỳ sang file SVG tùy chỉnh (Custom SVG)
```javascript
export const MicOnIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    {/* SVG path của bạn */}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="..." />
  </svg>
);
```

---

## 3. Cách sử dụng trong các Component

Có 2 cách sử dụng:

### Cách 1: Named Import (Khuyên dùng)
```javascript
import { MicOnIcon, MicOffIcon, CaptionsIcon } from '@/icons'; // hoặc '../../icons'

function MyControl() {
  return (
    <button>
      <MicOnIcon className="w-5 h-5 text-white" />
    </button>
  );
}
```

### Cách 2: Namespace `AppIcons`
```javascript
import { AppIcons } from '@/icons';

function MyControl() {
  return (
    <button>
      <AppIcons.MicOn className="w-5 h-5" />
      <AppIcons.Captions className="w-5 h-5" />
    </button>
  );
}
```

---

## 4. Danh mục nhóm Icon chuẩn hóa

1. **Meeting Controls**: `MicOnIcon`, `MicOffIcon`, `CameraOnIcon`, `CameraOffIcon`, `ScreenShareIcon`, `EndCallIcon`, `PinIcon`, `UnpinIcon`, `TiledLayoutIcon`, `SidebarLayoutIcon`, `SpotlightLayoutIcon`, `MoreOptionsIcon`, `CheckmarkIcon`
2. **AI & Vision**: `CaptionsIcon`, `HandTrackingOnIcon`, `HandTrackingOffIcon`, `SignGestureIcon`, `AiTranslateIcon`, `TextFontIcon`, `TextAlignLeftIcon`
3. **Navigation & Drawers**: `ChatDrawerIcon`, `ParticipantsDrawerIcon`, `CloseIcon`, `SearchIcon`, `SendIcon`, `SettingsIcon`, `TranscriptFileIcon`, `DownloadTranscriptIcon`, `ResetSettingsIcon`, `BackNavIcon`, `LeaveRoomIcon`
4. **Status & Alerts**: `LoadingSpinnerIcon`, `AlertWarningIcon`, `AlertErrorIcon`, `SuccessCheckIcon`, `TimestampClockIcon`, `VolumeIcon`
5. **Users & Security**: `UserAvatarIcon`, `HostShieldIcon`, `ModerationKickIcon`, `RoleAssignedIcon`, `PasswordLockIcon`, `EmailIcon`
