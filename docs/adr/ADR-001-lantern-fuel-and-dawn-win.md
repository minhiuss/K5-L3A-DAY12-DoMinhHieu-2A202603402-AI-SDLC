# ADR-001 — Đèn có nhiên liệu, thắng khi sống tới bình minh (Phase 3, Ticket-03)

- **Trạng thái:** Đã chấp nhận, 2026-11-20
- **Bối cảnh:** Ticket-03 thay ba luật cốt lõi: đèn sáng mãi → đèn hao dầu và tắt; vùng an toàn luôn có → chỉ có khi fuel ≥ 30; thắng ngay khi thắp hết → thắng khi sống tới bình minh với ≥ 60% số đèn đang sáng.

## Quyết định

1. **Mô hình trạng thái đèn.** Trước: `unlit → lit` (một chiều, `lit` là cuối). Sau: một vòng lặp
   `unlit(ever_lit=false) --10 đom đóm--> lit(fuel=100) --fuel≤0--> unlit(ever_lit=true) --5 đom đóm--> lit(fuel=100) ...`
   Đèn lưu `lit`, `deposited`, `fuel60`, `everLit`, `relitCount`. Đang sáng thì `deposited` = giá thắp của lần đó.
2. **Dầu lưu bằng số nguyên `fuel60` = fuel × 60** (100 → 6000). Hao 1 đơn vị/tick, mỗi bóng hút thêm 5/tick, châm thêm 600 mỗi đom đóm. Không có sai số số thực; chỉ khi xuất snapshot mới làm tròn 1 chữ số thập phân. Vì sao: chạy 18.000 tick cộng trừ 1/60 bằng số thực sẽ lệch, mà contract đòi output giống từng byte.
3. **Vùng an toàn là một hàm**, không còn là thuộc tính cố định: `zoneActive(l) = l.lit && fuel60 ≥ 30 × 60`. Mọi chỗ dùng vùng an toàn (chặn bóng, đẩy bóng ra) đều gọi hàm này, nên luật "đúng 30 vẫn còn vùng" chỉ nằm ở một nơi.
4. **Trạng thái mới `drain` của Bóng Mực** đứng giữa `wander` và đèn yếu. `wander` giờ có mục tiêu: đèn sáng yếu gần nhất, không có thì đèn tắt gần nhất (giả định C1). Hết choáng thì về `wander` (ticket).
5. **Thắng chuyển hẳn sang bước 11, chỉ ở tick bình minh.** Bỏ nhánh "tất cả đèn sáng → thắng". Bước 11: hết lửa → `no_flames`; hết giờ → đủ ngưỡng thì `dawn_survived`, thiếu thì `dawn`.
6. **Điểm:** giữ khoá `score` cũ trong contract và đổi giá trị (`per_mote` 5, `per_second_left` 0). Các khoản mới (thắp lại 40, choáng lúc đang hút 15, mỗi đèn sáng lúc bình minh 50 + floor(fuel)) nằm ở `RULES` trong `src/tuning.js`, không thêm khoá lạ vào contract.

## Hệ quả
- **Breaking:** `game_over.reason` không còn `all_lit`; thời lượng Đêm ngắn hơn; điểm khác hẳn. Liệt kê trong `CHANGELOG.md`.
- **Test cũ phải đổi:** R5, R6, P5, P11 (thắng sớm), các test điểm, test thời lượng Đêm. Lý do ghi trong `docs/notes/phase-3.md` §1.
- **View:** HUD và màn hình kết quả đổi theo luật mới (đèn sáng k/n so với ngưỡng, sức chứa, thanh dầu). Phần đồ hoạ khác giữ nguyên tới sau Phase 4 (người học sẽ đưa model).

## Phương án đã bỏ
- **Lưu fuel bằng số thực rồi làm tròn mỗi tick:** đơn giản hơn, nhưng dễ lệch giữa các máy và khó chứng minh tất định.
- **Thêm `per_relight` vào `tuning.score`:** contract v1.2 không liệt kê khoá này; thêm khoá lạ có thể làm bộ kiểm tuning của máy chấm báo sai.
