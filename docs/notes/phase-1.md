# Phase 1 — PRD-0 + Test Contract v1.0: giả định & tiêu chí nghiệm thu

Nguồn: lab board tab Phase 1 (PRD-0, Test Contract v1.0). Tuning thật nằm ở `src/tuning.js`; `game.contract.json` phải khớp (test `contract.test.mjs` kiểm).

## 1. Quyết định kiến trúc

| Quyết định | Lý do |
|---|---|
| Three.js + Vite (cửa sổ), Node (headless) | Chạy trên macOS/Linux không cần Docker; bản phát hành là web tĩnh |
| `src/sim.js` là logic thuần, không import DOM/three | Contract đòi headless và cửa sổ dùng chung logic 60 Hz |
| RNG `mulberry32(seed)` tự viết, timer tính bằng **số tick nguyên** | Tất định byte-identical; không dùng `Math.random()` / đồng hồ thật |
| Test bằng `node:test` (có sẵn trong Node) | Không thêm dependency; `npm test` một lệnh |

## 2. Giả định (chỗ PRD-0 mơ hồ)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A1 | "Ánh sáng" pulse tiêu tốn là gì | = đom đóm đang mang. Pulse cần `carried ≥ pulse_cost`, không đủ thì không có gì xảy ra (không event) |
| A2 | Pulse khi đang cooldown | Bỏ qua, không event, không tốn |
| A3 | Pulse không trúng bóng nào | Vẫn tốn và vẫn có event `pulse` với `stunned_ids: []` |
| A4 | Nhặt đom đóm | Tự động khi trong `pickup_radius` và `carried < carry_capacity`; điểm `per_mote` cộng lúc nhặt |
| A5 | Đổ vào đèn | `interact` (false→true) đổ vào đèn **chưa thắp gần nhất** trong `interact_radius`; lượng = `min(carried, lantern_cost − deposited)` |
| A6 | Bóng sợ đèn | Bóng không vào được `safe_radius` quanh **mọi** đèn (đọc đúng chữ contract: "around a lantern"), bị đẩy ra mép |
| A7 | Bị đánh | Mất 1 flame, rơi `floor(carried × hit_drop_ratio)` đom đóm (mất luôn), bất tử `invuln_s` |
| A8 | Rơi khỏi đảo | Không có (`fall_enabled: false`): Mây bị chặn ở mép đảo bán kính 40 m |
| A9 | Thua | Hết flames (`no_flames`) hoặc hết giờ đêm (`dawn`) |
| A10 | Thưởng cuối | Chỉ khi thắng: `per_second_left × floor(time_left_s)` + `per_flame_left × flames` |
| A11 | Bóng mặc định | Không có bóng lúc đầu; bóng xuất hiện ở mép đảo lúc 5 s, rồi mỗi 20 s, tối đa 4 con (`shade_spawned`) |
| A12 | Đom đóm mặc định | 30 con rải ngẫu nhiên theo seed (4–37 m từ tâm); còn `random_motes` thì cứ 3 s hồi 1 con nếu < 30 |
| A13 | Vị trí đèn | 5 đèn trên vòng 25 m: `L1` ở (0,0,25), các đèn sau cách 72° |
| A14 | Bóng | Trạng thái `chase` (đuổi thẳng theo XZ) hoặc `stunned`; tâm ở y = 1 m |
| A15 | Nhảy | Vận tốc 7 m/s, trọng lực 20 m/s²; chỉ đổi `pos[1]`, khoảng cách đo XZ nên nhảy không né bóng |
| A16 | Scenario có `lit: true` hoặc `deposited ≥ lantern_cost` | Đèn coi như đã thắp, không cộng điểm, không event |
| A17 | Lỗi CLI (thiếu cờ, `--night` ≠ 1) | Exit 1 + stderr. File inputs/scenario sai → exit 2 |
| A18 | `move` ngoài [−1,1] | Coi là file sai → exit 2 |

## 3. Thứ tự trong một bước (step k → state k+1)

1. Giảm timer (bất tử, cooldown pulse).
2. Đọc input tick k, tính cạnh false→true.
3. Di chuyển + nhảy, chặn mép đảo.
4. Nhặt đom đóm.
5. Interact → deposit → lantern_lit → nếu đủ 5: `game_over won all_lit`.
6. Pulse.
7. Bóng: hết choáng → chase; di chuyển; đẩy ra khỏi `safe_radius`.
8. Va chạm → `player_hit` → nếu hết flames: `game_over lost no_flames`.
9. Sinh bóng / hồi đom đóm.
10. Hết giờ → `game_over lost dawn`.

## 4. Tiêu chí nghiệm thu (làm A thấy B) → scenario

| ID | Tiêu chí | Kiểm bằng |
|---|---|---|
| R1 | Đi `move [0,1]` 60 tick ở yaw 0 → z = 6.0 (`player_speed`) | `tests/sim.test.mjs` |
| R2 | Yaw 90° + `move [0,1]` → đi theo +X | test |
| R3 | Đứng cạnh đom đóm → `mote_picked`, `carried` +1, score +10 | test + `scenarios/pickup.json` |
| R4 | Đầy túi thì không nhặt thêm | test |
| R5 | Interact cạnh đèn → `deposit` → đủ 4 thì `lantern_lit`, +100 | test |
| R6 | Thắp đủ 5 → `game_over won all_lit` + thưởng | test |
| R7 | Bóng chạm → `player_hit`, mất flame, rơi đom đóm, bất tử | test |
| R8 | Hết flames → `lost no_flames`; hết giờ → `lost dawn` | test |
| R9 | Pulse → bóng trong bán kính `stunned`, bị đẩy, tốn, cooldown | test |
| R10 | Bóng không vào `safe_radius` của đèn | test |
| R11 | Dựng scenario không sinh event, không cộng điểm | test |
| R12 | Output: snapshot tick 0 + mỗi N tick, event `tick = k+1`, dòng `end` cuối | `tests/headless.test.mjs` |
| R13 | Cùng seed/scenario/inputs → giống từng byte | test (chạy 2 lần) |
| R14 | File inputs/scenario sai → exit 2 + stderr | test |
| R15 | `game.contract.json` tuning khớp `src/tuning.js` | `tests/contract.test.mjs` |
| R16 | Cửa sổ chơi được: di chuyển, nhảy, camera, HUD, thắng/thua, chơi lại | chơi tay + ảnh `docs/proof/phase-1/` |
