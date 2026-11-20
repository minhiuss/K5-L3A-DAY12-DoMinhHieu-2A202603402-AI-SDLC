# Credits

- Nhân vật, bối cảnh, tên gọi (Mây, Đảo Đèn Lồng, Bóng Mực): bản gốc của lab Day 12 AI SDLC.
- Đồ hoạ: mọi model (Mây, Đèn Lồng Lớn, Bóng Mực, cây, đá, cỏ, trời, sao), texture glow và texture bóng đều dựng bằng code (Three.js primitives, LatheGeometry, InstancedMesh, shader, canvas) trong `src/view/`. Không dùng file asset ngoài. Âm thanh: nhạc nền và mọi hiệu ứng được **tổng hợp bằng Web Audio** trong `src/view/audio.js` (không có file âm thanh).
- Hậu kỳ: `UnrealBloomPass`, `OutputPass` từ three.js addons (MIT).
- [three.js](https://threejs.org) — MIT. [Vite](https://vitejs.dev) — MIT.
- Code viết với trợ giúp của Claude Code (Anthropic), người học điều phối và kiểm chứng; xem `docs/notes/ai-log.md`.
