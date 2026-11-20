# Phase 2 — Ticket-02 + Test Contract v1.1: giả định & tiêu chí nghiệm thu

Nguồn: [`docs/lab/ticket-02.md`](../lab/ticket-02.md). Số chuẩn nằm ở `src/tuning.js`, bản đồ ở `src/maps.js`. Thứ tự một tick làm **đúng 12 bước của ticket** (`src/sim.js`, mỗi bước có comment đánh số).

## 1. Thay đổi so với Phase 1 (luật bị thay → test cũ sửa kèm lý do)

| Luật Phase 1 | Phase 2 | Test cũ |
|---|---|---|
| Sức mang 5, giá đèn 4, `interact_radius` 2.5 | 10 / 10 / 2.0 | Test dùng `T.*` nên tự theo; kịch bản `win_one_left` đổi carried 4 → 10 |
| Điểm cộng lúc **nhặt** | Cộng **+10 lúc nạp** vào đèn | R3 sửa: nhặt không cộng điểm |
| Vùng an toàn quanh **mọi** đèn (A6) | Chỉ **đèn đã sáng**, bán kính 6, bóng đang trong thì bị đẩy ra trong ≤ 30 tick | R10 sửa: dùng đèn đã sáng + thêm test đèn chưa sáng không chặn |
| Bị đánh: đom đóm rơi là mất | Rơi ra vành 1.5–2.5 m, sống 480 tick, nhặt lại được | R7 sửa |
| Không rơi khỏi đảo (A8, chặn ở mép) | `fall_enabled: true`: Y < −10 là rơi | Test mới |
| Pulse 1 đom đóm / 6 m / 1 s, thưởng 25 | 3 / 5 m (khoảng cách **3D** tới tâm = chân + 0.8 m) / 3 s, thưởng 5 | R9 sửa |
| Thưởng thắng: 1 × giây còn lại | 2 × giây còn lại | R6 sửa |
| Thắng xét ngay lúc thắp đèn cuối | Xét ở bước 11 sau toàn bộ tick | R6 sửa |
| 30 đom đóm ngẫu nhiên | 20 lúc đầu trên 20 điểm sinh, thêm 1 mỗi 240 tick nếu < 30 và còn điểm trống | test mặc định sửa |
| Bóng xuất hiện ở giây 5, rồi mỗi 20 s, tối đa 4 | 2 con ở tick 300, rồi mỗi 480/420/360 tick, tối đa 6/8/10, cách người chơi ≥ 15 m | test mới |
| `contract_version` 1.0 | 1.1 + khoá dash, night2/3 | R15 sửa |

## 2. Giả định (chỗ ticket chưa nói)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | Tăng tốc ≤ 0.1 s | Tức thì (0 s), vẫn thoả ≤ 0.1 s |
| B2 | Trạng thái `wander` | Bóng đứng yên tại chỗ (lơ lửng); vào `chase` khi cách ≤ 12 m (XZ), quay lại `wander` khi > 18 m |
| B3 | `spawning` kéo dài bao lâu | 60 tick: không di chuyển, không gây sát thương |
| B4 | Shade trong scenario không có `state` | `wander` (rồi tự đổi sang `chase` nếu ≤ 12 m ngay tick đầu) |
| B5 | Độ cao của Bóng Mực / Gió Lạc | Lướt trên mặt cao nhất bên dưới: tâm = mặt + 1.0 m (Gió Lạc + 1.2 m); không có mặt (biển mây) thì Y = 1.0 / 1.2. Không bị vách chặn |
| B6 | "Chênh cao" khi chạm / nhặt | Bóng: \|chân Mây − tâm bóng\| ≤ 1.5. Đom đóm / bùa: \|chân Mây − Y của đom đóm\| ≤ 1.5. Gió Lạc: chỉ XZ ≤ 1.2 (ticket ghi vậy) |
| B7 | Tương tác đèn có xét độ cao không | Có: XZ ≤ 2.0 và \|chân − chân cột đèn\| ≤ 1.5 (để đứng tầng 0 không nạp được đèn tầng 1) |
| B8 | Điểm xuất phát Đêm 2 / Đêm 3 | Đêm 2: (0,0,0). Đêm 3: (0,0,−30) vì tâm (0,0,0) nằm trong khối tầng 2 + tháp chuông. Đều quay mặt +Z |
| B9 | Mặt đất và vách | Mỗi tầng là khối đặc. Leo được bậc ≤ 0.25 m (để đi dốc); cao hơn là vách, chặn theo từng trục |
| B10 | Lướt khi đang bay từ bục nhảy | Lướt thay vận tốc ngang trong 12 tick, xong thì vận tốc phóng tiếp tục tới khi chạm đất |
| B11 | Gió mạnh | Cơn k bắt đầu ở sim_tick 1800k, kéo dài 300 tick; báo trước từ 120 tick trước; hướng `floor(rng × 360)`° chọn lúc bắt đầu báo. Đẩy cả khi bay/lướt. `dir_deg` = null khi không có gió và không đang báo |
| B12 | Điểm sương của Gió Lạc | Dùng các điểm sinh Bóng Mực của Đêm đó |
| B13 | Gió Lạc `idle` lượn chậm | Bay 2 m/s về phía một điểm chạy vòng bán kính 4 m quanh chỗ sinh |
| B14 | Gió Lạc đã `removed` | Vẫn nằm trong mảng `drifters` với `state: "removed"`, không tính vào tối đa 2 |
| B15 | `night_start` | Ghi ngay sau snapshot tick 0, `tick: 0` |
| B16 | Snapshot `player.invuln` | Boolean (đang bất tử hay không). `dash_cd_s`, `pulse_cd_s`, `charm_s` là giây còn lại |
| B17 | Rơi khi đang trong 60 tick chờ | Không nhặt, không bị chạm, không di chuyển, vị trí giữ nguyên chỗ rơi |
| B18 | Đom đóm rơi ra vành 1.5–2.5 m | Góc và bán kính lấy từ RNG có seed; Y = mặt đất ở đó (không có thì Y chân Mây) |
| B19 | Điểm trống khi sinh đom đóm | Điểm sinh không có đom đóm `random` nào đứng trên |
| B20 | Trần 30 đom đóm | Tính cả đom đóm `random` và `dropped` đang có |
| B21 | Id đom đóm | `M1`, `M2`, … theo thứ tự tạo |

## 3. Tiêu chí nghiệm thu Phần 3 (tính năng mới) → test

| ID | Tiêu chí | Test |
|---|---|---|
| P1 | Lướt: 14 m/s × 12 tick = 2.8 m theo hướng đang đi; đứng yên thì theo hướng mặt; trên không giữ độ cao; hồi 90 tick; có event `dash` | `tests/v11.test.mjs` |
| P2 | Rơi Y < −10: −1 lửa, mất hết, `player_hit {by:"fall", lost}`, chờ 60 tick, hồi sinh ở điểm xuất phát, bất tử 90 tick | test |
| P3 | Bị đánh: rơi floor(n/2) ra vành 1.5–2.5 m, TTL 480, nhặt lại được; bóng chuyển `recoil` lùi 2 m trong 60 tick | test |
| P4 | Tỏa Sáng: 3 đom đóm, 3D ≤ 5 m, choáng 120 tick, đẩy 4 m trong 15 tick, +5 mỗi con | test |
| P5 | Vùng an toàn chỉ của đèn sáng; bóng đang trong bị đẩy ra ≤ 30 tick và không gây sát thương | test |
| P6 | Gió Lạc: idle → chase (mang ≥ 5, ≤ 15 m) → cướp min(3, n) → flee 240 tick → removed; Tỏa Sáng làm nó flee / thả đồ | test |
| P7 | Bùa Gió: nhặt → 600 tick, tốc độ 7.2, lướt không hồi chiêu; xuất hiện lại sau 2700 tick | test |
| P8 | Pause: tick tăng, sim_tick đứng; snapshot `paused`; event `paused`/`resumed` | test |
| P9 | Đêm 2: bục nhảy (20,0,18) đưa Mây sang đảo B; cầu đi được; ngoài cầu thì rơi | test |
| P10 | Đêm 3: vách chặn đi lên tầng; dốc 30° đưa lên tầng 1; bục (0,3,13) lên tầng 2; gió có `wind.active` | test |
| P11 | Thắng/thua xét sau mỗi tick theo đúng thứ tự (thắng kể cả đúng tick hết giờ) | test |
| P12 | Snapshot/scenario/input v1.1 đủ trường; `--night 2/3` chạy | test headless |
| P13 | Một Đêm 21.600 tick chạy ≤ 30 s | test đo thời gian |
| P14 | Chuỗi 3 Đêm, menu, pause, cài đặt (lưu), âm thanh, HUD đúng bố cục, bảng màu chuẩn, ≥ 30 FPS ở 1280×720 | chạy tay + ảnh + `__benchSync` |
