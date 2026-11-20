# Phase 1 — bảng bằng chứng

Sinh lại: `npm run proof -- 1` (file trong [`phase-1/`](phase-1/)). Máy: [`machine.txt`](phase-1/machine.txt). ID yêu cầu theo [`docs/notes/phase-1.md`](../notes/phase-1.md) §4.

| ID | Yêu cầu | Cách kiểm | Bằng chứng | Kết quả |
|---|---|---|---|---|
| R1–R2 | Di chuyển theo `move` + `cam_yaw_deg`, chuẩn hoá vector | unit test | [test-report.txt](phase-1/test-report.txt) | Đạt |
| R3–R4 | Nhặt đom đóm, giới hạn sức mang | unit test + headless `pickup` (event ở tick 40 đúng tính tay: 4 m ÷ 0.1 m/tick) | test-report, [run-pickup.jsonl](phase-1/run-pickup.jsonl) | Đạt |
| R5 | Đổ vào đèn, đủ 4 thì thắp (+100), chỉ khi false→true | unit test + mutation check | test-report, [mutation-check.txt](phase-1/mutation-check.txt) | Đạt (test đã được sửa cho đủ mạnh) |
| R6 | Thắp đủ 5 → thắng + thưởng | unit test + headless `win_one_left` | [run-win.jsonl](phase-1/run-win.jsonl) (`won`, score 369) | Đạt |
| R7–R8 | Bị đánh, bất tử, thua `no_flames` / `dawn` | unit test | test-report, [run-default-seed42.jsonl](phase-1/run-default-seed42.jsonl) (đứng yên → thua) | Đạt |
| R9 | Pulse: choáng, đẩy, tốn, cooldown | unit test | test-report | Đạt |
| R10 | Bóng không vào `safe_radius` | unit test 600 tick | test-report | Đạt |
| R11 | Dựng scenario không event/điểm | unit test | test-report | Đạt |
| R12 | Định dạng JSONL, snapshot tick 0 + mỗi N, `end` cuối | headless test | test-report | Đạt |
| R13 | Tất định byte-identical | chạy 2 lần 18000 tick, so sha256 | [determinism.txt](phase-1/determinism.txt) | Đạt (5 phút game chạy ~60 ms) |
| R14 | File sai → exit 2 | 7 ca trong test + proof | [exit-codes.txt](phase-1/exit-codes.txt) | Đạt |
| R15 | `game.contract.json` khớp tuning thật | contract test | test-report | Đạt |
| R16 | Cửa sổ: đi, nhặt, HUD, thắp đèn (đảo sáng lên), thua → màn hình kết thúc → R chơi lại | chạy `npm run dev`, thao tác trong trình duyệt | [01-move-pickup.jpg](phase-1/01-move-pickup.jpg), [02-lantern-lit.jpg](phase-1/02-lantern-lit.jpg), [03-lost-replay.jpg](phase-1/03-lost-replay.jpg) | Đạt |

## Chưa kiểm / giới hạn

- Chưa chạy trên macOS/Linux thật trên máy cá nhân. CI (Ubuntu + macOS) sẽ chạy test + build + so byte khi push.
- Một số thao tác trong ảnh R16 được "gán trạng thái" qua console (đặt sẵn 4 đom đóm, dời Mây tới cạnh đèn) để chụp nhanh; còn luật thì đã có unit test.
- Màn thắng trong cửa sổ chưa có ảnh (đã có test headless `run-win`).
