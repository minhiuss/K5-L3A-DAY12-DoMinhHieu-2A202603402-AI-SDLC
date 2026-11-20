# Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0" + Test Contract v1.3

Nguồn: [`docs/lab/ticket-04.md`](../lab/ticket-04.md). Quyết định: [ADR-002](../adr/ADR-002-creative-mode-and-may-model.md). Bằng chứng: [`docs/proof/phase-4.md`](../proof/phase-4.md).

## 1. Giả định (chỗ ticket chưa nói)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| D1 | "Đêm thứ i dùng seed 7 + i" | i đếm từ 1 → Đêm đầu dùng seed 8, Đêm thứ 10 dùng seed 17 |
| D2 | Input soak: "chọn lại hướng di chuyển" | Hướng là vector đơn vị góc ngẫu nhiên `[cos a, sin a]`, camera yaw 0; mỗi nút chỉ `true` đúng tick được chọn (nên mỗi lần chọn là một cạnh false→true) |
| D3 | `results` soak khi hết giờ mà chưa kết thúc | Luật v1.2 luôn kết thúc ở tick bình minh (`won`/`lost`), nên không có trạng thái thứ ba trong thực tế |
| D4 | RSS soak | `process.memoryUsage().rss` sau `gc()` (chạy với `--expose-gc`) |
| D5 | Bench là bản web | Mở Chromium **có cửa sổ** qua Playwright, viewport 1280×720, cờ `--disable-gpu-vsync --disable-frame-rate-limit` (vsync tắt được) |
| D6 | `peak_mem_mb` cho bản web | RSS cộng dồn của mọi tiến trình con do `bench.mjs` mở (cây tiến trình trình duyệt + server tĩnh), lấy mẫu mỗi 1 s (Windows: working set, mỗi 3 s). Ghi thêm `js_heap_peak_mb` để đối chiếu |
| D7 | `load_ms` | Từ `performance.timeOrigin` của tiến trình `bench.mjs` (tiến trình bắt đầu) tới `Date.now()` ở khung hình đầu tiên của cảnh bench (sau khi tải xong model Mây) |
| D8 | "Mây đứng yên tại (0,0,0)" trong bench | Mây vẫn được vẽ (là nhân vật chính, không phải phần sáng tạo); bóng tới gần không gây sát thương |
| D9 | "Lưu trên đĩa cục bộ" cho game web | `run_cmd` = `node serve.mjs`: server Node phục vụ `dist/` và API `/api/leaderboard` ghi file `data/leaderboard.json` (ghi atomic). `--export-leaderboard` đọc cùng file. Nếu mở bằng server khác không có API, game lưu tạm vào `localStorage` |
| D10 | `seed` của mục bảng xếp hạng | Seed của lượt chơi (`campaignSeed`); Đêm n dùng `campaignSeed + n − 1` |
| D11 | Esc khi đang khoá chuột | Trình duyệt luôn dùng Esc để nhả khoá chuột; game coi việc nhả khoá khi đang chơi là "tạm dừng". Phím tạm dừng đổi được (mặc định P) |
| D12 | "Rung camera" | Thêm rung nhẹ khi bị đánh (chỉ hiển thị); "Giảm chuyển động" tắt cả rung lẫn chớp đỏ |

## 2. Tiêu chí nghiệm thu → bằng chứng

| ID | Tiêu chí | Kiểm bằng |
|---|---|---|
| Q1 | Cảnh bench đúng chuẩn (200 wander, 100 mote, L1–L3 fuel 100, tắt spawn/sát thương/nhặt/hao dầu/kết thúc) | `tests/v13.test.mjs` B1 |
| Q2 | `bench.json` đúng trường + đạt ngưỡng | chạy `npm run bench` → [`bench.json`](../../bench.json) |
| Q3 | Soak 0 crash, `mem_end ≤ 1.2 × mem_start` | test S1 + [`soak.json`](../../soak.json) |
| Q4 | Bảng xếp hạng: tên hợp lệ (có tiếng Việt), top 10, sắp xếp, lưu đĩa, export | test L1–L3 + ảnh |
| Q5 | Đổi phím (mọi hành động), báo trùng, khôi phục mặc định, lưu | chạy tay + ảnh |
| Q6 | Phụ đề: bóng xuất hiện (+ mũi tên mép), gió, 10 s cuối, đèn < 30 | `__advance` + ảnh |
| Q7 | Giảm chuyển động, chữ ≥ 18 px, chữ lớn ×1.25 | CSS `:root { font-size: 18px }`, `body.large` |
| Q8 | Phần sáng tạo (bắn tên, chạy nhanh) không đổi headless | test B2 + toàn bộ test cũ xanh |
| Q9 | README ≤ 3 lệnh, CHANGELOG 4 phase, CREDITS, LICENSE, Release zip | đọc + thử giải nén chạy |
