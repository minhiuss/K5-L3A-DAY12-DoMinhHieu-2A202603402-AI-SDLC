# Nhật ký dùng AI

Công cụ: Claude Code (model Opus) trong app Claude desktop. Người học: chọn stack, duyệt kế hoạch, review kết quả.

## Phase 1

| Việc | AI làm | Người kiểm |
|---|---|---|
| Đọc PRD-0 + Test Contract | Tóm tắt từ lab board vào checklist | Đối chiếu bảng contract |
| So sánh stack | Liệt kê ưu/nhược 3 stack | **Chọn Three.js + Node** (chạy được trên Mac/Linux bằng web tĩnh) |
| Giả định + tiêu chí | Viết `phase-1.md` (A1–A18, R1–R16) **trước** khi code | Đọc lại |
| Code sim/headless/view | `src/sim.js`, `headless.mjs`, `src/main.js` | Tests + chơi thử trong trình duyệt |
| Harness | AGENTS.md, Stop hook, skill `verify`, CI | Thử hook bằng mutation |

### Lỗi của AI và cách phát hiện

1. **Test yếu (R5b):** test "giữ E không đổ thêm" vẫn xanh khi cố tình phá luật false→true, vì sau lần đổ đầu `carried` đã về 0. Phát hiện bằng **mutation check** (cố ý sửa sai code, xem test có đỏ không). Sửa: nạp lại `carried` mỗi tick. Bài học: "test xanh" chưa đủ, phải chứng minh test **có thể đỏ**. → Đã thêm vào skill `verify` thói quen làm mutation check.
2. **Lệnh `sed` không áp dụng** trong lần mutation đầu (escape `&` sai), nên lúc đầu tưởng test không bắt được lỗi. Phát hiện vì `git diff` trống. Sửa: dùng Node để thay chuỗi, kèm kiểm tra "không khớp thì báo lỗi".
3. **Cấu hình preview đặt sai chỗ:** AI tạo `.claude/launch.json` trong repo, nhưng app chỉ đọc file ở thư mục làm việc. Sửa: xoá file trong repo.

### Token / chi phí (ước tính)

- Phase 1: khoảng 150k token vào + 40k token ra (đọc tài liệu lab, viết khoảng 900 dòng code + docs, vài vòng chạy test). Tiết kiệm bằng cách: đọc contract một lần rồi ghi vào notes; viết test trước phần hình; kiểm cửa sổ bằng script JS + ảnh nhỏ thay vì nhiều ảnh to.
