const router = require("express").Router();
const db = require("../config/db");

/* =========================================================
   📌 GET ALL ATTENDANCE (FILTER + PAGINATION + ROLE READY)
========================================================= */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 40);
    const offset = (page - 1) * limit;

    const search = req.query.search || "";
    const classId = req.query.class_id || "";
    const date = req.query.date || "";
    const teacherId = req.query.teacher_id || "";

    let where = ` WHERE 1=1 `;
    const params = [];

    if (search) {
      where += `
        AND (s.full_name LIKE ? OR s.student_code LIKE ?)
      `;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (classId) {
      where += ` AND a.class_id = ? `;
      params.push(classId);
    }

    if (date) {
      where += ` AND a.attendance_date = ? `;
      params.push(date);
    }

    if (teacherId) {
      where += ` AND a.teacher_id = ? `;
      params.push(teacherId);
    }

    // COUNT
    const [[count]] = await db.query(
      `SELECT COUNT(*) as total 
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       ${where}`,
      params,
    );

    // DATA
    const [rows] = await db.query(
      `
      SELECT 
        a.*,
        s.full_name,
        s.student_code,
        c.class_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN classes c ON a.class_id = c.id
      ${where}
      ORDER BY a.attendance_date DESC, a.id DESC
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
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi load attendance",
      error: err.message,
    });
  }
});
router.get("/class/:classId/students", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        id,
        student_code,
        full_name,
        class_id
      FROM students
      WHERE class_id = ?
      ORDER BY full_name ASC
      `,
      [req.params.classId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.post("/bulk", async (req, res) => {
  try {
    const { class_id, attendance_date, teacher_id, students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không hợp lệ",
      });
    }

    // 1. Lấy danh sách ID được gửi lên từ phía Client
    const incomingIds = students.map((s) => s.student_id);

    // 2. Kiểm tra xem những ID nào thực sự tồn tại trong Database
    const [existingStudents] = await db.query(
      "SELECT id FROM students WHERE id IN (?)",
      [incomingIds],
    );
    const validIds = existingStudents.map((row) => row.id);

    // 3. Lọc lại danh sách học sinh hợp lệ
    const validStudents = students.filter((s) =>
      validIds.includes(s.student_id),
    );

    if (validStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Không có học sinh nào tồn tại hợp lệ trong hệ thống để điểm danh.",
      });
    }

    // Định dạng lại mảng cho bulk insert từ danh sách ĐÃ LỌC
    const values = validStudents.map((s) => [
      s.student_id,
      class_id,
      attendance_date,
      s.status || "present",
      s.note || null,
      teacher_id || null,
    ]);

    // Thực hiện Bulk Insert an toàn
    await db.query(
      `
      INSERT INTO attendance
        (student_id, class_id, attendance_date, status, note, teacher_id)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        note = VALUES(note),
        teacher_id = VALUES(teacher_id)
      `,
      [values],
    );

    // Trả thêm thông tin cảnh báo nếu có ID bị bỏ qua
    const skippedCount = students.length - validStudents.length;
    res.json({
      success: true,
      message:
        skippedCount > 0
          ? `Điểm danh thành công cho ${validStudents.length} học sinh. Bỏ qua ${skippedCount} học sinh do sai ID.`
          : "Ghi nhận điểm danh thành công cho cả lớp!",
    });
  } catch (err) {
    console.error("Lỗi Bulk Attendance:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lưu điểm danh",
      error: err.sqlMessage || err.message,
    });
  }
});
router.post("/", async (req, res) => {
  try {
    const { student_id, class_id, attendance_date, status, note, teacher_id } =
      req.body;

    await db.query(
      `
      INSERT INTO attendance
      (student_id, class_id, attendance_date, status, note, teacher_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [student_id, class_id, attendance_date, status, note, teacher_id || null],
    );

    res.json({
      success: true,
      message: "Điểm danh thành công",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});
router.put("/:id", async (req, res) => {
  try {
    await db.query(
      `
      UPDATE attendance
      SET ?
      WHERE id = ?
      `,
      [req.body, req.params.id],
    );

    res.json({
      success: true,
      message: "Cập nhật thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.delete("/:id", async (req, res) => {
  try {
    await db.query(
      `
      DELETE FROM attendance
      WHERE id = ?
      `,
      [req.params.id],
    );

    res.json({
      success: true,
      message: "Xóa thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/statistics/summary", async (req, res) => {
  try {
    const [[present]] = await db.query(
      `SELECT COUNT(*) total FROM attendance WHERE status='present'`,
    );

    const [[late]] = await db.query(
      `SELECT COUNT(*) total FROM attendance WHERE status='late'`,
    );

    const [[absent]] = await db.query(
      `SELECT COUNT(*) total FROM attendance WHERE status='absent'`,
    );

    const [[excused]] = await db.query(
      `SELECT COUNT(*) total FROM attendance WHERE status='excused'`,
    );

    res.json({
      success: true,
      data: {
        present: present.total,
        late: late.total,
        absent: absent.total,
        excused: excused.total,
      },
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/teacher/:teacherId/class/:classId", async (req, res) => {
  try {
    const { teacherId, classId } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        a.id,
        a.attendance_date,
        a.status,
        a.note,
        a.student_id,
        s.student_code,
        s.full_name,
        c.class_name
      FROM attendance a
      INNER JOIN students s
        ON a.student_id = s.id
      INNER JOIN classes c
        ON a.class_id = c.id
      WHERE c.id = ?
        AND c.homeroom_teacher_id = ?
      ORDER BY a.attendance_date DESC, s.full_name
      `,
      [classId, teacherId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
module.exports = router;
