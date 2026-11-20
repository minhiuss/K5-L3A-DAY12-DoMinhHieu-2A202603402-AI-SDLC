# Changelog

## [v1.0.1] — 2026-11-20 — chỉ phần hiển thị (luật, số liệu, headless: không đổi)

### Changed
- **Mây có clip animation thật** làm trong Blender: `idle`, `run`, `sprint`, `jump`, `dash` (co gối), `shoot` (giương cung). `src/view/may.js` phát bằng `THREE.AnimationMixer`, cross-fade theo trạng thái; `shoot` là clip additive nên chân vẫn chạy khi bắn; không có clip thì dùng lại cách xoay xương bằng code.
- Clip được ghép vào `public/assets/may.glb` bằng `node art/merge_may_anims.mjs` (lưới/vật liệu giữ nguyên byte). Nguồn: `art/make_may_clips.py` (Blender 5.3 headless).
- Model low-poly (7.3 MB) thay bản 18.7 MB; vật liệu `metalness = 0` (hết "Mây ma"); lướt = lộn về phía trước theo `dashDir`.

### Fixed
- Cây cung trên lưng không còn bị xé khi Mây bước/chạy (gắn cứng vào xương `Spine02` lúc tải).

### Docs
- Chép 3 commit mới của repo gốc vào `docs/lab/` (lịch Phase 3 = 30 phút, Phase 4 = 90 phút; rubric F có 4 điểm sáng tạo); README thêm mục "Sáng tạo của tôi".

### Known issues
- Animation của Mây **chưa đạt** (người học kiểm tay): sẽ sửa ở bản sau.

## [phase-4] / v1.0.0 — 2026-11-20 — Ticket-04 "Bình minh", Test Contract v1.3

### Added
- **Benchmark** `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` (Chromium có cửa sổ qua Playwright, 1280×720, vsync tắt; cảnh chuẩn 200 Bóng Mực / 100 đom đóm / L1–L3 sáng; camera bay vòng 15 s).
- **Soak test** `node --expose-gc soak.mjs --seed 7 --nights 10 --out soak.json`.
- **Bảng xếp hạng cục bộ** (top 10, tên 3–12 ký tự, có tiếng Việt), lưu `data/leaderboard.json` qua `node serve.mjs`; `node serve.mjs --export-leaderboard out.json`.
- **Accessibility:** đổi mọi phím (báo trùng, khôi phục mặc định), phụ đề + mũi tên mép màn hình khi Bóng Mực xuất hiện, gió, 10 s cuối, đèn < 30 dầu; giảm chuyển động; chữ ≥ 18 px và chữ lớn ×1.25.
- **Model Mây** (Tripo, đã rig) + nón lá treo đèn trên xương Head, animation bằng code, lướt = lộn vòng; camera TPS khoá chuột; kỹ năng sáng tạo bắn tên (Q) + chạy nhanh (chỉ cửa sổ, tắt được; [ADR-002](docs/adr/ADR-002-creative-mode-and-may-model.md)).
- Bóng Mực vẽ bằng InstancedMesh (6 draw call cho mọi số lượng).

### Changed (breaking cho người chạy)
- `contract_version` 1.2 → **1.3**; thêm `bench_cmd`, `soak_cmd`. `run_cmd` = `node serve.mjs`; `build_cmd` thêm `npx playwright install chromium`.
- `npm start` = build + `serve.mjs` (thay cho `vite preview`).
- Luật, số liệu, đầu ra headless v1.0–v1.2: **không đổi**.


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
