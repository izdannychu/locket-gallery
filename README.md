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

Khi kết nối hoặc bấm Đồng bộ, web tự tải các trang lịch sử 50 bản ghi, sắp xếp giảm dần theo `date` rồi `__name__`. Cursor giữ nguyên timestamp đến nano giây và mã document để không bỏ sót ảnh trùng thời gian. Tiếp tục đến khi truy vấn trả về rỗng, không dừng chỉ vì trang ngắn. Feed mới nhất chỉ bổ sung nội dung; không dùng sync token làm cursor lịch sử. Tham khảo REST cursor: https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery.

Thanh tiến độ cho biết số khoảnh khắc, số trang và ngày cũ nhất đã tải. Có thể Tạm dừng / Tiếp tục. Nếu API lỗi hoặc lặp cursor, web giữ ảnh đã tải và báo đồng bộ chưa hoàn tất; Thử tải tiếp dùng cursor trước lần lỗi. Dữ liệu lịch sử và cursor chỉ ở bộ nhớ trang, không tồn tại qua reload. API nội bộ có thể thay đổi hoặc từ chối quyền đọc; chỉ có thể lấy nội dung còn tồn tại và tài khoản được phép truy cập, không khôi phục ảnh đã xóa. Lượt xem Gold/tin nhắn không thuộc luồng gallery này.

Người dùng đã xác nhận đăng nhập được. Luồng lịch sử mới chưa được đối chiếu với toàn bộ ảnh trong tài khoản thật; kiểm thử giả lập xác minh truy vấn đúng database, phân trang đến ảnh cũ nhất, timestamp trùng nhau, loại trùng feed/history, giữ ảnh khi lỗi, tải tiếp và tạm dừng.

Ảnh/thông tin được tải vào bộ nhớ trang, không sao lưu dài hạn. Tải lại trang sẽ tải lại feed và lịch sử. Dữ liệu nhập không được tải lên server và mất khi tải lại trang. Link media có thể hết hạn. Yêu thích chỉ lưu mã khoảnh khắc trong localStorage, tách theo nguồn và tài khoản; không gửi reaction lên Locket. Giao diện dùng Nunito Sans, độ đậm 500 cho nội dung và 600 cho tiêu đề/nút.

Nhập ảnh/video hoặc JSON. ZIP cần giải nén trước. JSON có thể là mảng khoảnh khắc hoặc chứa `moments`, `photos`, `result.data`. Chưa giả định định dạng archive chính thức khi chưa thấy dữ liệu thực tế. Ví dụ:

```json
{"me":{"uid":"me","name":"Bạn"},"friends":[{"uid":"friend","name":"Linh"}],"moments":[{"id":"one","user":"friend","image_url":"https://example.com/photo.jpg","caption":"Ngày đẹp","date":"2026-11-04T08:00:00+07:00"}]}
```

Ảnh/video rời dùng tên tệp làm caption, thời điểm chỉnh sửa làm ngày và người gửi mặc định là Bạn; đây không phải metadata Locket đã xác minh. JSON dùng URL media HTTPS. Hướng dẫn yêu cầu archive: https://help.locket.com/en/articles/14291054-can-i-download-or-request-a-copy-of-my-data

Triển khai qua Sites với quyền riêng tư của chủ sở hữu. `.openai/hosting.json` giữ ID dự án. Browser QA chưa thực hiện được nếu môi trường không cung cấp trình duyệt.
