# Visual + performance pass (between phase-1 and phase-2)

**Mục tiêu:** game nhìn ra "đêm ấm, cổ tích" như PRD-0 ("Night, warm, fairy-tale. The island brightens as lanterns are lit"), không đổi luật chơi.

## Không đổi luật

- `src/sim.js`, `src/tuning.js`, `headless.mjs`: **0 dòng thay đổi** (`git diff` trống). `npm test` 23/23, nên output headless giữ nguyên.
- Mọi phần hình nằm trong `src/view/` + `src/main.js`. Đồ trang trí dùng seed riêng (`makeRng(2026)`), không chạm RNG của game.

## Đã làm (mọi model đều dựng bằng code, không có file asset)

| Phần | Cách làm |
|---|---|
| Mây | Nón lá (cone + vành), áo, khăn đỏ, tay chân có khớp đung đưa khi đi, đèn lồng nhỏ treo trên cây que gắn ở nón (sáng hơn khi mang nhiều đom đóm) |
| Đèn Lồng Lớn | Đế đá, cột gỗ, mái nhỏ, đèn lồng giấy (LatheGeometry) có tua đỏ; 4 hạt tiến độ quanh đế (một hạt cho mỗi đom đóm đã đổ); khi thắp: đèn sáng, có quầng sáng, vũng sáng ấm trên đất, vòng `safe_radius` sáng lên |
| Bóng Mực | Khối mực gồm nhiều cục xoay quanh nhau, mắt tím phát sáng nhìn theo Mây, đuôi khói bám theo vị trí cũ; bị choáng thì đổi sang xanh nhạt và xoay |
| Đảo | Địa hình có bãi cát dốc xuống biển, 2600 lá cỏ, đường đá dẫn từ tâm tới từng đèn, 34 cây, đá ven biển, nấm phát sáng xanh, đèn lồng trôi trên biển |
| Trời | Shader chuyển màu, 1400 ngôi sao, trăng có quầng; trời và sương **ấm dần khi thắp đèn** |
| Đom đóm | `Points` + bloom (màu HDR > 1 nên phát sáng); đom đóm trang trí bay cao và mờ để không lẫn với đom đóm nhặt được |
| Hậu kỳ | ACES tone mapping + UnrealBloom |
| HUD | Lửa, túi đom đóm, 5 đèn, thanh cooldown pulse vẽ bằng CSS |

## Hiệu năng

- Instancing: cỏ, đá, cây, nấm, đường đá (mỗi loại 1 draw call). Đom đóm: 1 draw call mỗi lớp. Không dùng shadow map (bóng dưới chân là đĩa mờ).
- Tự hạ chất lượng: nếu dưới 40 fps trong 2 s thì tắt bloom và đặt pixel ratio = 1. Có thể ép bằng `?q=low`.
- Đo được: phím `` ` `` bật đồng hồ FPS; `?bench=1` cho camera bay vòng quanh đảo 10 s; `__benchSync(n)` trong console.

Kết quả `__benchSync(300)` (render đồng bộ, chờ GPU xong mỗi frame bằng `readPixels`), cảnh nhìn toàn đảo, 1024×768, pixel ratio 1.25, GPU AMD Radeon 890M (iGPU), Chrome/ANGLE D3D11:

| | mean ms | p95 ms | ≈ fps | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| bloom bật | 4.46 | 6.1 | 224 | 97 | 47k |
| bloom tắt | 2.68 | 3.8 | 373 | 84 | 47k |

Giới hạn: đo trong pane trình duyệt của app (bị ẩn nên `requestAnimationFrame` tạm dừng, vì vậy mới dùng bản đồng bộ). Số FPS thật khi chơi cần đo lại bằng `?bench=1` trên trình duyệt thường. Chưa đo trên máy macOS/Linux.

## Ảnh

[01-title](visual/01-title.jpg) · [02-night-start](visual/02-night-start.jpg) · [03-three-lit-shade](visual/03-three-lit-shade.jpg) (3 đèn đã thắp, trời ấm lên, Bóng Mực) · [04-bench-orbit](visual/04-bench-orbit.jpg)
