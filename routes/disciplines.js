const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Đảm bảo đúng đường dẫn file config DB của bạn

// Helper response
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({ success, message, data });
};

// =====================================================
// 1. GET ALL DISCIPLINES (Join tên người bị kỷ luật)
// =====================================================
router.get("/", async (req, res) => {
  const { search, target_type, school_year } = req.query;

  try {
    let query = `
      SELECT 
        d.*,
        CASE 
          WHEN d.student_id IS NOT NULL THEN st.full_name
          WHEN d.teacher_id IS NOT NULL THEN t.full_name
          WHEN d.staff_id IS NOT NULL THEN sf.full_name
          ELSE 'N/A'
        END AS target_name,
        CASE 
          WHEN d.student_id IS NOT NULL THEN 'student'
          WHEN d.teacher_id IS NOT NULL THEN 'teacher'
          WHEN d.staff_id IS NOT NULL THEN 'staff'
          ELSE 'other'
        END AS target_type
      FROM disciplines d
      LEFT JOIN students st ON d.student_id = st.id
      LEFT JOIN teachers t ON d.teacher_id = t.id
      LEFT JOIN staffs sf ON d.staff_id = sf.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (d.violation LIKE ? OR d.disciplinary_action LIKE ? OR st.full_name LIKE ? OR t.full_name LIKE ? OR sf.full_name LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (school_year) {
      query += ` AND d.school_year = ?`;
      params.push(school_year);
    }

    if (target_type && target_type !== "all") {
      if (target_type === "student") query += ` AND d.student_id IS NOT NULL`;
      if (target_type === "teacher") query += ` AND d.teacher_id IS NOT NULL`;
      if (target_type === "staff") query += ` AND d.staff_id IS NOT NULL`;
    }

    query += ` ORDER BY d.discipline_date DESC, d.created_at DESC`;

    const [rows] = await db.query(query, params);
    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách kỷ luật thành công",
      rows,
    );
  } catch (error) {
    console.error("Lỗi lấy danh sách kỷ luật:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi lấy danh sách kỷ luật",
    );
  }
});

// =====================================================
// 2. GET AVAILABLE TARGETS (Dùng cho Dropdown chọn cá nhân)
// =====================================================
router.get("/targets/available", async (req, res) => {
  try {
    const [students] = await db.query(
      `SELECT id, full_name, 'student' AS target_type FROM students`,
    );
    const [teachers] = await db.query(
      `SELECT id, full_name, 'teacher' AS target_type FROM teachers`,
    );
    const [staffs] = await db.query(
      `SELECT id, full_name, 'staff' AS target_type FROM staffs`,
    );

    return sendResponse(res, 200, true, "Danh sách đối tượng", [
      ...students,
      ...teachers,
      ...staffs,
    ]);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi lấy danh sách đối tượng");
  }
});

// =====================================================
// 3. CREATE DISCIPLINE
// =====================================================
router.post("/", async (req, res) => {
  const {
    student_id,
    teacher_id,
    staff_id,
    violation,
    description,
    disciplinary_action,
    discipline_date,
    school_year,
  } = req.body;

  if (!violation) {
    return sendResponse(res, 400, false, "Hành vi vi phạm là bắt buộc");
  }

  try {
    const [result] = await db.query(
      `
      INSERT INTO disciplines 
      (student_id, teacher_id, staff_id, violation, description, disciplinary_action, discipline_date, school_year, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        student_id || null,
        teacher_id || null,
        staff_id || null,
        violation,
        description || null,
        disciplinary_action || "Khiển trách",
        discipline_date || null,
        school_year || "2025-2026",
      ],
    );

    return sendResponse(res, 201, true, "Thêm quyết định kỷ luật thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("Lỗi tạo kỷ luật:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ khi thêm kỷ luật");
  }
});

// =====================================================
// 4. UPDATE DISCIPLINE
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    student_id,
    teacher_id,
    staff_id,
    violation,
    description,
    disciplinary_action,
    discipline_date,
    school_year,
  } = req.body;

  try {
    const [result] = await db.query(
      `
      UPDATE disciplines
      SET student_id = ?, teacher_id = ?, staff_id = ?, violation = ?, description = ?, disciplinary_action = ?, discipline_date = ?, school_year = ?
      WHERE id = ?
      `,
      [
        student_id || null,
        teacher_id || null,
        staff_id || null,
        violation,
        description || null,
        disciplinary_action || null,
        discipline_date || null,
        school_year || null,
        id,
      ],
    );

    if (result.affectedRows === 0)
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy dữ liệu để cập nhật",
      );
    return sendResponse(res, 200, true, "Cập nhật thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi cập nhật kỷ luật");
  }
});

// =====================================================
// 5. DELETE DISCIPLINE
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(`DELETE FROM disciplines WHERE id = ?`, [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return sendResponse(res, 404, false, "Không tìm thấy dữ liệu");
    return sendResponse(res, 200, true, "Xóa kỷ luật thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi khi xóa kỷ luật");
  }
});

module.exports = router;
