# ADR-002 — Model Mây (Tripo) và "chế độ sáng tạo" tách khỏi luật chuẩn (Phase 4)

- **Trạng thái:** Đã chấp nhận, 2026-11-20
- **Bối cảnh:** Người học đưa một model Mây đã rig (Tripo, ~2 triệu tam giác, 41 xương, không có animation) và muốn: lướt = lộn vòng (barrel roll), kỹ năng bắn tên (Q), chạy nhanh bẩm sinh, camera kiểu TPS theo chuột. Ticket-04 cho phép sáng tạo **chỉ khi** luật, số liệu, Test Contract và đầu ra headless không đổi, và phải tắt trong bench/soak.

## Quyết định
1. **Model là phần hiển thị:** `src/view/may.js` tải `public/assets/may.glb` (meshopt), thêm nón lá + đèn lồng nhỏ lên xương `Head` (PRD-0: Mây đội nón có đèn treo), khăn đỏ ở cổ (palette #C8102E). Animation viết bằng code: xoay xương đùi/cẳng chân/tay quanh trục của rig (đi, chạy, nhảy, thở, giương cung), lộn 360° quanh trục tiến trong 0.2 s khi lướt. Không có luật nào nằm trong view.
2. **Lướt = barrel roll chỉ là hình ảnh.** Luật lướt (14 m/s, 0.2 s, hồi 1.5 s) giữ nguyên trong sim.
3. **Bắn tên + chạy nhanh nằm trong sim nhưng sau cờ `opts.creative`** (`createGame(seed, scenario, night, { creative: true })`). Chỉ cửa sổ game bật cờ này (cài đặt "Kỹ năng sáng tạo", mặc định bật). `headless.mjs`, `soak.mjs` và cảnh bench **không bao giờ** bật → đầu ra headless giống từng byte như trước (test B2 + toàn bộ test v1.0–v1.2 vẫn xanh).
   - Bắn tên: tia theo hướng camera, xa 25 m, rộng 1 m, làm bóng đầu tiên trúng choáng 60 tick, hồi 1 s, không tốn đom đóm, không cộng điểm.
   - Chạy nhanh: chạy liên tục 1.5 s thì tốc độ ×1.25 (không áp dụng khi có Bùa Gió).
4. **Camera TPS:** khoá chuột (Pointer Lock) khi bấm vào màn chơi; chuột xoay yaw + pitch; `cam_yaw_deg` gửi vào sim giống hệt như trước nên hướng đi theo camera như contract quy định.

## Hệ quả / rủi ro
- **Chạy nhanh đổi cảm giác di chuyển** so với "số liệu chuẩn" của Ticket-02 khi chơi cửa sổ. Vì vậy có công tắc trong Cài đặt; tắt đi là game đúng 100% số chuẩn. Ghi rõ trong README.
- **Màu áo của model** (xanh lá theo texture Tripo) lệch bảng màu chuẩn "Áo Mây #E8E2D0". Khăn đỏ đã đúng màu. Ghi trong bằng chứng là chưa đạt.
- **Hiệu năng:** model ~2 triệu tam giác. Bench trên máy dev vẫn ~238 fps, nhưng trên máy yếu đây là chi phí lớn nhất. Hướng giảm: chạy `gltfpack -si 0.1` để giảm lưới (cần người học tự chạy; công cụ npx bị chặn trong phiên AI).
- Bóng Mực chuyển sang InstancedMesh (6 draw call cho mọi số lượng) để chịu cảnh 200 bóng.
