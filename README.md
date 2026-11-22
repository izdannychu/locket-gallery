# Locket Gallery

Xem khoảnh khắc bằng swipe card: mở ảnh từ gallery để vuốt trái/phải trong toàn bộ danh sách đang lọc/sắp xếp, không bị giới hạn bởi trang 60 ảnh. Mọi thẻ dùng cùng khung vuông theo viewport, ảnh/video dùng object-fit:cover nên có thể cắt mép nhưng không kéo giãn; metadata media và caption không thay đổi kích thước khung. Avatar/tên nằm trên ảnh; caption trắng nằm phía dưới trong ô bo tròn có nền blur, caption dài cuộn trong ô. Nội dung chỉ gồm ảnh/video, avatar, tên và caption; không hiển thị thời gian, mã, nguồn, dữ liệu thô hoặc link tệp gốc. Có nút trước/tiếp và phím trái/phải. Kéo ngang dùng Pointer Events + pointer capture, cập nhật transform theo animation frame; thả chưa đủ xa hoặc bị hủy sẽ bật về. Video tự phát lặp lại, tắt tiếng và phát inline như ảnh động, không có nút điều khiển; vuốt trực tiếp trên toàn bộ vùng video để chuyển khoảnh khắc. Popup xếp tối đa ba thẻ: thẻ hiện tại và hai thumbnail thật phía sau, nghiêng nhẹ với bóng đổ; khi kéo, lớp kế tiếp tiến dần lên trước. Chỉ dựng tối đa ba thẻ; video trước được dừng khi chuyển/đóng. Animation tuân thủ reduced-motion và hủy an toàn khi đóng/mở lại nhanh. `src/swipe-viewer.js` được ghép sau `src/app.js` lúc build.

## Deploy trên Vercel

Mã nguồn hỗ trợ hai đích riêng: Cloudflare Worker/Sites và Vercel. Không trỏ Vercel Function trực tiếp vào `src/server.js` hoặc dùng thư mục `dist/server` làm static output; đó là bản Worker với chữ ký `fetch(request, env)`.

- Trong Vercel project, đặt **Root Directory** là `locket-gallery` nếu repository chứa thư mục cha; nếu `package.json` ở ngay root repository thì để `.`.
- **Framework Preset:** Other. `vercel.json` đặt Build Command `npm run build` và Output Directory `dist/vercel-public`. Node.js: 22.x.
- Thêm `SESSION_SECRET` là chuỗi ngẫu nhiên ổn định ít nhất 32 byte vào Environment Variables cho Production (và Preview nếu cần), rồi redeploy. Không đưa giá trị thật vào Git hoặc frontend. Có thể sinh bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- Homepage được build thành `dist/vercel-public/index.html` và phục vụ tĩnh. Chỉ sáu URL `/api/login`, `/api/logout`, `/api/session`, `/api/friends`, `/api/feed`, `/api/history` được rewrite vào `api/index.js`.
- `api/index.js` là Vercel Web Standard handler, truyền `process.env.SESSION_SECRET` rõ ràng vào Worker. Header danh tính riêng của Sites bị loại bỏ trên Vercel. Cookie giữ `HttpOnly`, `Secure`, `SameSite=Strict`; kiểm tra Origin vẫn có hiệu lực.
- Không có `SESSION_SECRET` không làm homepage tĩnh crash, nhưng đăng nhập không thể lưu phiên. API trả lỗi JSON thay vì crash Function.

Với `500 FUNCTION_INVOCATION_FAILED`, cần đọc stack trace để kết luận nguyên nhân production. Lệnh: `vercel logs --request-id <request-id>`. Máy hiện tại chưa đăng nhập Vercel nên chưa lấy được log của request người dùng cung cấp; bản sửa được xác minh bằng test adapter/routing tại máy, chưa redeploy production.

Bộ lọc tháng dùng dialog riêng (lưới 12 tháng, chuyển năm, đánh dấu tháng hiện tại, chọn tháng này hoặc xóa bộ lọc). Không mở popup `input[type=month]` của hệ điều hành. Giá trị `YYYY-MM` vẫn được dùng cho bộ lọc gallery; nhãn hiển thị `Tháng N / YYYY`. Bộ chọn có focus/đóng bằng Escape thông qua native dialog và dùng nút daisyUI.

Giao diện dùng **daisyUI 5 + Tailwind CSS 4**: theme riêng trắng/xám với sidebar xanh than, nhấn vàng Locket, nút, tabs, inputs, selects, cards, stats, badges, alerts và loading từ thư viện. Các dialog dùng HTML `<dialog>` với component daisyUI bên trong. `src/ui.css` khai báo theme và source; `src/style.css` chỉ giữ layout/brand/responsive. Build biên dịch CSS tại máy rồi nhúng vào Worker, không dùng Tailwind/daisyUI CDN hoặc JavaScript runtime thư viện trên trình duyệt. Tham khảo: https://daisyui.com/docs/install/cli/ và https://tailwindcss.com/docs/installation/tailwind-cli.

Chức năng nhập tệp/ảnh/video/JSON đã được gỡ hoàn toàn trên desktop và mobile. Gallery lấy dữ liệu qua kết nối Locket; chế độ minh họa vẫn có thể bật từ màn hình trống.

During sync, a persistent pending notification appears at the bottom-right, showing a spinner and the current photo/page count. It stays visible after closing the account dialog, does not block gallery interaction, and sits above the mobile bottom navigation. Completion replaces it with the existing success popup; pause/error hides the pending state. Manual popovers keep notifications visible above dialogs when supported; reduced-motion preferences disable spinning.

Account/sync UI: the account button is in the top-right header on desktop and mobile. The sidebar memory note and sidebar account button are removed. Date selection, manual sync, pause/retry and sync details live inside the account dialog. Sync completion uses a dismissible top-right notification that auto-hides after five seconds; supported browsers use a manual popover so it also appears above open dialogs. Automatic sync on a later visit stays enabled. The gallery no longer contains date-selection/status banners or manual sync buttons.

Phone layout (up to 680 CSS px): full-width content replaces the left rail, with a fixed bottom navigation bar and safe-area padding. Body/form text is 16px, primary labels and controls 14–16px, metadata 12–13px; headings scale with viewport width. Controls have 44–48px touch targets. A mobile friend dropdown preserves friend filtering, and switching navigation tabs resets it. Month/sort/layout controls share a compact row. Photos use two columns, with a one-column large view and single-column fallback at 360px or below. Dialogs fit the dynamic viewport and scroll independently; date fields stack vertically. Desktop styles remain separate. Browser/mobile visual QA is unverified when no browser connection is available.

Gallery tiếng Việt cho ảnh/video Locket, chạy trên Cloudflare Worker và không cần thư viện runtime.

Yêu cầu Node.js 22+. Sau khi lấy mã nguồn, chạy `npm ci` để cài build dependencies theo lockfile, sau đó `npm run dev` (tự build). Chạy `npm test` và `npm run validate` để kiểm tra. Mở http://localhost:4173. Máy chủ local tự sinh khóa phiên trong bộ nhớ; khởi động lại sẽ yêu cầu đăng nhập lại. Có thể cấu hình biến môi trường `SESSION_SECRET` bằng ít nhất 32 byte ngẫu nhiên. Trên Sites, khóa được giữ dưới dạng runtime secret.

Sửa các tệp trong `src/`; `scripts/build.mjs` biên dịch Tailwind/daisyUI, nhúng CSS cùng JavaScript vào Worker và tạo artifact. Không sửa trực tiếp `worker/index.js` vì đây là tệp sinh ra khi build. `dist/ui.css` là CSS thư viện sinh ra (không theo dõi trong Git).

Các lệnh kiểm tra / build:

```json
[
  ["node", "scripts/build.mjs"],
  ["node", "scripts/validate-artifact.mjs"]
]
```

The deterministic build produces:

```text
dist/
├── .openai/
│   └── hosting.json
└── server/
    └── index.js
```

Chức năng: đăng nhập email hoặc số quốc tế + mật khẩu (chưa hỗ trợ OTP), thông tin tài khoản, danh sách bạn bè có phân trang, ảnh/video từ feed Locket, lọc theo người/loại/tháng, yêu thích trên thiết bị, xem tệp gốc và metadata. Phiên AES-GCM trong cookie HttpOnly, SameSite=Strict, Secure trên HTTPS, gắn với người dùng Sites và hết hạn sau 7 ngày. Không lưu mật khẩu.

Đây là ứng dụng độc lập, tham khảo giao thức feed tại https://github.com/jumpogpo/locket-api. Lịch sử được đọc riêng từ database Firestore `locket`, collection `history/{uid}/entries` của chính tài khoản đang đăng nhập. Nguồn xác minh cấu trúc lịch sử: https://unpkg.com/@doi2523/locket-sdk@1.0.0/packages/firebase/src/services/moments.ts. Không cài hay chạy SDK bên ngoài; ứng dụng dùng REST và phiên hiện tại.

Sau khi kết nối, chọn 7/30/90/365 ngày gần đây hoặc nhập ngày bắt đầu và ngày kết thúc. Khoảng ngày bao gồm hết ngày kết thúc theo múi giờ trình duyệt và được giữ cố định. Web chỉ lưu khoảnh khắc trong khoảng đã chọn, cộng với khoảnh khắc mới của bạn bè kể từ lần lưu lựa chọn đầu tiên. Ảnh mới của chính chủ nằm ngoài khoảng chọn không được thêm tự động. Đổi khoảng ngày sẽ loại ảnh cũ không còn phù hợp; mốc bắt đầu nhận ảnh mới của bạn bè vẫn được giữ.

API lịch sử bắt buộc `from` (epoch ms, bao gồm), `to` (epoch ms, không bao gồm) và lọc ngay trong truy vấn Firestore. Các trang có 50 bản ghi, sắp xếp giảm dần theo `date` rồi `__name__`. Cursor giữ nguyên timestamp đến nano giây và mã document để không bỏ sót ảnh trùng thời gian. Tiếp tục đến khi truy vấn trả về rỗng. Feed mới nhất cũng phải qua bộ lọc cho phép trước khi hiển thị/lưu. Tham khảo REST cursor: https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery.

Thanh tiến độ cho biết số khoảnh khắc, số trang và ngày cũ nhất đã tải. Có thể Tạm dừng / Tiếp tục. Lựa chọn, metadata khoảnh khắc, bạn bè, cursor chưa hoàn tất và mốc cập nhật mới được lưu trong IndexedDB `locket-gallery-selected`, store `galleries`, khóa theo UID tài khoản Locket. Không lưu mật khẩu hoặc token tại đây. Chỉ khôi phục cache sau khi xác định tài khoản từ phiên máy chủ. Khi vào lại web, tải tiếp phần chưa xong và chỉ truy vấn phần mới kể từ mốc đã cập nhật; không quét lại lịch sử đã hoàn tất. Cursor và mốc mới chỉ được lưu sau khi ghi dữ liệu thành công, hỗ trợ tải lại an toàn nếu mất kết nối. Nếu lưu thất bại, giao diện báo lỗi và không tuyên bố đã lưu.

API nội bộ có thể thay đổi hoặc từ chối quyền đọc; chỉ có thể lấy nội dung tài khoản được phép truy cập. Cache đã chọn được giữ trên thiết bị cho đến khi người dùng đổi phạm vi hoặc xóa dữ liệu trình duyệt; đây không phải bản sao được đồng bộ giữa nhiều thiết bị. Lượt xem Gold/tin nhắn không thuộc luồng gallery này.

Người dùng đã xác nhận đăng nhập được. Luồng lịch sử mới chưa được đối chiếu với toàn bộ ảnh trong tài khoản thật; kiểm thử giả lập xác minh truy vấn đúng database, phân trang đến ảnh cũ nhất, timestamp trùng nhau, loại trùng feed/history, giữ ảnh khi lỗi, tải tiếp và tạm dừng.

Chỉ metadata và liên kết media được giữ trong IndexedDB, không sao lưu byte ảnh/video gốc. Link media có thể hết hạn hoặc bị thu hồi. Đổi trình duyệt, dùng chế độ ẩn danh, xóa dữ liệu hoặc trình duyệt dọn dung lượng có thể mất bản lưu. Lựa chọn vẫn được giữ sau ngắt kết nối; đăng nhập đúng tài khoản để khôi phục. Yêu thích chỉ lưu mã khoảnh khắc trong localStorage, tách theo nguồn và tài khoản; không gửi reaction lên Locket. Giao diện dùng Inter, nội dung đậm 500, nút/nhãn đậm 600 và tiêu đề đậm 700–800.

Gallery chỉ dựng tối đa 60 thẻ ảnh mỗi trang; nút Trang trước/Trang tiếp cho phép duyệt toàn bộ ảnh đã tải, kể cả ảnh cũ nhất. Phân trang giao diện không giới hạn lượng ảnh đồng bộ/lưu. Ngày giờ, thứ tự ảnh và kết quả lọc được tái sử dụng. Chuyển tab không dựng lại sidebar/thống kê; nút yêu thích cập nhật tại chỗ; nút đổi kích thước ảnh chỉ đổi CSS. Trạng thái đồng bộ không thay thế lại các thẻ ảnh nếu dữ liệu không đổi. Ảnh dùng lazy loading và async decoding. Các sự kiện ảnh/nút được xử lý chung tại gallery.

Đo bằng `node scripts/benchmark-ui.mjs` với 10.000 khoảnh khắc trong DOM giả lập: trước sửa, dựng ban đầu ~2630 ms và đổi tab ~1363–2442 ms; sau sửa, dựng ban đầu ~38 ms và đổi tab ~0,3–1,3 ms. Đây chỉ là thời gian xử lý JavaScript trên máy thử, không phải số đo tải ảnh, layout, paint hoặc tương tác trình duyệt thật. Bộ kiểm thử còn kiểm tra 60 thẻ/trang, truy cập ảnh cuối, lọc/sắp xếp, xử lý nút theo delegation và không thay ảnh khi đổi trạng thái/bố cục.

Triển khai qua Sites với quyền riêng tư của chủ sở hữu. `.openai/hosting.json` giữ ID dự án. Browser QA chưa thực hiện được nếu môi trường không cung cấp trình duyệt.
