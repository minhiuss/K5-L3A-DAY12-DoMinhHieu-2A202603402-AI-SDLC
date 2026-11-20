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

## Phase 2 (Ticket-02, contract v1.1)

| Việc | AI làm | Người kiểm |
|---|---|---|
| Đọc ticket | Người học dán ticket vào `docs/lab/ticket-02.md`; một phiên Claude khác báo trước bảng màu + bố cục HUD | Đối chiếu |
| Giả định + AC | `docs/notes/phase-2.md`: bảng "luật bị thay → test cũ sửa kèm lý do", B1–B21, P1–P14 **trước** khi code | Đọc lại |
| Sim v1.1 | Viết lại `src/sim.js` theo đúng 12 bước tick, thêm `src/maps.js` | 45 test + mutation check |
| View | `world.js` (3 bản đồ), bảng màu chuẩn, HUD, menu, pause, cài đặt, Web Audio | Ảnh + `__advance` + `__benchSync` ở 1280×720 |

### Lỗi của AI và cách phát hiện

1. **Đếm sai tick trong test 3 lần** (P1 lướt lại được ở tick 91 chứ không phải 90; P7 bùa ở tick 2701; ghi chú trong test sai một tick). Phát hiện: test đỏ, rồi **tính lại bằng tay trước khi sửa**, để biết là test sai chứ không phải code sai. Đã thêm vào AGENTS.md: ghi phép tính cạnh assert.
2. **Test cầu tre đỏ** vì Mây nhặt luôn Bùa Gió đặt trên cầu nên chạy nhanh hơn. Phát hiện: đọc vị trí cuối 43.x thay vì 42. Sửa: scenario `charms: []`.
3. **Test yếu lần 2 (`greentest`):** P6 không bắt được khi bán kính cướp bị phá (1.2 → 6.2). Sửa: kiểm cả tick cướp (42).
4. **Gió Lạc idle bị Tỏa Sáng làm flee**, sai so với ticket (chỉ `chase` → `flee`). Phát hiện khi đọc lại code với ticket, trước khi chạy test. Sửa ngay.
5. **Heredoc bash có dấu nháy và backtick làm lệnh hỏng 2 lần.** Sửa: ghi script ra file bằng công cụ Write rồi mới chạy.

### Token / chi phí (ước tính)

- Phase 2: ~250k token vào, ~70k token ra (ticket dài, viết lại sim khoảng 600 dòng, test khoảng 450 dòng, view khoảng 900 dòng). Tiết kiệm: viết giả định + AC trước để code một lần; kiểm trình duyệt bằng `__advance` và ảnh nhỏ thay vì chơi tay qua nhiều ảnh; đo FPS bằng script thay vì quay màn hình.

## Phase 3 (Ticket-03, contract v1.2) — phase 30 phút, nâng cấp tối thiểu

- AI viết ADR-001 + giả định C1–C7 **trước** khi sửa sim; lưu dầu bằng số nguyên 1/60 để giữ tất định.
- Test cũ đỏ đúng 6 cái, đều là luật bị thay → sửa kèm comment `REPLACED by Ticket-03`.
- **Lỗi AI:** (1) test F5 đặt bóng cách đèn 4 m nhưng mong nó `drain` ngay (cần ≤ 2 m); (2) F5b quên luật phát hiện 12 m và luật wander → drain khi đèn yếu ở ≤ 2 m; (3) mutation M3 (biên đúng 30) không bị bắt → thêm test F4b; (4) lời nhắc châm dầu dùng ngưỡng 90 thay vì 100, phát hiện khi đối chiếu với công thức `used`.
- (5) Lệnh bash có backtick bị shell hiểu sai, làm mất chữ trong nhật ký này (lần 3 trong lab); phát hiện khi đọc lại file, sửa bằng Python.
- Token ước tính: ~120k vào, ~35k ra.

## Phase 4 (Ticket-04, contract v1.3) — làm tối thiểu đủ ticket vì quota thấp

- AI làm: cảnh bench trong sim + `scripts/bench.mjs` (Playwright), `soak.mjs`, bảng xếp hạng (server Node ghi đĩa), accessibility, model Mây (nón lá, animation code), Bóng Mực instancing, README/CHANGELOG/CREDITS/retro.
- Người học: đưa model Tripo, chọn kỹ năng sáng tạo (Q bắn tên, lướt lộn vòng, chạy nhanh, camera TPS), quyết bỏ video tới playtest.
- **Lỗi AI:** (1) model quay về +X, tay xoay quá tay (A-pose chứ không phải T-pose), phát hiện bằng ảnh; (2) `--port 0` bị hiểu thành 5173 (0 là falsy); (3) leaderboard rơi về localStorage vì dev server chạy trước khi có `vite.config.js`, phát hiện khi export ra rỗng; (4) assert vô nghĩa trong test B2.
- **Bị chặn:** `npx gltfpack` (giảm lưới model) bị quyền chặn → dùng model gốc ~2 triệu tam giác, ghi rủi ro.
- Bench (máy dev): avg 238.4 fps, p1 114.1, load 3810 ms. Soak: 0 crash.
- Token ước tính: ~250k vào, ~50k ra.

## Sau phase-4 (2026-11-20): sửa model ma + hướng lướt
- **Lỗi AI để lọt ở Phase 4:** không kiểm vật liệu Tripo (`metalness: 1`, không env map → Mây gần đen, như bóng ma); Mây procedural dự phòng luôn nằm trong cảnh lúc tải; lướt quay quanh trục tiến (Z) nên lăn ngang.
- **Sửa:** `metalness = 0` khi tải; procedural chỉ thêm khi tải lỗi; lộn quanh trục X + quay mặt theo `dashDir`. 62/62 test, build sạch.
- Token ước tính: ~60k vào, ~10k ra.

## Sau phase-4 (2026-11-20): clip animation thật từ Blender
- **Bị chặn:** Blender MCP nhận kết nối ở cổng 9876 nhưng mọi lệnh đều timeout (kể cả sau khi khởi động lại server) → chạy Blender 5.3 headless (`--background --python art/make_may_clips.py`).
- **Suýt sai:** định export lại cả model từ Blender (sẽ mã hoá lại lưới meshopt) → đổi sang chỉ xuất armature + action, rồi `art/merge_may_anims.mjs` chép `animations` vào glb gốc (lưới giữ nguyên byte, kiểm tư thế nghỉ 41 xương trước khi ghép).
- **Phát hiện:** cây cung trên lưng bị Tripo auto-weight vào đùi/cẳng chân/cẳng tay → méo khi bước (cả bản procedural cũ cũng bị). Sửa ở view: gắn cứng vào `Spine02` khi tải.
- **Lỗi nhỏ của AI:** ảnh xem trước clip `shoot` bị lẫn pose của clip trước (xương không có key giữ pose cũ) → reset pose trước mỗi ảnh. Code `run` cũ ngả lưng **ra sau** (dấu `x` sai), clip mới ngả về trước.
- `may.js`: `AnimationMixer` + `crossFadeTo` theo trạng thái, `shoot` additive, dash = clip co gối + `roller` lộn; không có clip thì dùng procedural. `src/sim.js` không đổi. 62/62 test, build sạch, kiểm trong trình duyệt (run/sprint/jump/dash/shoot).
- Token ước tính: ~150k vào, ~30k ra.
