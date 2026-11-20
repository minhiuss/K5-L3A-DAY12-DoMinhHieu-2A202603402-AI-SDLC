# Phase 2 — bảng bằng chứng (Ticket-02, Test Contract v1.1)

Sinh lại: `npm run proof -- 2` (file trong [`phase-2/`](phase-2/)). ID theo [`docs/notes/phase-2.md`](../notes/phase-2.md). Máy: [`machine.txt`](phase-2/machine.txt).

## Phần 1–2: số chuẩn, thứ tự tick, bản đồ (headless, test tự động)

| ID | Yêu cầu | Cách kiểm | Kết quả |
|---|---|---|---|
| R1–R11 | Luật Phase 1 với số chuẩn (hồi quy) | `tests/sim.test.mjs` (sửa test kèm lý do, xem phase-2.md §1) | Đạt |
| R15 | `contract_version` 1.1, tuning khớp số chuẩn + khoá dash/night2/night3 | `tests/contract.test.mjs` | Đạt |
| P1 | Lướt 14 m/s × 12 tick, hồi 90 tick, đứng yên theo hướng mặt, trên không giữ độ cao | `tests/v11.test.mjs` | Đạt |
| P2 | Rơi Y < −10: 1 lần, −1 lửa, mất hết, chờ 60, hồi sinh, bất tử 90; hết lửa thì thua ngay | test | Đạt |
| P3 | Đom đóm rơi vành 1.5–2.5 m, TTL 480, nhặt lại; bóng recoil 2 m / 60 tick | test | Đạt |
| P4 | Tỏa Sáng 3/5 m (3D)/3 s, choáng 120, đẩy 4 m/15 tick, +5, pulse lại làm mới; lịch sinh bóng 300 + 480k | test | Đạt |
| P5 | Vùng an toàn chỉ của đèn sáng, đẩy ra ≤ 30 tick, không gây sát thương | test | Đạt |
| P6 | Gió Lạc idle→chase→cướp→flee→removed; Tỏa Sáng làm flee/thả đồ | test (có kiểm cả tick cướp = 42) | Đạt |
| P7 | Bùa Gió 600 tick, 7.2 m/s, lướt không hồi chiêu, xuất hiện lại sau 2700 | test | Đạt |
| P8 | Pause: tick tăng, sim_tick đứng, `paused`/`resumed` | test sim + test headless | Đạt |
| P9 | Đêm 2: bục nhảy sang đảo B (~1.4 s), cầu đi được, ngoài cầu rơi | test | Đạt |
| P10 | Đêm 3: vách chặn, dốc 30° lên tầng 1, bục (0,3,13) lên tầng 2, gió (báo trước 2 s, 2 m/s) | test | Đạt |
| P11 | Thắng xét sau tick, kể cả đúng tick hết giờ | test | Đạt |
| P12 | Snapshot/scenario/input v1.1 đủ trường; `--night 2/3` | test headless + [run-night2](phase-2/run-night2-seed42.jsonl), [run-night3](phase-2/run-night3-seed42.jsonl) | Đạt |
| P13 | 1 Đêm 21.600 tick ≤ 30 s | test + [determinism.txt](phase-2/determinism.txt) (Đêm 3, snapshot mỗi tick: ~0.6 s) | Đạt |
| — | Tất định byte-identical | [determinism.txt](phase-2/determinism.txt) (sha256 trùng) | Đạt |
| — | Test có đỏ được không | [mutation-check.txt](phase-2/mutation-check.txt): M1 bị bắt; M2 lần đầu **không** bị bắt → đã sửa test P6 → bị bắt | Đạt (sau khi sửa test) |

Tổng: `npm test` **45/45** ([test-report.txt](phase-2/test-report.txt)).

## Phần 3: phần chỉ nhìn mới thấy (chạy trong trình duyệt)

| Yêu cầu | Bằng chứng | Kết quả |
|---|---|---|
| Menu chính, chọn Đêm, cài đặt | [01-menu](phase-2/01-menu.jpg) | Đạt |
| HUD đúng bố cục: lửa trên trái, đồng hồ trên giữa (đỏ + nhấp nháy ≤ 30 s), đèn k/n + điểm trên phải, thanh 10 ô dưới giữa, Lướt/Tỏa Sáng dưới phải, mũi tên tới đèn gần nhất | [02-hud-night1](phase-2/02-hud-night1.jpg), [07-night2-lit-lantern](phase-2/07-night2-lit-lantern.jpg) | Đạt (màu đỏ ≤ 30 s: kiểm bằng class CSS, chưa có ảnh) |
| Nhắc "E — Nạp ánh sáng (x/10)" | `src/main.js` `drawHud`; kiểm bằng `__advance` khi đứng cạnh đèn | Đạt |
| Chuỗi Đêm: thắng Đêm 1 → kết quả (948 điểm = 100 + 100 + 2×299 + 150) → giới thiệu Đêm 2 (lời Ông Đăng) → chơi | [03-night1-won](phase-2/03-night1-won.jpg) | Đạt |
| Bản đồ Đêm 2 / Đêm 3 dựng đúng chuẩn | [04-night2-map](phase-2/04-night2-map.jpg), [05-night3-map](phase-2/05-night3-map.jpg) | Đạt |
| Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu; tick tăng 30, sim_tick đứng yên | [06-pause-menu](phase-2/06-pause-menu.jpg) | Đạt |
| Cài đặt lưu giữa các lần mở | đặt âm lượng 0.35, độ nhạy 1.6 → tải lại → `localStorage` = `{"volume":0.35,"sensitivity":1.6}` | Đạt |
| Âm thanh: nhạc nền + hiệu ứng nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, bóng xuất hiện, đếm ngược 10 s | `src/view/audio.js` (Web Audio, tự tổng hợp) | **Chưa kiểm bằng tai**: pane trình duyệt không phát âm thanh ra ngoài; chỉ chắc là code chạy không lỗi |
| Bảng màu chuẩn (±10%) | `src/view/palette.js`, mọi vật liệu được liệt kê đều lấy từ đây | Đạt cho màu gốc của vật liệu; màu trên màn hình còn đổi theo ánh sáng/tone mapping |
| Ánh sáng môi trường = 0.15 + 0.55 × (đèn sáng / tổng) | `hemi.intensity` trong `sync()` | Đạt |
| ≥ 30 FPS ở 1280×720 | `__benchSync(300)`, AMD Radeon 890M, bloom bật: Đêm 1 **4.15 ms** (≈241), Đêm 2 **4.71 ms** (≈212), Đêm 3 **4.56 ms** (≈219); 195–234 draw call | Đạt (đo trong pane, xem giới hạn ở [visual.md](visual.md)) |

## Chưa đạt / giới hạn (ghi trung thực)

- Âm thanh chưa được nghe thử thật (xem trên).
- Chưa chơi trọn 3 Đêm bằng tay từ đầu tới cuối. Chuỗi màn hình được kiểm bằng `__advance` (chạy sim qua đúng đường của game) và đặt trạng thái qua console.
- Màn Bình Minh (thắng Đêm 3) chưa có ảnh. Code ở `showResult`.
