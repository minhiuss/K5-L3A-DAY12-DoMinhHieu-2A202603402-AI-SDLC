# Đảo Đèn Lồng

> **Video demo:** _(thêm ở Phase 4 — link Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js). Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp lại **5 Đèn Lồng Lớn** trên Đảo Bến trước bình minh và né Bóng Mực. Có chế độ **headless** theo Test Contract v1.0 để chấm tự động.

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
| E | Đổ đom đóm đang mang vào đèn chưa thắp gần nhất |
| F | Pulse ánh sáng: làm choáng + đẩy Bóng Mực, tốn 1 đom đóm |
| R | Chơi lại · Enter: bắt đầu |

## Luật chơi và điểm

- Đom đóm tự nhặt khi đứng gần (≤ 1 m), mang tối đa 5. Mỗi đèn cần 4 đom đóm.
- Bóng Mực xuất hiện từ mép đảo (5 s đầu, sau đó mỗi 20 s, tối đa 4) và đuổi Mây. Chạm: mất 1 lửa, rơi một nửa số đom đóm (làm tròn xuống), bất tử 2 s. Bóng không vào được vòng 5 m quanh đèn.
- Thắng: thắp cả 5 đèn. Thua: hết 3 lửa, hoặc hết 300 s (bình minh).

| Điểm | |
|---|---|
| Mỗi đom đóm nhặt | +10 |
| Mỗi đèn thắp | +100 |
| Mỗi Bóng Mực bị pulse trúng | +25 |
| Khi thắng: mỗi giây còn lại | +1 |
| Khi thắng: mỗi lửa còn lại | +50 |

## Headless (Test Contract v1.0)

```bash
node headless.mjs --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenarios/pickup.json] [--inputs scenarios/walk_forward.json] [--snapshot-every 10]
```

- 60 tick/s cố định, không cần cửa sổ/GPU. Exit 0 khi chạy xong; file inputs/scenario sai → exit **2** (stderr); sai dòng lệnh → exit 1.
- Khai báo: [`game.contract.json`](game.contract.json). Số `tuning` lấy từ [`src/tuning.js`](src/tuning.js), test bắt buộc hai chỗ khớp nhau.
- `fall_enabled: false`: đảo có mép chặn, không có rơi, nên không bao giờ có `player_hit` với `by: "fall"`. Mọi khái niệm khác trong `tuning` đều có trong game.
- Snapshot có thêm mảng `motes` (khuyến nghị trong v1.0).
- Giả định cho chỗ PRD mơ hồ: [`docs/notes/phase-1.md`](docs/notes/phase-1.md).

## Kiểm chứng

- `npm test`: 23 test (`tests/`): luật R1–R11, contract R15, headless/tất định/exit code R12–R14.
- `npm run proof -- 1`: sinh lại bằng chứng vào `docs/proof/phase-1/`. Bảng truy vết: [`docs/proof/phase-1.md`](docs/proof/phase-1.md).
- CI (GitHub Actions, Ubuntu + macOS): test, build, chạy headless 2 lần rồi so byte.

## Harness AI

[`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) · Stop hook chặn kết thúc khi test đỏ ([`.claude/settings.json`](.claude/settings.json) → [`scripts/stop-gate.mjs`](scripts/stop-gate.mjs)) · skill [`verify`](.claude/skills/verify/SKILL.md) · nhật ký AI: [`docs/notes/ai-log.md`](docs/notes/ai-log.md).
