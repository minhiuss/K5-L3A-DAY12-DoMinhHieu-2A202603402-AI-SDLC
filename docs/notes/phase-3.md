# Phase 3 — Ticket-03 "Đèn cạn dầu" + Test Contract v1.2

Nguồn: [`docs/lab/ticket-03.md`](../lab/ticket-03.md). Quyết định thiết kế: [ADR-001](../adr/ADR-001-lantern-fuel-and-dawn-win.md). Breaking changes: [`CHANGELOG.md`](../../CHANGELOG.md).
**Phạm vi:** phase ngắn (30 phút), nên chỉ nâng cấp tối thiểu đủ ticket. Đồ hoạ để sau Phase 4.

## 1. Test cũ bị luật mới làm sai → sửa kèm lý do

| Test | Luật cũ | Luật mới | Sửa |
|---|---|---|---|
| R5 | +10/đom đóm nạp, đèn sáng không nhận thêm | +5/đom đóm; đèn sáng chưa đầy dầu nhận châm | Đổi số điểm; thêm `relight: false` vào `lantern_lit` |
| R6 | Thắp đèn cuối → thắng ngay `all_lit` | Không thắng sớm; thắng ở bình minh `dawn_survived` | Viết lại: thắp đủ không kết thúc Đêm |
| R8 | Hết giờ → `dawn` | Hết giờ mà đèn sáng < ngưỡng → `dawn` | Giữ (0 đèn sáng < 3) |
| R10 | Đèn sáng luôn có vùng an toàn | Chỉ khi fuel ≥ 30 | Đặt fuel 100 rõ ràng; thêm test fuel 29.9 mất vùng |
| P5 | Đẩy bóng ra khi thắp | Giữ, thêm khi châm lên ≥ 30 | Giữ + test châm dầu |
| P11 | Thắp hết đúng tick cuối → thắng | Ngưỡng 60% ở tick cuối | Viết lại theo ngưỡng |
| P12 | Thời lượng 330 / 360 | 270 / 300 | Đổi số |
| R15 | Contract 1.1, score cũ | 1.2, khoá mới, score mới | Đổi số |

## 2. Giả định (chỗ ticket chưa nói)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | "đi về đèn tắt gần nhất như trước" (Phase 2 mình để `wander` đứng yên, B2) | `wander` giờ đi với tốc độ của bóng về đèn sáng yếu gần nhất; không có thì về đèn tắt gần nhất, dừng khi cách ≤ 2 m. Không có đèn tắt thì đứng yên |
| C2 | Đèn đầy dầu `used = 0` | Không là ứng viên, nên E có thể chọn đèn khác xa hơn mà nhận được |
| C3 | `fuel_drain` mỗi 60 tick | Mỗi bóng đếm số tick đang hút; ghi event khi đếm chia hết cho 60. `fuel` = fuel sau bước 2 của tick đó |
| C4 | Bóng `drain` có gây sát thương không | Không (chỉ `wander`/`chase` gây sát thương như trước); Mây vào 6 m thì nó chuyển `chase` |
| C5 | Hết `spawning` / `recoil` | Giữ như Phase 2 (theo khoảng cách); chỉ hết choáng mới bắt buộc về `wander` |
| C6 | Snapshot `deposited` của đèn đang sáng | = giá thắp của lần đó (10 hoặc 5) |
| C7 | `ever_lit` của đèn scenario `lit: true` | Mặc định `true` nếu không ghi |

## 3. Tiêu chí nghiệm thu → test (`tests/v12.test.mjs`)

| ID | Tiêu chí |
|---|---|
| F1 | Đèn sáng hao 1/s: sau 60 tick fuel 99.0; hết dầu → `lantern_out`, `deposited 0`, `ever_lit` true |
| F2 | Châm dầu: `used = min(n, ceil((100 − fuel)/10))`, event `refuel`, +5/đom đóm; đèn đầy không được chọn |
| F3 | Thắp lại tốn 5, +40, `relight: true`, `relit_count` +1 |
| F4 | fuel < 30 mất vùng an toàn; đúng 30 còn |
| F5 | `wander` tới đèn yếu → `drain` ≤ 2 m, hút 5/s cộng dồn, `fuel_drain` mỗi 60 tick; Mây vào 6 m → `chase`; Tỏa Sáng trúng bóng đang hút → +15; hết choáng → `wander` |
| F6 | Châm lên ≥ 30 khi có bóng trong 6 m → đẩy ra ≤ 30 tick, không sát thương |
| F7 | Thắng `dawn_survived` khi ≥ ceil(0.6 n) đèn sáng ở tick cuối, có thưởng 50 + floor(fuel) mỗi đèn + 50 mỗi lửa; thiếu → `dawn`; hết lửa ở tick cuối → `no_flames` |
| F8 | Sức chứa 10 + 2 × lần thắp, tối đa 20; snapshot `player.capacity` |
| F9 | Contract 1.2 + snapshot/scenario/events v1.2 |
| F10 | Chế độ mù màu (lưu), thanh dầu + nhấp nháy < 30, HUD đang mang / sức chứa (chạy tay) |
