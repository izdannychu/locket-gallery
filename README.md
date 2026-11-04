# Locket Gallery

Gallery tiếng Việt cho ảnh/video Locket, chạy trên Cloudflare Worker và không cần thư viện runtime.

Yêu cầu Node.js 22+. Chạy `npm run build`, `npm test`, `npm run validate`, sau đó `npm run dev`. Mở http://localhost:4173. Máy chủ local tự sinh khóa phiên trong bộ nhớ; khởi động lại sẽ yêu cầu đăng nhập lại. Có thể cấu hình biến môi trường `SESSION_SECRET` bằng ít nhất 32 byte ngẫu nhiên. Trên Sites, khóa được giữ dưới dạng runtime secret.

Sửa các tệp trong `src/`; `scripts/build.mjs` nhúng giao diện vào Worker và tạo artifact. Không sửa trực tiếp `worker/index.js` vì đây là tệp sinh ra khi build.

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

Chức năng: đăng nhập email hoặc số quốc tế + mật khẩu (chưa hỗ trợ OTP), thông tin tài khoản, danh sách bạn bè có phân trang, ảnh/video từ feed Locket, lọc theo người/loại/tháng/từ khóa, yêu thích trên thiết bị, xem tệp gốc và metadata. Phiên AES-GCM trong cookie HttpOnly, SameSite=Strict, Secure trên HTTPS, gắn với người dùng Sites và hết hạn sau 7 ngày. Không lưu mật khẩu.

Đây là ứng dụng độc lập, tham khảo giao thức feed tại https://github.com/jumpogpo/locket-api. Lịch sử được đọc riêng từ database Firestore `locket`, collection `history/{uid}/entries` của chính tài khoản đang đăng nhập. Nguồn xác minh cấu trúc lịch sử: https://unpkg.com/@doi2523/locket-sdk@1.0.0/packages/firebase/src/services/moments.ts. Không cài hay chạy SDK bên ngoài; ứng dụng dùng REST và phiên hiện tại.

Sau khi kết nối, chọn 7/30/90/365 ngày gần đây hoặc nhập ngày bắt đầu và ngày kết thúc. Khoảng ngày bao gồm hết ngày kết thúc theo múi giờ trình duyệt và được giữ cố định. Web chỉ lưu khoảnh khắc trong khoảng đã chọn, cộng với khoảnh khắc mới của bạn bè kể từ lần lưu lựa chọn đầu tiên. Ảnh mới của chính chủ nằm ngoài khoảng chọn không được thêm tự động. Đổi khoảng ngày sẽ loại ảnh cũ không còn phù hợp; mốc bắt đầu nhận ảnh mới của bạn bè vẫn được giữ.

API lịch sử bắt buộc `from` (epoch ms, bao gồm), `to` (epoch ms, không bao gồm) và lọc ngay trong truy vấn Firestore. Các trang có 50 bản ghi, sắp xếp giảm dần theo `date` rồi `__name__`. Cursor giữ nguyên timestamp đến nano giây và mã document để không bỏ sót ảnh trùng thời gian. Tiếp tục đến khi truy vấn trả về rỗng. Feed mới nhất cũng phải qua bộ lọc cho phép trước khi hiển thị/lưu. Tham khảo REST cursor: https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery.

Thanh tiến độ cho biết số khoảnh khắc, số trang và ngày cũ nhất đã tải. Có thể Tạm dừng / Tiếp tục. Lựa chọn, metadata khoảnh khắc, bạn bè, cursor chưa hoàn tất và mốc cập nhật mới được lưu trong IndexedDB `locket-gallery-selected`, store `galleries`, khóa theo UID tài khoản Locket. Không lưu mật khẩu hoặc token tại đây. Chỉ khôi phục cache sau khi xác định tài khoản từ phiên máy chủ. Khi vào lại web, tải tiếp phần chưa xong và chỉ truy vấn phần mới kể từ mốc đã cập nhật; không quét lại lịch sử đã hoàn tất. Cursor và mốc mới chỉ được lưu sau khi ghi dữ liệu thành công, hỗ trợ tải lại an toàn nếu mất kết nối. Nếu lưu thất bại, giao diện báo lỗi và không tuyên bố đã lưu.

API nội bộ có thể thay đổi hoặc từ chối quyền đọc; chỉ có thể lấy nội dung tài khoản được phép truy cập. Cache đã chọn được giữ trên thiết bị cho đến khi người dùng đổi phạm vi hoặc xóa dữ liệu trình duyệt; đây không phải bản sao được đồng bộ giữa nhiều thiết bị. Lượt xem Gold/tin nhắn không thuộc luồng gallery này.

Người dùng đã xác nhận đăng nhập được. Luồng lịch sử mới chưa được đối chiếu với toàn bộ ảnh trong tài khoản thật; kiểm thử giả lập xác minh truy vấn đúng database, phân trang đến ảnh cũ nhất, timestamp trùng nhau, loại trùng feed/history, giữ ảnh khi lỗi, tải tiếp và tạm dừng.

Chỉ metadata và liên kết media được giữ trong IndexedDB, không sao lưu byte ảnh/video gốc. Link media có thể hết hạn hoặc bị thu hồi. Đổi trình duyệt, dùng chế độ ẩn danh, xóa dữ liệu hoặc trình duyệt dọn dung lượng có thể mất bản lưu. Lựa chọn vẫn được giữ sau ngắt kết nối; đăng nhập đúng tài khoản để khôi phục. Dữ liệu nhập thủ công không được tải lên server và mất khi tải lại trang. Yêu thích chỉ lưu mã khoảnh khắc trong localStorage, tách theo nguồn và tài khoản; không gửi reaction lên Locket. Giao diện dùng Inter, nội dung đậm 500, nút/nhãn đậm 600 và tiêu đề đậm 700. Lề, phần giới thiệu và khoảng cách ảnh được thu gọn trên desktop/mobile.

Gallery chỉ dựng tối đa 60 thẻ ảnh mỗi trang; nút Trang trước/Trang tiếp cho phép duyệt toàn bộ ảnh đã tải, kể cả ảnh cũ nhất. Phân trang giao diện không giới hạn lượng ảnh đồng bộ/lưu. Ngày giờ, thứ tự ảnh và kết quả lọc được tái sử dụng. Chuyển tab không dựng lại sidebar/thống kê; nút yêu thích cập nhật tại chỗ; nút đổi kích thước ảnh chỉ đổi CSS. Trạng thái đồng bộ không thay thế lại các thẻ ảnh nếu dữ liệu không đổi. Tìm kiếm chờ 120 ms sau lần gõ gần nhất, ảnh dùng lazy loading và async decoding. Các sự kiện ảnh/nút được xử lý chung tại gallery.

Đo bằng `node scripts/benchmark-ui.mjs` với 10.000 khoảnh khắc trong DOM giả lập: trước sửa, dựng ban đầu ~2630 ms và đổi tab ~1363–2442 ms; sau sửa, dựng ban đầu ~38 ms và đổi tab ~0,3–1,3 ms. Đây chỉ là thời gian xử lý JavaScript trên máy thử, không phải số đo tải ảnh, layout, paint hoặc tương tác trình duyệt thật. Bộ kiểm thử còn kiểm tra 60 thẻ/trang, truy cập ảnh cuối, lọc/sắp xếp, xử lý nút theo delegation và không thay ảnh khi đổi trạng thái/bố cục.

Nhập ảnh/video hoặc JSON. ZIP cần giải nén trước. JSON có thể là mảng khoảnh khắc hoặc chứa `moments`, `photos`, `result.data`. Chưa giả định định dạng archive chính thức khi chưa thấy dữ liệu thực tế. Ví dụ:

```json
{"me":{"uid":"me","name":"Bạn"},"friends":[{"uid":"friend","name":"Linh"}],"moments":[{"id":"one","user":"friend","image_url":"https://example.com/photo.jpg","caption":"Ngày đẹp","date":"2026-11-04T08:00:00+07:00"}]}
```

Ảnh/video rời dùng tên tệp làm caption, thời điểm chỉnh sửa làm ngày và người gửi mặc định là Bạn; đây không phải metadata Locket đã xác minh. JSON dùng URL media HTTPS. Hướng dẫn yêu cầu archive: https://help.locket.com/en/articles/14291054-can-i-download-or-request-a-copy-of-my-data

Triển khai qua Sites với quyền riêng tư của chủ sở hữu. `.openai/hosting.json` giữ ID dự án. Browser QA chưa thực hiện được nếu môi trường không cung cấp trình duyệt.
