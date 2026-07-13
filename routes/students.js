const router = require("express").Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
/* =========================================================
   📌 GET ALL STUDENTS (PAGINATION + FILTER)
========================================================= */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const classId = req.query.class_id || "";

    let where = " WHERE 1=1";
    let params = [];

    if (search) {
      where += ` AND (s.full_name LIKE ? OR s.student_code LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (classId) {
      where += ` AND s.class_id = ?`;
      params.push(classId);
    }

    const [[count]] = await db.query(
      `SELECT COUNT(*) as total FROM students s ${where}`,
      params,
    );

    const [rows] = await db.query(
      `
      SELECT s.*, c.class_name
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    res.json({
      success: true,
      data: rows,
      total: count.total,
      page,
      limit,
      totalPages: Math.ceil(count.total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================================================
   📌 GET BY ID
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [[row]] = await db.query(
      `
      SELECT s.*, c.class_name
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
      `,
      [req.params.id],
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📌 CREATE STUDENT
========================================================= */
router.post("/", async (req, res) => {
  // Lấy kết nối từ pool để thực hiện Transaction (giao dịch)
  const connection = await db.getConnection();

  try {
    // Bắt đầu Transaction
    await connection.beginTransaction();

    const {
      student_code,
      full_name,
      gender,
      birthday,
      phone,
      email,
      address,
      avatar,
      class_id,
    } = req.body;

    // BƯỚC 1: TẠO THÔNG TIN HỌC SINH TRƯỚC
    const [studentResult] = await connection.query(
      `
      INSERT INTO students
      (student_code, full_name, gender, birthday, phone, email, address, avatar, class_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        student_code,
        full_name,
        gender,
        birthday,
        phone,
        email,
        address,
        avatar,
        class_id,
      ],
    );

    const newStudentId = studentResult.insertId; // Lấy ID tự động tăng của học sinh vừa tạo

    // BƯỚC 2: TẠO TÀI KHOẢN TRONG BẢNG USERS VÀ LƯU STUDENT_ID
    const defaultPassword = "123456"; // Mật khẩu mặc định
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

    const [userResult] = await connection.query(
      `
      INSERT INTO users (username, password, role, is_active, student_id)
      VALUES (?, ?, 'student', 1, ?)
      `,
      [
        email, // Lấy email làm tên đăng nhập cho tiện quản lý
        hashedPassword,
        newStudentId, // Lưu id học sinh trực tiếp vào đây giống cấu trúc teacher_id
      ],
    );

    // Nếu cả 2 bước trên chạy thành công không lỗi, xác nhận lưu dữ liệu vĩnh viễn
    await connection.commit();

    res.json({
      success: true,
      message: "Tạo học sinh và tài khoản thành công!",
      student_id: newStudentId,
      user_id: userResult.insertId,
      account_info: {
        username: student_code,
        password_default: defaultPassword,
      },
    });
  } catch (err) {
    // Nếu xảy ra lỗi ở bất kỳ bước nào (ví dụ trùng username/mã học sinh), hủy bỏ toàn bộ dữ liệu đã ghi tạm
    await connection.rollback();
    console.error("Lỗi khi tạo học sinh:", err);

    res.status(500).json({
      success: false,
      message:
        err.code === "ER_DUP_ENTRY"
          ? "Mã học sinh hoặc tài khoản đã tồn tại!"
          : "Lỗi hệ thống",
      error: err,
    });
  } finally {
    // Giải phóng và trả lại kết nối cho pool
    connection.release();
  }
});

/* =========================================================
   📌 UPDATE
========================================================= */
router.put("/:id", async (req, res) => {
  try {
    await db.query(`UPDATE students SET ? WHERE id = ?`, [
      req.body,
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "Cập nhật thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📌 DELETE
========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM students WHERE id = ?`, [req.params.id]);

    res.json({
      success: true,
      message: "Xóa thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📌 CLASS STUDENTS (FOR SCORE TABLE)
========================================================= */
router.get("/class/:classId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT id, student_code, full_name, class_id
      FROM students
      WHERE class_id = ?
      ORDER BY full_name ASC
      `,
      [req.params.classId],
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📌 TRANSFER CLASS
========================================================= */
router.put("/transfer/:id", async (req, res) => {
  try {
    const { class_id } = req.body;

    await db.query(`UPDATE students SET class_id = ? WHERE id = ?`, [
      class_id,
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "Chuyển lớp thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📌 PROFILE (STUDENT + SCORES + ATTENDANCE)
========================================================= */
router.get("/profile/:id", async (req, res) => {
  try {
    const [[student]] = await db.query(
      `
      SELECT s.*, c.class_name
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
      `,
      [req.params.id],
    );

    const [scores] = await db.query(
      `
      SELECT
        sb.subject_name,
        ROUND(AVG(sc.score),2) as average
      FROM scores sc
      JOIN subjects sb ON sc.subject_id = sb.id
      WHERE sc.student_id = ?
      GROUP BY sc.subject_id
      `,
      [req.params.id],
    );

    const [attendance] = await db.query(
      `
      SELECT attendance_date, status
      FROM attendance
      WHERE student_id = ?
      ORDER BY attendance_date DESC
      LIMIT 30
      `,
      [req.params.id],
    );

    res.json({
      success: true,
      data: {
        student,
        scores,
        attendance,
      },
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/class/:classId/subject/:subjectId", async (req, res) => {
  try {
    const { classId, subjectId } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        st.id,
        st.student_code,
        st.full_name,

        MAX(CASE WHEN sc.score_type='mieng' THEN sc.score END) AS mieng,
        MAX(CASE WHEN sc.score_type='15p' THEN sc.score END) AS p15,
        MAX(CASE WHEN sc.score_type='1tiet' THEN sc.score END) AS tiet1,
        MAX(CASE WHEN sc.score_type='giuaky' THEN sc.score END) AS giuaky,
        MAX(CASE WHEN sc.score_type='cuoiky' THEN sc.score END) AS cuoiky

      FROM students st
      LEFT JOIN scores sc
        ON sc.student_id = st.id
        AND sc.subject_id = ?

      WHERE st.class_id = ?

      GROUP BY st.id
      `,
      [subjectId, classId],
    );

    const result = rows.map((r) => {
      const avg =
        (Number(r.mieng || 0) * 1 +
          Number(r.p15 || 0) * 1 +
          Number(r.tiet1 || 0) * 2 +
          Number(r.giuaky || 0) * 3 +
          Number(r.cuoiky || 0) * 3) /
        10;

      return {
        ...r,
        average: Number(avg.toFixed(2)),
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.post("/upsert", async (req, res) => {
  try {
    const { scores } = req.body;

    if (!Array.isArray(scores)) {
      return res.status(400).json({
        success: false,
        message: "Invalid data",
      });
    }

    for (const item of scores) {
      await db.query(
        `
        INSERT INTO scores
        (student_id, subject_id, semester, score_type, score)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          score = VALUES(score)
        `,
        [
          item.student_id,
          item.subject_id,
          item.semester,
          item.score_type,
          item.score,
        ],
      );
    }

    res.json({
      success: true,
      message: "Lưu điểm realtime thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
/* =========================================================
   📌 STATISTICS
========================================================= */
router.get("/statistics/gender", async (req, res) => {
  const [rows] = await db.query(`
    SELECT gender, COUNT(*) as total
    FROM students
    GROUP BY gender
  `);

  res.json(rows);
});

router.get("/statistics/class", async (req, res) => {
  const [rows] = await db.query(`
    SELECT c.class_name, COUNT(s.id) as total_students
    FROM classes c
    LEFT JOIN students s ON c.id = s.class_id
    GROUP BY c.id
  `);

  res.json(rows);
});

router.get("/statistics/top", async (req, res) => {
  const [rows] = await db.query(`
    SELECT
      st.student_code,
      st.full_name,
      ROUND(AVG(sc.score),2) as avg_score
    FROM students st
    JOIN scores sc ON st.id = sc.student_id
    GROUP BY st.id
    ORDER BY avg_score DESC
    LIMIT 10
  `);

  res.json(rows);
});

/* =========================================================
   📌 DASHBOARD SUMMARY
========================================================= */
router.get("/dashboard/summary", async (req, res) => {
  const [[total]] = await db.query(`SELECT COUNT(*) as total FROM students`);

  const [[male]] = await db.query(
    `SELECT COUNT(*) as total FROM students WHERE gender='Nam'`,
  );

  const [[female]] = await db.query(
    `SELECT COUNT(*) as total FROM students WHERE gender='Nữ'`,
  );

  const [[avg]] = await db.query(`
    SELECT ROUND(AVG(score),2) as average
    FROM scores
  `);

  res.json({
    totalStudents: total.total,
    maleStudents: male.total,
    femaleStudents: female.total,
    averageScore: avg.average || 0,
  });
});

module.exports = router;
