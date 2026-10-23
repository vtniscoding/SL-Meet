# 🎨 SL-Meet Standardized Color & Theme System (`src/theme/`)

Tài liệu quy chuẩn bảng màu và quy tắc thiết kế giao diện (Design System Tokens) của **SL-Meet**.

---

## 1. Nguyên tắc cốt lõi (Design Philosophy)

Ứng dụng **SL-Meet** có 2 không gian trải nghiệm chính với ngôn ngữ màu sắc riêng biệt:

1. **Brand Identity (Màu chủ đạo toàn app)**:
   - Màu xanh da trời tươi sáng **`#5CA0F2`** (Sky Blue).
   - Dùng cho các nút hành động chính (Primary CTA), Logo, liên kết, highlight thương hiệu.

2. **Meeting Room (Google Meet Dark Ecosystem)**:
   - Phòng họp trực tuyến tuân thủ chuẩn thẩm mỹ Google Meet Dark Theme (`#202124` / `#3C4043`).
   - Tối ưu độ tập trung cho người khiếm thính và người nói, tránh mỏi mắt và làm nổi bật khung hình cử chỉ tay.

3. **Dashboard / Portal (Material Light Theme)**:
   - Không gian tiền sảnh, trang chủ và dashboard quản lý sử dụng nền sáng sạch sẽ (`#F8FAFC`).
   - Ô nhập mã phòng dạng viên thuốc (Pill) chuẩn Material 3 (`#E9EEF6`) với nút Join xanh dương (`#0B57D0`).

---

## 2. Bảng mã màu chuẩn hóa (Standard Color Tokens)

| Nhóm | Token Name | Hex Code | Công dụng / Vị trí hiển thị |
| :--- | :--- | :--- | :--- |
| **Brand** | `brand.primary` | `#5CA0F2` | Nút "New", "Sign In", badge chính, thương hiệu |
| | `brand.hover` | `#4A8FE0` | Trạng thái hover của nút brand |
| | `brand.active` | `#3B7ECE` | Trạng thái pressed / active của brand |
| | `brand.subtle` | `#EBF3FD` | Nền nhạt cho chip, tag, pill thông tin |
| **Room Dark** | `room.bg` | `#121212` | Nền sân khấu video toàn phòng họp |
| | `room.surface` | `#202124` | Thanh điều khiển `MeetingControlBar`, nền Drawers, Modals |
| | `room.subtle` | `#28292C` | Menu popover 3-dots, dropdown layout |
| | `room.button` | `#3C4043` | Nút điều khiển trạng thái bình thường (Mic, Cam, Layout) |
| | `room.buttonHover` | `#474B4F` | Hover trên nút điều khiển phòng |
| | `room.active` | `#8AB4F8` | Trạng thái nút BẬT (Captions ON, Screen Share ON) |
| | `room.activeText` | `#202124` | Màu chữ tương phản trên nền xanh `#8AB4F8` |
| | `room.danger` | `#EA4335` | Tắt Mic, Tắt Cam, Nút đỏ Rời phòng họp (End Call) |
| | `room.dangerHover` | `#D93025` | Hover trên nút đỏ |
| **Dashboard** | `dashboard.bg` | `#F8FAFC` | Nền trang Dashboard người dùng |
| | `dashboard.pillBg` | `#E9EEF6` | Nền viên thuốc của ô nhập mã họp (Enter Code Pill) |
| | `dashboard.pillSubmit` | `#0B57D0` | Nút "Join" khi đã nhập mã (Google Blue) |
| | `dashboard.pillSubmitHover` | `#0842A0` | Hover trên nút Join |
| **Vai trò (Roles)** | `role.signer` | `#5CA0F2` | Tag/Badge vai trò Người dùng Ký hiệu (Signer) |
| | `role.speaker` | `#10B981` | Tag/Badge vai trò Người nói (Speaker) |

---

## 3. Cách sử dụng

### Cách 1: Sử dụng qua Tailwind CSS Class (Khuyên dùng)
Tailwind đã được cấu hình sẵn các lớp semantic tương ứng:

```jsx
// 1. Nút Brand Primary (VD: Nút New, nút Sign In):
<button className="bg-brand-primary hover:bg-brand-hover text-white">
  New
</button>

// 2. Nút điều khiển phòng họp Google Meet:
<button className="bg-room-btn hover:bg-room-btn-hover text-slate-200">
  Normal Control
</button>

// 3. Nút kích hoạt tính năng (Active):
<button className="bg-room-active text-room-surface">
  Captions ON
</button>

// 4. Nút tắt âm / Rời phòng:
<button className="bg-room-danger hover:bg-room-danger-hover text-white">
  End Call
</button>

// 5. Ô nhập mã phòng họp:
<div className="bg-dash-pill rounded-full">
  <input className="bg-transparent" />
  <button className="bg-dash-submit hover:bg-dash-submit-hover text-white">
    Join
  </button>
</div>
```

### Cách 2: Import trực tiếp JS Object trong React Component
```javascript
import { brandColors, roomColors, dashboardColors } from '@/theme';

const myStyle = {
  backgroundColor: brandColors.primary,
  color: '#ffffff',
};
```

---

## 4. Quy tắc phát triển (Developer Rules)

1. **Tuyệt đối không tự ý đổi tone màu chính**:
   - Nút hành động chính của SL-Meet luôn dùng màu thương hiệu **`#5CA0F2`** (`bg-brand-primary`).
   - Không tự ý đổi sang các màu lạ (xanh lá, tím, vàng...) nếu không có chỉ định rõ ràng từ người dùng.
2. **Không phá vỡ chuẩn Google Meet Dark Theme trong phòng họp**:
   - Thanh điều khiển trung tâm luôn giữ nền `#202124` và các nút `#3C4043` / `#EA4335`.
3. **Khi cần thêm màu mới**:
   - Thêm token vào [`client/src/theme/colors.js`](file:///d:/SL-Meet/client/src/theme/colors.js) và khai báo thêm trong `tailwind.config.js`.
