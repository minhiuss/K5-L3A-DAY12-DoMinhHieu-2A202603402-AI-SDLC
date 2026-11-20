# Phase 3 — bảng bằng chứng (Ticket-03, Test Contract v1.2)

Phạm vi: nâng cấp tối thiểu đủ ticket (phase 30 phút). ID theo [`docs/notes/phase-3.md`](../notes/phase-3.md). `npm test`: **56/56**.

| ID | Yêu cầu | Cách kiểm | Kết quả |
|---|---|---|---|
| DoD | ADR về mô hình trạng thái đèn + luật thắng | [ADR-001](../adr/ADR-001-lantern-fuel-and-dawn-win.md) | Đạt |
| DoD | Changelog breaking changes | [`CHANGELOG.md`](../../CHANGELOG.md) | Đạt |
| DoD | Test cũ bị thay: sửa kèm lý do, không skip | R6, P11, P12, R12, headless R6, R15: mỗi test có comment `REPLACED by Ticket-03` + lý do; bảng trong phase-3.md §1 | Đạt |
| F1 | Hao 1/s, hết dầu → `lantern_out`, `deposited 0`, `ever_lit` | `tests/v12.test.mjs` | Đạt |
| F2 | Châm dầu đúng công thức, +5/đom đóm, đèn đầy không được chọn | test | Đạt |
| F3 | Thắp lại 5 đom đóm, +40, `relight: true`, `relit_count` | test | Đạt |
| F4 | fuel < 30 mất vùng; **đúng 30** còn vùng | test F4 + F4b (biên) | Đạt |
| F5 | `wander` → đèn yếu → `drain` ≤ 2 m, hút 5/s cộng dồn, `fuel_drain` mỗi 60 tick, Mây ≤ 6 m → `chase`, +15 khi Tỏa Sáng trúng bóng đang hút, hết choáng → `wander` | test | Đạt |
| F6 | Châm lên ≥ 30 → đẩy bóng ra ≤ 30 tick, không sát thương | test | Đạt |
| F7 | Thắng `dawn_survived` theo ngưỡng 60% + thưởng; thiếu → `dawn`; hết lửa → `no_flames` | test (cả Đêm 3 cần 5/7) | Đạt |
| F8 | Sức chứa 10 + 2 × lần thắp, tối đa 20; scenario không tính | test | Đạt |
| F9 | Contract 1.2 + snapshot/scenario/event v1.2 | `contract.test.mjs`, `headless.test.mjs`, F9 | Đạt |
| — | Test có đỏ được không | [mutation check](phase-3-mutation-check.txt): M3 (biên 30) lần đầu **không** bị bắt → thêm F4b → bị bắt; M4 bị bắt | Đạt (sau khi sửa) |
| F10 | HUD đang mang/sức chứa, đèn sáng k/n (cần m), cảnh báo ⚠ trắng ở chế độ mù màu, bóng viền #00B3FF | [ảnh](phase-3/01-colorblind-hud.jpg) + đọc DOM qua `__advance` | Đạt |
| F10 | Thanh dầu, nhấp nháy 1 Hz khi < 30, đèn tắt xẹp 20% + giấy rách | `src/view/models.js`, `sync()` | **Đạt một phần**: code có, chưa chụp ảnh riêng thanh dầu / đèn tắt |

## Chưa đạt / giới hạn
- Chưa chơi tay trọn một Đêm theo luật mới; đồ hoạ mới (model của người học) để sau Phase 4.
- Âm thanh cho `lantern_out` / `refuel` dùng lại hiệu ứng có sẵn.
