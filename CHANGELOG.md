# Changelog

## [phase-3] — 2026-11-20 — Ticket-03 "Đèn cạn dầu", Test Contract v1.2

### ⚠ Breaking changes
- **Không còn thắng sớm.** Thắp hết đèn không kết thúc Đêm. `game_over.reason` **bỏ `all_lit`**, thêm `dawn_survived`. Thắng = còn sống ở tick bình minh với ≥ ceil(0.6 × số đèn) đèn đang sáng (3/5, 4/6, 5/7).
- **Thời lượng Đêm:** 300/330/360 → **240/270/300** s (`night{1,2,3}_duration_s`).
- **Điểm (thay toàn bộ):** đom đóm nạp +10 → **+5** (tính cả châm dầu); thắp lại **+40**; Tỏa Sáng trúng bóng đang hút **+15**; thưởng thời gian **bỏ** (`per_second_left` 2 → 0); bình minh (thắng) +50 + floor(fuel) mỗi đèn sáng + 50 mỗi Ngọn Lửa.
- **Đèn có thể tắt:** đèn sáng hao 1 fuel/s; hết dầu thì `lantern_out`, `lit: false`, `deposited: 0`. Đèn đã sáng nhận châm dầu (event mới `refuel`) thay vì bị bỏ qua.
- **Vùng an toàn chỉ khi fuel ≥ 30** (trước: mọi đèn đã sáng).
- **Bóng Mực `wander` không còn đứng yên:** đi tới đèn yếu (rồi `drain`), không có thì về đèn tắt gần nhất. Hết choáng luôn về `wander` (trước: theo khoảng cách).
- **Sức chứa không cố định:** 10 + 2 × lần thắp thành công trong Đêm, tối đa 20.
- **Contract:** `contract_version` 1.1 → **1.2**. Tuning thêm `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`.

### Added
- Snapshot: đèn có `fuel` (1 chữ số thập phân), `ever_lit`, `relit_count`; `player.capacity`; trạng thái bóng `drain`.
- Scenario: đèn `lit`/`fuel`/`ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`.
- Event: `refuel`, `lantern_out`, `fuel_drain` (mỗi 60 tick khi đang hút); `lantern_lit.relight`.
- View: thanh dầu trên đèn, nhấp nháy 1 Hz khi fuel < 30; đèn tắt xẹp 20% + giấy rách; HUD "đang mang / sức chứa", "đèn sáng k/n (cần m)", nhắc "E — Châm dầu"; cài đặt **Bảng màu dễ phân biệt** (bóng #00B3FF, cảnh báo trắng + ⚠), được lưu.
- Quyết định thiết kế: [`docs/adr/ADR-001-lantern-fuel-and-dawn-win.md`](docs/adr/ADR-001-lantern-fuel-and-dawn-win.md).

## [phase-2] — 2026-11-20 — Ticket-02, Test Contract v1.1
- Số chuẩn, 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Lướt, rơi khỏi đảo, Gió Lạc, Bùa Gió, tạm dừng, gió mạnh, menu/cài đặt/âm thanh, HUD chuẩn, bảng màu chuẩn. Chi tiết: `docs/notes/phase-2.md`.

## [phase-1] — 2026-11-20 — PRD-0, Test Contract v1.0
- Đêm 1 chơi được, chế độ headless, `game.contract.json`.
