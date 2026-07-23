const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto"); // 🌟 BỔ SUNG: Import thư viện crypto để tạo mật khẩu ngẫu nhiên

const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const db = require("../config/db");
const ALLOWED_ROLES = [
  "admin",
  "principal",
  "vice_principal",
  "department_head",
  "teacher",
  "office_staff",
  "union_president",
  "school_council",
  "student",
  "parent",
];
// ================= CẤU HÌNH TRÌNH TỰ ĐỘNG GỬI MAIL (NODEMAILER) =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================= API: FORGOT PASSWORD =================
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const username = email.email; // Giả định username chính là email, bạn có thể điều chỉnh nếu cần
    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp địa chỉ Email để khôi phục!",
      });
    }
    console.log("FORGOT PASSWORD BODY:", username);

    // 1. Kiểm tra xem Email có tồn tại trong hệ thống Database không
    const [users] = await db.query(
      `
      SELECT *
      FROM users 
      WHERE username = ?
      `,
      [username],
    );
    console.log("FORGOT PASSWORD USERS:", users);
    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "Địa chỉ Email này không tồn tại trên hệ thống dữ liệu!",
      });
    }

    const user = users[0];

    // 2. Kiểm tra xem tài khoản có đang bị khóa (is_active = 0) hay không
    if (Number(user.is_active) === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Tài khoản liên kết với Email này đang bị khóa, không thể lấy lại mật khẩu!",
      });
    }

    // 3. Tạo một mật khẩu ngẫu nhiên mới gồm 8 ký tự thô
    const newRawPassword = crypto.randomBytes(4).toString("hex"); // Sinh ra chuỗi như: "a1b2c3d4"

    // 4. Mã hóa băm bằng bcryptjs mật khẩu mới trước khi lưu vào Database
    // 🌟 ĐÃ SỬA: Chuyển sang cú pháp chuẩn, gọn gàng và an toàn của bcryptjs
    const hashedNewPassword = await bcrypt.hash(newRawPassword, 10);

    // 5. Tiến hành cập nhật mật khẩu mới vào bảng Users
    await db.query(
      `
      UPDATE users 
      SET password = ? 
      WHERE id = ?
      `,
      [hashedNewPassword, user.id],
    );

    // 6. Cấu hình nội dung thư gửi về cho người dùng đúng tone màu #37B0C3
    const mailOptions = {
      from: `"Hệ Thống Quản Lý Giáo Dục EDU SYSTEM" <${process.env.EMAIL_USER}>`,
      to: user.username,
      subject: "🔑 Yêu cầu khôi phục mật khẩu tài khoản hệ thống Portal",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #37B0C3; margin: 0; font-size: 22px;">EDU SYSTEM PORTAL</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Hệ thống Quản lý Học tập & Giảng dạy tích hợp</p>
          </div>
          <hr style="border: 0; border-top: 1px dashed #e2e8f0; margin: 20px 0;" />
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Chào bạn,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hệ thống đã tiếp nhận yêu cầu xin cấp lại mật khẩu của bạn cho tài khoản đăng nhập: <strong style="color: #0f172a;">${user.username}</strong>.</p>
          
          <div style="background-color: #eefafc; border-left: 4px solid #37B0C3; padding: 12px; margin: 20px 0; border-radius: 4px;">
            <span style="color: #475569; font-size: 13px; display: block;">Mật khẩu đăng nhập mới tạm thời của bạn là:</span>
            <strong style="color: #0f172a; font-size: 18px; font-family: monospace; display: block; margin-top: 6px; letter-spacing: 1px;">${newRawPassword}</strong>
          </div>

          <p style="color: #ef4444; font-size: 12px; font-style: italic; line-height: 1.5;">⚠️ Lưu ý bảo mật: Hãy đăng nhập ngay lập tức và tiến hành thay đổi lại mật khẩu này tại mục "Hồ sơ cá nhân & Bảo mật" để bảo vệ tài khoản của bạn.</p>
          <hr style="border: 0; border-top: 1px dashed #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">Đây là thư gửi tự động từ hệ thống trường học, vui lòng không phản hồi lại thư này.</p>
        </div>
      `,
    };

    // 7. Thực hiện lệnh gửi thư bất đồng bộ
    await transporter.sendMail(mailOptions);
    console.log(`FORGOT PASSWORD: Mật khẩu mới đã được gửi tới ${user.email}`);

    return res.json({
      success: true,
      message: "Mật khẩu mới đã được gửi thành công vào hòm thư Email của bạn!",
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({
      success: false,
      message:
        "Có lỗi xảy ra trên hệ thống máy chủ trong quá trình gửi Mail khôi phục!",
      error: err.message,
    });
  }
});
router.post("/login", async (req, res) => {
  try {
    console.log("BODY:", req.body);
    const { username, password } = req.body;

    const [users] = await db.query(
      `
      SELECT *
      FROM users
      WHERE username=?
      `,
      [username],
    );

    console.log("USERS:", users);

    if (!users.length) {
      console.log("Không tìm thấy user");
      return res.status(400).json({
        message: "Tài khoản hoặc mật khẩu không chính xác", // Gộp chung thông báo để tăng tính bảo mật
      });
    }

    const user = users[0];
    console.log("USER DB:", user);

    // ================= 1. KIỂM TRA TRẠNG THÁI HOẠT ĐỘNG (IS_ACTIVE) NGAY TỪ ĐẦU =================
    // Cản lại ngay lập tức nếu tài khoản bị khóa (is_active = 0), không cho tạo Token
    if (Number(user.is_active) === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa bởi quản trị viên!",
      });
    }

    const check = await bcrypt.compare(password, user.password);
    console.log("PASSWORD MATCH:", check);

    if (!check) {
      return res.status(400).json({
        message: "Tài khoản hoặc mật khẩu không chính xác",
      });
    }

    // Gán thêm thông tin an toàn vào mã Token ký mã hóa
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        teacher_id: user.teacher_id,
        student_id: user.student_id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES,
      },
    );

    console.log("TOKEN CREATED");

    // Trả về dữ liệu JSON kèm đầy đủ thông tin trạng thái
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        teacher_id: user.teacher_id,
        student_id: user.student_id,
        is_active: user.is_active, // 🌟 QUAN TRỌNG: Phải trả trường này về thì Frontend mới check được dự phòng!
      },
    });
  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});
router.post("/register", async (req, res) => {
  try {
    const {
      username,
      password,
      role = "student",
      teacher_id = null,
      student_id = null,
      is_active = 1, // Mặc định là 1 (hoạt động)
    } = req.body;

    // 1. Kiểm tra đầu vào bắt buộc
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ tên tài khoản và mật khẩu",
      });
    }

    // 2. Kiểm tra xem username đã tồn tại trong hệ thống chưa
    const [existingUser] = await db.query(
      "SELECT id FROM users WHERE username = ?",
      [username],
    );

    if (existingUser && existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Tên tài khoản này đã được sử dụng",
      });
    }

    // 3. Mã hóa mật khẩu
    const hash = await bcrypt.hash(password, 10);

    // 4. Thêm tài khoản mới vào DB (created_at tự động lấy CURRENT_TIMESTAMP)
    const [result] = await db.query(
      `
      INSERT INTO users (
        username,
        password,
        role,
        teacher_id,
        student_id,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        username.trim(),
        hash,
        role || "student",
        teacher_id || null,
        student_id || null,
        is_active !== undefined ? is_active : 1,
      ],
    );

    // 5. Trả về kết quả thành công
    return res.status(201).json({
      success: true,
      message: "Tạo tài khoản thành công",
      data: {
        id: result.insertId,
        username,
        role: role || "student",
        teacher_id: teacher_id || null,
        student_id: student_id || null,
        is_active: is_active !== undefined ? is_active : 1,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Lỗi máy chủ nội bộ khi đăng ký tài khoản",
    });
  }
});

router.get("/me", auth, async (req, res) => {
  console.log("REQ USER:", req.user);
  try {
    const [rows] = await db.query(
      `
            SELECT

                id,
                username,
                role,
                teacher_id

            FROM users

            WHERE id=?
            `,
      [req.user.id],
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const [[user]] = await db.query(
      `
            SELECT *
            FROM users
            WHERE id=?
            `,
      [req.user.id],
    );

    const check = await bcrypt.compare(oldPassword, user.password);

    if (!check) {
      return res.status(400).json({
        message: "Mật khẩu cũ sai",
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `
            UPDATE users
            SET password=?
            WHERE id=?
            `,
      [hash, req.user.id],
    );

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/reset-password/:id", auth, admin, async (req, res) => {
  try {
    const hash = await bcrypt.hash("123456", 10);

    await db.query(
      `
            UPDATE users
            SET password=?
            WHERE id=?
            `,
      [hash, req.params.id],
    );

    res.json({
      success: true,
      message: "Reset thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/users", auth, admin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT

                id,
                username,
                role,
                is_active,
                created_at

            FROM users

            ORDER BY id DESC
            `,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/lock/:id", auth, admin, async (req, res) => {
  try {
    await db.query(
      `
            UPDATE users
            SET is_active=0
            WHERE id=?
            `,
      [req.params.id],
    );

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/unlock/:id", auth, admin, async (req, res) => {
  try {
    await db.query(
      `
            UPDATE users
            SET is_active=1
            WHERE id=?
            `,
      [req.params.id],
    );

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/:id/change-role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // 1. Kiểm tra xem role truyền lên có hợp lệ không
    if (!role || !ALLOWED_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Vai trò (role) không hợp lệ!",
      });
    }

    const formattedRole = role.toLowerCase();

    // 2. Kiểm tra xem user có tồn tại trong DB không
    const [user] = await db.query("SELECT id, role FROM users WHERE id = ?", [
      id,
    ]);

    if (!user || user.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // 3. Cập nhật role mới trong Database
    await db.query("UPDATE users SET role = ? WHERE id = ?", [
      formattedRole,
      id,
    ]);

    return res.json({
      success: true,
      message: "Cập nhật vai trò thành công",
      data: {
        id: Number(id),
        newRole: formattedRole,
      },
    });
  } catch (error) {
    console.error("CHANGE ROLE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật vai trò",
    });
  }
});
module.exports = router;
/**
 * | Method | API                            |
| ------ | ------------------------------ |
| POST   | `/api/auth/login`              |
| POST   | `/api/auth/register`           |
| GET    | `/api/auth/me`                 |
| PUT    | `/api/auth/change-password`    |
| PUT    | `/api/auth/reset-password/:id` |
| GET    | `/api/auth/users`              |
| PUT    | `/api/auth/lock/:id`           |
| PUT    | `/api/auth/unlock/:id`         |

 */
