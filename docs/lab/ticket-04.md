# TICKET-04 — "Bình minh: phát hành v1.0.0" (Phase 4)

> Nguồn: lab board tab Phase 4, người học dán vào ngày 2026-11-20. Loại: Non-functional + Release · Ưu tiên: Cao · Tag nộp: `phase-4` + GitHub Release `v1.0.0` · Contract: **v1.3**

**Mục tiêu:** đưa game từ "chạy được" thành sản phẩm phát hành được: đo được hiệu năng, ổn định khi chạy lâu, có bảng xếp hạng, dễ tiếp cận, cài đặt dễ dàng. Mọi yêu cầu đều có số đo cụ thể, chấm tự động hoặc theo checklist.

**Về sáng tạo:** giữ được, miễn là luật, số liệu và Test Contract không đổi và đầu ra headless không đổi. Trong cảnh benchmark và soak test, nhân vật, kẻ địch và hiệu ứng sáng tạo thêm phải tắt (hoặc không ảnh hưởng số đo).

## 1. Chế độ benchmark (bắt buộc)
Lệnh: `<bench_cmd> --seed 42 --duration 30 --out bench.json`
- Cửa sổ 1280×720, không toàn màn hình; tắt vsync nếu engine cho phép (README phải ghi nếu không tắt được).
- Tải Đêm 1 với đầy đủ hiệu ứng và ánh sáng như lúc chơi thật.
- Đúng 200 Bóng Mực ở trạng thái `wander`, rải đều trên đảo (seed 42); đúng 100 đom đóm (được vượt trần gameplay). L1–L3 đang sáng, fuel 100.
- Tắt: sinh thêm thực thể, sát thương, nhặt đom đóm, hao dầu, điều kiện kết thúc Đêm. Bóng Mực vẫn di chuyển theo luật `wander` bình thường.
- Không có input. Mây đứng yên tại (0,0,0). Camera bay vòng tròn tâm (0,0,0), bán kính 30 m, cao Y = 15 m, luôn nhìn vào (0,0,0), xuất phát ở góc 0° (điểm (30,15,0)), quay ngược chiều kim đồng hồ khi nhìn từ trên xuống, 15 s một vòng.
- 3 s đầu khởi động (không đo). Sau đó đo đúng `--duration` giây rồi tự thoát mã 0.

Output `bench.json`: `contract_version` "1.3", `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`.
- `avg_fps` = 1000 × N / Σ dt_i · `p1_low_fps`: k = max(1, ceil(0.01 × N)) dt lớn nhất, = 1000 / trung bình của chúng · `frame_ms_p95` = phân vị 95 của dt · `load_ms` = từ lúc tiến trình bắt đầu tới khung hình đầu tiên của cảnh bench · `peak_mem_mb` = RSS cao nhất trong lúc đo (null nếu bản web không đo được, kèm giải thích).
- **Ngưỡng (máy chấm của giảng viên):** `avg_fps ≥ 60` · `p1_low_fps ≥ 30` · `load_ms ≤ 10000`.

## 2. Soak test (bắt buộc)
Lệnh: `<soak_cmd> --seed 7 --nights 10 --out soak.json`
- 10 Đêm headless liên tiếp trong cùng một tiến trình (Đêm 1 → 2 → 3 xoay vòng), Đêm thứ i dùng seed 7 + i, mỗi Đêm chạy tới khi kết thúc hoặc hết thời lượng chuẩn.
- Input ngẫu nhiên theo seed: mỗi 30 tick chọn lại hướng di chuyển; mỗi tick 5% nhảy, 3% lướt, 2% tỏa sáng, 10% tương tác.
- `mem_start_mb`: RSS sau khi tải xong Đêm đầu. `mem_end_mb`: RSS sau khi reset xong Đêm cuối.
- Output: `{"nights": 10, "crashes": 0, "results": [...], "mem_start_mb": …, "mem_end_mb": …, "duration_s": …}`.
- **Ngưỡng:** `crashes = 0` và `mem_end_mb ≤ 1.2 × mem_start_mb`.

## 3. Bảng xếp hạng cục bộ
- Sau màn Bình Minh (thắng Đêm 3) hoặc sau khi thua ở bất kỳ Đêm nào: nhập tên để lưu điểm.
- Tên: 3–12 ký tự `[A-Za-z0-9_]`; hỗ trợ tiếng Việt có dấu là điểm cộng.
- Mỗi mục: `name`, `score` (tổng điểm các Đêm đã thắng), `nights_won` (0–3), `achieved_at` (ISO 8601 có múi giờ), `seed`.
- Top 10, score giảm dần; bằng điểm thì ai đạt trước đứng trên. Lưu trên đĩa cục bộ, còn sau khi tắt mở lại. Có màn hình Bảng xếp hạng từ menu chính.
- Lệnh xuất: `<run_cmd> --export-leaderboard out.json` cho ra `{"entries": [ ... ]}` đúng thứ tự.

## 4. Dễ tiếp cận
| Yêu cầu | Chi tiết |
|---|---|
| Đổi phím | Mọi hành động: di chuyển 4 hướng, nhảy, lướt, tương tác, tỏa sáng, tạm dừng. Phát hiện trùng phím và báo. Nút "Khôi phục mặc định". Được lưu |
| Phụ đề / chỉ báo hình ảnh | Bóng Mực xuất hiện (kèm mũi tên chỉ hướng ở mép màn hình), gió sắp thổi, 10 s cuối, đèn có fuel < 30 |
| Giảm chuyển động | Tắt rung camera và hiệu ứng chớp màn hình |
| Cỡ chữ UI | Tối thiểu 18 px ở 1280×720; tùy chọn chữ lớn (×1.25) |

## 5. Đóng gói & tài liệu
- Clone sạch → README tối đa 3 lệnh → chơi được (thử trên máy sạch).
- README: mô tả ngắn, ảnh/GIF, yêu cầu hệ thống, cài đặt, điều khiển, test, headless, bench, soak.
- CHANGELOG có mục cho cả 4 phase. CREDITS liệt kê mọi asset, âm thanh, công cụ AI tạo nội dung. Có LICENSE.
- GitHub Release v1.0.0 có bản chạy được (file thực thi, thư mục web tĩnh hoặc Docker image kèm hướng dẫn).

## 6. Test Contract v1.3
`contract_version: "1.3"`; `game.contract.json` thêm `bench_cmd`, `soak_cmd`; mọi yêu cầu v1.0–v1.2 giữ nguyên.

## 7. Retro & demo
- Retro 1–2 trang: Evaluation 4 phase; cái hiệu quả/không hiệu quả khi làm với AI; các lần AI sai và cách phát hiện; harness giúp nhiều nhất; tổng token/chi phí và cách tiết kiệm; làm lại thì đổi gì.
- Video demo .mp4 < 5 phút (Release v1.0.0 hoặc `docs/demo/demo.mp4`).

## DoD
Bằng chứng; tag `phase-4` + Release `v1.0.0`; `bench.json` và `soak.json` tự chạy được commit vào repo; test ẩn Phase 1–3 còn hiệu lực vẫn đạt; repo public, đủ harness AI và tài liệu.
