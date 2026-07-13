const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Helper response chuẩn tích hợp log tự động
const sendResponse = (
  res,
  statusCode,
  success,
  message,
  data = null,
  extra = {},
) => {
  return res.status(statusCode).json({ success, message, data, ...extra });
};

// Helper hỗ trợ hiển thị Log lỗi chi tiết trên Terminal để Debug
const logErrorDetail = (apiName, err) => {
  console.log(
    `\n❌ [ERROR] ==================== ${apiName} ====================`,
  );
  console.log(`🔹 Thời gian: ${new Date().toLocaleString()}`);
  console.log(`🔹 Tên lỗi: ${err.name}`);
  console.log(`🔹 Chi tiết thông báo: ${err.message}`);
  if (err.sql) {
    console.log(`🔹 Câu lệnh SQL lỗi: ${err.sql}`);
    console.log(`🔹 Trạng thái SQL (Code): ${err.code}`);
  }
  console.error("🔹 Vị trí phát sinh lỗi (Stack Trace):\n", err.stack);
  console.log(
    `=================================================================\n`,
  );
};

// =========================================================================
// 1. GET ALL (Phân trang + Tìm kiếm tên/mã môn)
// =========================================================================
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const [rows] = await db.query(
      `SELECT * FROM subjects 
       WHERE subject_name LIKE ? OR subject_code LIKE ? 
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [`%${search}%`, `%${search}%`, limit, offset],
    );

    const [[totalCount]] = await db.query(
      `SELECT COUNT(*) as total FROM subjects WHERE subject_name LIKE ? OR subject_code LIKE ?`,
      [`%${search}%`, `%${search}%`],
    );

    return sendResponse(
      res,
      200,
      true,
      "Tải danh sách môn học thành công",
      rows,
      {
        total: totalCount?.total || 0,
        page,
        limit,
      },
    );
  } catch (err) {
    logErrorDetail("GET / (Danh sách môn học)", err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi hệ thống khi tải danh sách môn học: ${err.message}`,
    );
  }
});

// =========================================================================
// 2. DASHBOARD SUMMARY (Tổng quan tiểu học)
// =========================================================================
router.get("/dashboard/summary", async (req, res) => {
  try {
    const [[totalSubjects]] = await db.query(
      "SELECT COUNT(*) as total FROM subjects",
    );
    const [[totalTeachers]] = await db.query(
      "SELECT COUNT(*) as total FROM teachers",
    );
    const [[totalStudents]] = await db.query(
      "SELECT COUNT(*) as total FROM students",
    );

    return sendResponse(res, 200, true, "Tải số liệu thành công", {
      totalSubjects: totalSubjects?.total || 0,
      totalTeachers: totalTeachers?.total || 0,
      totalStudents: totalStudents?.total || 0,
    });
  } catch (err) {
    logErrorDetail("GET /dashboard/summary", err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi tải số liệu tổng quan: ${err.message}`,
    );
  }
});

// =========================================================================
// 3. POST: ASSIGN TEACHER (Phân công giáo viên)
// =========================================================================
router.post("/assign-teacher", async (req, res) => {
  console.log("➡️ [API ASSIGN TEACHER] Payload nhận được:", req.body);
  try {
    const { teacher_id, subject_id, class_id } = req.body;

    if (!teacher_id || !subject_id || !class_id) {
      return sendResponse(
        res,
        400,
        false,
        "Vui lòng chọn đầy đủ Giáo viên, Môn học và Lớp học!",
      );
    }

    // Kiểm tra xem lớp này môn này đã có ai dạy chưa
    const [duplicated] = await db.query(
      "SELECT id FROM teacher_subjects WHERE subject_id = ? AND class_id = ?",
      [subject_id, class_id],
    );
    if (duplicated.length > 0) {
      return sendResponse(
        res,
        400,
        false,
        "Môn học này tại lớp đã chọn đã có giáo viên phụ trách!",
      );
    }

    await db.query(
      "INSERT INTO teacher_subjects (teacher_id, subject_id, class_id) VALUES (?, ?, ?)",
      [teacher_id, subject_id, class_id],
    );

    return sendResponse(
      res,
      200,
      true,
      "Phân công giáo viên đứng lớp thành công",
    );
  } catch (err) {
    logErrorDetail("POST /assign-teacher", err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi hệ thống khi xử lý phân công: ${err.message}`,
    );
  }
});

// =========================================================================
// 4. GET: TEACHERS BY SUBJECT (Xem giáo viên phụ trách theo môn)
// =========================================================================
router.get("/teachers/:subjectId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.id, t.teacher_code, t.full_name, t.phone, c.class_name
       FROM teacher_subjects ts
       JOIN teachers t ON ts.teacher_id = t.id
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.subject_id = ?`,
      [req.params.subjectId],
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải danh sách giáo viên phụ trách thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail(`GET /teachers/${req.params.subjectId}`, err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi truy vấn giáo viên môn học: ${err.message}`,
    );
  }
});

// =========================================================================
// 5. GET: STUDENTS BY SUBJECT (Lấy toàn bộ học sinh theo môn học)
// =========================================================================
router.get("/students/:subjectId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT st.id, st.student_code, st.full_name, cl.class_name
       FROM teacher_subjects ts
       JOIN students st ON ts.class_id = st.class_id
       JOIN classes cl ON st.class_id = cl.id
       WHERE ts.subject_id = ?
       ORDER BY cl.class_name, st.full_name`,
      [req.params.subjectId],
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải danh sách học sinh thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail(`GET /students/${req.params.subjectId}`, err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi truy vấn danh sách học sinh: ${err.message}`,
    );
  }
});

// =========================================================================
// 6. FORM DATA (Lấy danh sách hỗ trợ cho các ô Select)
// =========================================================================
router.get("/form/data", async (req, res) => {
  try {
    const [teachers] = await db.query(
      "SELECT id, full_name FROM teachers ORDER BY full_name",
    );
    const [classes] = await db.query(
      "SELECT id, class_name FROM classes ORDER BY class_name",
    );
    return sendResponse(res, 200, true, "OK", { teachers, classes });
  } catch (err) {
    logErrorDetail("GET /form/data", err);
    return sendResponse(res, 500, false, `Lỗi nạp form data: ${err.message}`);
  }
});

// =========================================================================
// 7. CRUD BASIC (POST, PUT, DELETE, GET/:id)
// =========================================================================
router.post("/", async (req, res) => {
  console.log("➡️ [API CREATE SUBJECT] Body:", req.body);
  try {
    const { subject_code, subject_name, description } = req.body;

    // Vá lỗi: Đổi biến không tồn tại !notEmpty thành check thủ công tránh crash server
    if (!subject_code || !subject_name) {
      return sendResponse(
        res,
        400,
        false,
        "Thiếu thông tin mã môn học hoặc tên môn học",
      );
    }

    await db.query(
      "INSERT INTO subjects (subject_code, subject_name, description) VALUES (?, ?, ?)",
      [subject_code, subject_name, description || null],
    );
    return sendResponse(res, 201, true, "Thêm môn học thành công");
  } catch (err) {
    logErrorDetail("POST / (Tạo môn mới)", err);
    return sendResponse(res, 500, false, `Lỗi thêm môn học: ${err.message}`);
  }
});

router.put("/:id", async (req, res) => {
  console.log(`➡️ [API UPDATE SUBJECT] ID: ${req.params.id}, Body:`, req.body);
  try {
    const { subject_name, description } = req.body;

    if (!subject_name) {
      return sendResponse(res, 400, false, "Tên môn học không được để trống");
    }

    await db.query(
      "UPDATE subjects SET subject_name = ?, description = ? WHERE id = ?",
      [subject_name, description || null, req.params.id],
    );
    return sendResponse(res, 200, true, "Cập nhật thành công");
  } catch (err) {
    logErrorDetail(`PUT /${req.params.id}`, err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi cập nhật môn học: ${err.message}`,
    );
  }
});

router.delete("/:id", async (req, res) => {
  console.log(`➡️ [API DELETE SUBJECT] ID: ${req.params.id}`);
  try {
    await db.query("DELETE FROM subjects WHERE id = ?", [req.params.id]);
    return sendResponse(res, 200, true, "Xóa thành công");
  } catch (err) {
    logErrorDetail(`DELETE /${req.params.id}`, err);
    return sendResponse(
      res,
      500,
      false,
      `Lỗi liên kết dữ liệu học sinh/giáo viên: ${err.message}`,
    );
  }
});

module.exports = router;
