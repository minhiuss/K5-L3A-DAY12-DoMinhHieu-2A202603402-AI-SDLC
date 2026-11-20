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

## Visual + performance pass (giữa phase-1 và phase-2)

- Yêu cầu: "nhìn như bài Reddit FPS làm bằng Claude Code, mọi model là code". AI dựng `src/view/` (models, island, sky, fireflies) + bloom. Sim không đổi (test 23/23).
- Lỗi/vấp: (1) cỏ ra màu trắng xanh vì `MeshStandardMaterial` phản chiếu ánh trăng → đổi sang Lambert + màu tối hơn, phát hiện bằng ảnh chụp. (2) Benchmark dùng `requestAnimationFrame` không bao giờ xong vì pane trình duyệt bị ẩn (rAF = 0 lần/3 s) → viết `__benchSync` render đồng bộ và chờ GPU bằng `readPixels`. (3) `renderer.info` báo 1 draw call vì tự reset sau mỗi pass hậu kỳ → `autoReset = false`, reset 1 lần/frame.
- Bài học: số đo phải kèm điều kiện đo (GPU, độ phân giải, cách đo), nếu không sẽ không so sánh được.
- Token ước tính: ~120k vào, ~30k ra.
- Ludo/Tripo: đã thêm `.mcp.json` (Ludo, key đọc từ biến môi trường `LUDO_API_KEY`); chưa dùng asset AI nào trong bản này.
