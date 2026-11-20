# Retro — Đảo Đèn Lồng (Day 12 AI SDLC)

## Tổng hợp 4 phase
| Phase | Kết quả | Test | Điểm nổi bật |
|---|---|---|---|
| 1 PRD-0 | Đêm 1 + headless v1.0 | 23 | Viết giả định + test trước phần hình; tag trễ (quên push trước khi Phase 2 mở) |
| 2 Ticket-02 | 3 Đêm, số chuẩn, contract v1.1 | 45 | Sim viết lại theo 12 bước tick; UI/HUD/âm thanh đủ ticket |
| 3 Ticket-03 | Đèn hao dầu, thắng ở bình minh, v1.2 | 56 | ADR-001 + CHANGELOG; 6 test cũ thay kèm lý do |
| 4 Ticket-04 | Bench, soak, bảng xếp hạng, accessibility, model Mây, v1.3 | 62 | Bench 238 fps / p1 114 / load 3.8 s trên iGPU |

## Cái hiệu quả
- **Tách sim thuần khỏi hiển thị** từ Phase 1: headless, bench, soak và cửa sổ dùng chung một `sim.js`, nên mỗi ticket chỉ sửa một chỗ luật.
- **Giả định + tiêu chí nghiệm thu trước khi code** (`docs/notes/phase-N.md`): agent code đúng ngay lần đầu, ít vòng sửa.
- **Mutation check** (cố ý phá luật xem test có đỏ không) bắt được test yếu 3 lần (R5b, P6 Gió Lạc, biên fuel = 30).
- **Stop hook** chặn agent kết thúc khi test đỏ; **skill `verify`** gom các bước tạo bằng chứng.

## Cái không hiệu quả
- Quên push/tag Phase 1 đúng giờ: chỉ commit local. Bài học: tag là một phần của "xong".
- Làm phần hình quá sớm (visual pass trước Phase 2) tốn token mà rubric không cộng điểm; Phase 2 phải đổi bảng màu lại.
- Lệnh shell có heredoc chứa backtick/nháy làm hỏng file 3 lần; sau đó chuyển sang ghi script ra file.

## Các lần AI sai và cách phát hiện
| Lỗi | Phát hiện bằng | Sửa harness |
|---|---|---|
| Test yếu (luôn xanh khi code sai) ×3 | Mutation check | Thêm bước mutation vào skill `verify` |
| Đếm sai tick trong test ×5 | Test đỏ → tính tay trước khi sửa | AGENTS.md: ghi phép tính cạnh assert |
| Gió Lạc idle bị Tỏa Sáng làm flee (sai ticket) | Đọc lại code đối chiếu ticket | — |
| Lời nhắc châm dầu dùng ngưỡng 90 thay vì 100 | Đối chiếu công thức `used` | — |
| Leaderboard rơi về localStorage vì dev server khởi động trước khi có config | Lệnh export ra rỗng | Khởi động lại server sau khi đổi config |
| Model Tripo quay về +X, tay bị xoay sai | Ảnh chụp từng góc | — |

## Token / chi phí (ước tính, xem `ai-log.md`)
Phase 1 ~190k · Phase 2 ~320k · Phase 3 ~155k · Phase 4 ~300k → **~1 triệu token**. Hết ~76% quota 5 giờ. Tiết kiệm: kiểm trình duyệt bằng `__advance` / `__benchSync` thay vì chơi tay qua nhiều ảnh; đọc ticket một lần rồi ghi vào notes; Phase 3–4 làm "tối thiểu đủ ticket".

## Nếu làm lại
1. Push + tag ngay khi test xanh ở mỗi phase.
2. Không làm đồ hoạ trước khi luật ổn định; để visual cho phase cuối.
3. Viết test biên (≤, ≥, "đúng bằng") ngay từ đầu thay vì chờ mutation check bắt.
4. Giảm lưới model ngay khi nhận (2 triệu tam giác là quá nhiều cho game web).
