# TICKET-03 — Change Request "Đèn cạn dầu" (Phase 3)

> Nguồn: lab board tab Phase 3, người học dán vào ngày 2026-11-20. Loại: Change Request (thay đổi luật cốt lõi) · Ưu tiên: Rất cao · Tag nộp: `phase-3` · Contract: **v1.2**

## Vì sao thay đổi
Playtest cho thấy người chơi giỏi thắp hết đèn trong 2 phút rồi game kết thúc, nên cuối Đêm thiếu căng thẳng. Nhà thiết kế quyết định: đèn thắp rồi vẫn có thể tắt; mục tiêu chuyển từ "thắp hết" sang "giữ đảo sáng tới bình minh".

Các luật cũ bị thay được đánh dấu **[THAY THẾ]**. Phải ghi quyết định thiết kế (ADR ngắn) và cập nhật test. Phần sáng tạo cũ được giữ, miễn không đổi luật, số liệu, Test Contract và đầu ra headless. Chỗ nào xung đột với luật mới thì theo luật mới.

## 1. Nhiên liệu đèn — [THAY THẾ] luật "đèn đã sáng không nhận thêm đom đóm"

| Quy tắc | Giá trị |
|---|---|
| Nhiên liệu tối đa | 100 |
| Khi vừa thắp (lần đầu hoặc thắp lại) | fuel = 100 |
| Hao hụt khi đang sáng | 1.0 đơn vị/giây (1/60 mỗi tick) |
| Châm dầu | Bấm Tương tác ở đèn đang sáng: `used = min(đang mang, ceil((100 − fuel) / 10))`, `fuel = min(100, fuel + 10 × used)`, trừ `used` đom đóm. Đèn đầy dầu (`used = 0`) không được chọn, không phát sự kiện, không cộng điểm |
| Chọn đèn khi tương tác | Chỉ xét đèn nhận được (chưa sáng, hoặc sáng mà chưa đầy dầu); gần nhất, bằng nhau thì id nhỏ hơn |
| Độ chính xác | Nên tính dầu theo đơn vị nguyên 1/60; chỉ làm tròn khi xuất ra |
| Hết dầu (fuel ≤ 0) | Đèn tắt, `deposited = 0`, phát `lantern_out`, ánh sáng môi trường giảm theo. Đèn nhớ `ever_lit = true` |
| Thắp lại | Đèn từng sáng chỉ cần 5 đom đóm; đèn chưa từng sáng vẫn cần 10 |
| Hiển thị | Thanh dầu trên đèn đang sáng; khi fuel < 30 thì đèn và thanh dầu nhấp nháy chậm (1 Hz) |

## 2. Bóng Mực hút dầu — [THAY THẾ] "Bóng Mực không bao giờ vào vùng an toàn"
- Đèn có fuel < 30 mất vùng an toàn. Đúng 30 vẫn còn vùng.
- Chỉ Bóng Mực `wander` mới chọn đèn yếu: đi tới đèn sáng có fuel < 30 gần nhất (bằng nhau thì id nhỏ hơn). Không có thì đi về đèn tắt gần nhất như trước. Bóng đang `chase` không đổi mục tiêu.
- Cách đèn đó ≤ 2 m (XZ): sang trạng thái mới `drain`, đứng yên và hút 5 fuel/giây (5/60 mỗi tick). Nhiều con thì cộng dồn. Đèn vẫn tự hao 1/giây.
- Từ `drain`: sang `chase` nếu Mây vào trong 6 m; sang `stunned` nếu trúng Tỏa Sáng; sang `wander` nếu đèn tắt, nếu fuel được châm lên ≥ 30, hoặc nếu cách đèn > 2 m.
- Hết choáng thì về `wander`.
- Đèn được châm lên ≥ 30 lúc có Bóng Mực trong vùng 6 m: các con đó bị đẩy ra mép vùng trong tối đa 30 tick và không gây sát thương lúc đó (giống khi đèn vừa thắp).

## 3. Luật thắng mới — [THAY THẾ] "thắng ngay khi tất cả đèn sáng"

| Quy tắc | Giá trị mới |
|---|---|
| Thời gian Đêm 1 / 2 / 3 | 240 / 270 / 300 s |
| Thắng | Còn sống khi hết giờ và số đèn đang sáng ở tick cuối ≥ ceil(0.6 × tổng đèn): Đêm 1 cần 3/5, Đêm 2 cần 4/6, Đêm 3 cần 5/7 |
| Không còn thắng sớm | Thắp đủ đèn không kết thúc Đêm |
| Thua | Hết Ngọn Lửa (ngay, kể cả tick cuối) · hoặc hết giờ mà số đèn sáng dưới ngưỡng |
| Lý do kết thúc | Thắng: `dawn_survived` · Thua: `dawn` hoặc `no_flames` |
| Thứ tự trong tick | Như Ticket-02, thêm: ở bước 2 trừ dầu (hao + bị hút); ngay sau bước 2, đèn có fuel ≤ 0 tắt. Xét thắng/thua sau mọi cập nhật của tick, kể cả tick bình minh; hết Ngọn Lửa luôn thua `no_flames` trước |

## 4. Sức chứa tăng dần (mới)
Sức chứa = 10 + 2 × `successful_lights`, tối đa 20. `successful_lights` = số lần thắp thành công trong Đêm (kể cả thắp lại; đèn đặt sẵn bằng scenario không tính). Đặt lại về 0 đầu mỗi Đêm. HUD hiện đang mang / sức chứa.

## 5. Điểm mới — [THAY THẾ] toàn bộ công thức điểm cũ

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp mới, thắp lại hoặc châm dầu) | +5 |
| Thắp lần đầu | +100 |
| Thắp lại | +40 |
| Bóng Mực trúng Tỏa Sáng | +5 mỗi con; +15 nếu ngay trước đó nó đang `drain` |
| Bình minh (chỉ khi thắng): mỗi đèn đang sáng | +50 + floor(fuel) |
| Bình minh (chỉ khi thắng): mỗi Ngọn Lửa còn lại | +50 |
| Thưởng thời gian | Bỏ |
| Tổng điểm game, chơi lại | Không đổi so với Ticket-02 |

## 6. Chế độ mù màu (mới)
Cài đặt "Bảng màu dễ phân biệt" (được lưu):
- Viền và mắt Bóng Mực đổi từ #7A3CFF sang #00B3FF.
- Màu cảnh báo UI đổi từ #FF5A5F sang #FFFFFF, kèm biểu tượng ⚠.
- Đèn tắt và đèn sáng phân biệt được không cần màu: đèn tắt xẹp 20% và giấy có vết rách; đèn sắp hết dầu nhấp nháy.

## 7. Test Contract v1.2
- `contract_version: "1.2"`. `tuning` thêm `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`; `night1_duration_s = 240`, `night2_duration_s = 270`, `night3_duration_s = 300`.
- Snapshot: mỗi đèn thêm `fuel` (số thực, 1 chữ số thập phân; đèn tắt `fuel: 0`), `ever_lit`, `relit_count`; `player` thêm `capacity`. Bóng Mực có thêm trạng thái `drain`.
- Scenario: mỗi đèn đặt được `lit`, `fuel`, `ever_lit`; `player` thêm `successful_lights`; `shades[]` thêm `target_lantern_id`. Đèn `lit: true` không có `fuel` thì `fuel: 100`.
- Sự kiện mới: `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}` (mỗi 60 tick khi đang hút). `lantern_lit` thêm `relight: true|false`. `game_over.reason` thêm `dawn_survived`; `all_lit` không còn dùng.

## DoD
- Có bằng chứng game chạy đúng các yêu cầu của phase.
- Có ít nhất 1 ghi chú quyết định thiết kế (ADR) về mô hình trạng thái đèn và luật thắng.
- Test cũ bị luật mới làm sai được cập nhật hoặc xoá kèm lý do, không skip âm thầm.
- Có changelog liệt kê các breaking change của Phase 3.
- Mọi test ẩn Phase 1–2 không bị thay thế vẫn đạt.
