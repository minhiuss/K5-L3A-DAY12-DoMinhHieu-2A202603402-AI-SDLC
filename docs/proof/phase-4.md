# Phase 4 — bằng chứng (Ticket-04, Test Contract v1.3)

`npm test`: **62/62**. Máy đo: Windows 11, Ryzen AI 9 HX 370, Radeon 890M (iGPU), 31 GB RAM. Số trên máy chấm sẽ khác.

| Yêu cầu | Bằng chứng | Kết quả |
|---|---|---|
| Bench: cảnh chuẩn | test B1 (200 wander, 100 mote, L1–L3 fuel 100; không spawn/sát thương/nhặt/hao dầu/kết thúc) | Đạt |
| Bench: số đo | [`bench.json`](../../bench.json): avg_fps **238.4** (≥ 60), p1_low **114.1** (≥ 30), p95 5.7 ms, load_ms **3810** (≤ 10000), 7153 frames, vsync tắt, peak_mem_mb 1396 | Đạt trên máy dev (trình duyệt: Edge qua Playwright) |
| Soak | [`soak.json`](../../soak.json): crashes **0**, mem 58.4 → 63.2 MB (≤ 1.2×) | Đạt |
| Bảng xếp hạng | test L1–L3; nhập tên sai bị chặn, "Mây_Thử" lưu xuống đĩa, export đúng [ảnh](phase-4/03-leaderboard.jpg) | Đạt |
| Đổi phím + báo trùng + mặc định | [ảnh](phase-4/04-settings-rebind-duplicate.jpg) | Đạt |
| Phụ đề + mũi tên mép (bóng xuất hiện, gió, 10 s, đèn < 30) | `__advance` đọc DOM; [ảnh](phase-4/01-gameplay-may-model.jpg) ("⚠ Đèn L2 sắp cạn dầu") | Đạt |
| Giảm chuyển động, chữ ≥ 18 px, chữ lớn ×1.25 | `index.html` (`:root` 18 px, `body.large`), `settings.reducedMotion` | Đạt (kiểm bằng code, chưa có ảnh riêng) |
| Sáng tạo không đổi headless | test B2 + mọi test v1.0–v1.2 xanh | Đạt |
| Model Mây + nón lá + đèn | [ảnh tư thế gốc](phase-4/05-may-rest-pose-hat.jpg), [ảnh chạy](phase-4/06-may-run-pose.jpg) | Đạt |
| README ≤ 3 lệnh, CHANGELOG 4 phase, CREDITS, LICENSE | các file ở gốc repo | Đạt |
| Release v1.0.0 (zip web tĩnh + `serve.mjs`) | `release/dao-den-long-v1.0.0-web.zip` | Chờ người học duyệt để đăng |

## Chưa đạt / giới hạn
- **Video demo:** người học quay lúc playtest.
- **Màu áo Mây** theo texture Tripo (xanh lá), lệch bảng màu chuẩn #E8E2D0; khăn đỏ đúng màu.
- **Model ~2 triệu tam giác:** chi phí lớn nhất trên máy yếu. Đề xuất: `npx gltfpack -i art/source/<file>.glb -o public/assets/may.glb -si 0.1 -cc` (lệnh này bị chặn trong phiên AI, người học tự chạy nếu cần).
- Animation là xoay xương bằng code, chưa tinh chỉnh kỹ; mutation check cho Phase 4 chưa làm.
