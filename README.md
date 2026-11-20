# Đảo Đèn Lồng

> **Video demo:** _(thêm ở Phase 4 — link Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js). Mây, người giữ đèn nhỏ tuổi, đi qua **3 Đêm** (Đảo Bến, Đảo Cau, Đảo Chuông), gom đom đóm để thắp lại các Đèn Lồng Lớn trước bình minh, né Bóng Mực và Gió Lạc. Có chế độ **headless** theo **Test Contract v1.1** để chấm tự động.

Lab: Day 12 AI SDLC (tài liệu gốc của lab ở [`docs/lab/`](docs/lab/README.md)).

## Cài và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)

```bash
npm install          # cài three + vite
npm run dev          # mở game trong trình duyệt (http://localhost:5173)
npm test             # chạy toàn bộ test (luật + contract + headless)
```

Bản build tĩnh: `npm run build` → thư mục `dist/` (mở bằng `npm run start`, không double-click `index.html`).

## Điều khiển

| Phím | Việc |
|---|---|
| W A S D | Đi (theo hướng camera) |
| Kéo chuột / ← → | Xoay camera |
| Space | Nhảy |
| Shift | Lướt (14 m/s trong 0.2 s, hồi 1.5 s) |
| E | Nạp ánh sáng vào đèn chưa sáng gần nhất (trong 2 m) |
| F | Tỏa Sáng: tốn 3 đom đóm, choáng + đẩy Bóng Mực trong 5 m, hồi 3 s |
| Esc / P | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |
| Enter | Nút chính trên các màn hình |
| Lăn chuột | Zoom camera |
| `` ` `` hoặc F3 | Bật/tắt đồng hồ FPS |

Tuỳ chọn URL: `?night=1|2|3` (vào thẳng Đêm đó) · `?seed=N` (cố định thế giới) · `?q=low` (tắt bloom, cho máy yếu) · `?bench=1` (camera bay vòng 10 s và đo khung hình). Kết quả đo: [`docs/proof/visual.md`](docs/proof/visual.md).

## Luật chơi và điểm (số chuẩn Ticket-02)

- Đom đóm tự nhặt khi cách ≤ 1 m (chênh cao ≤ 1.5 m), mang tối đa 10. Mỗi đèn cần 10, nạp nhiều lần được.
- Bóng Mực xuất hiện từ giây 5 (2 con), sau đó định kỳ; đuổi khi cách ≤ 12 m. Chạm: −1 Ngọn Lửa, rơi một nửa đom đóm ra quanh Mây (nhặt lại trong 8 s), bất tử 1.5 s. Đèn đã sáng tạo vùng an toàn 6 m.
- Rơi khỏi đảo: −1 Ngọn Lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát.
- Đêm 2–3: **Gió Lạc** cướp 3 đom đóm khi Mây mang ≥ 5. **Bùa Gió** cho chạy 7.2 m/s và lướt không hồi chiêu trong 10 s. Đêm 3 có **gió mạnh** mỗi 30 s.
- Thắng một Đêm: thắp hết đèn. Thua: hết 3 Ngọn Lửa, hoặc trời sáng (300 / 330 / 360 s).

| Điểm | |
|---|---|
| Mỗi đom đóm nạp vào đèn | +10 |
| Mỗi đèn thắp | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng | +5 |
| Khi thắng Đêm: mỗi giây còn lại | +2 |
| Khi thắng Đêm: mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm game là tổng điểm các Đêm đã thắng.

## Headless (Test Contract v1.1)

```bash
node headless.mjs --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--night 1|2|3] \
  [--scenario scenarios/pickup.json] [--inputs scenarios/walk_forward.json] [--snapshot-every 10]
```

- 60 tick/s cố định, không cần cửa sổ/GPU. Exit 0 khi chạy xong; file inputs/scenario sai → exit **2** (stderr); sai dòng lệnh → exit 1.
- Khai báo: [`game.contract.json`](game.contract.json). Số `tuning` lấy từ [`src/tuning.js`](src/tuning.js), test bắt buộc hai chỗ khớp nhau.
- `fall_enabled: true` (v1.1). Mọi khái niệm trong `tuning` đều có trong game.
- Snapshot v1.1: `night`, `wind`, `player.{vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s}`, mảng `motes`, `drifters`, `charms`. Event `night_start` ghi ngay sau snapshot tick 0. Input có `dash`, `pause`.
- Giả định: [`docs/notes/phase-1.md`](docs/notes/phase-1.md), [`docs/notes/phase-2.md`](docs/notes/phase-2.md) (B1–B21).

## Kiểm chứng

- `npm test`: 45 test (`tests/`): luật R1–R11 (số chuẩn), tính năng v1.1 P1–P13, contract R15, headless/tất định/exit code.
- `npm run proof -- <N>`: sinh lại bằng chứng vào `docs/proof/phase-N/`. Bảng truy vết: [Phase 1](docs/proof/phase-1.md), [Phase 2](docs/proof/phase-2.md), [hình ảnh + FPS](docs/proof/visual.md).
- CI (GitHub Actions, Ubuntu + macOS): test, build, chạy headless 2 lần rồi so byte.

## Harness AI

[`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) · Stop hook chặn kết thúc khi test đỏ ([`.claude/settings.json`](.claude/settings.json) → [`scripts/stop-gate.mjs`](scripts/stop-gate.mjs)) · skill [`verify`](.claude/skills/verify/SKILL.md) · nhật ký AI: [`docs/notes/ai-log.md`](docs/notes/ai-log.md).
