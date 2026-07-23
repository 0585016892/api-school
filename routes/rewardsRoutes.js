const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Helper response
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({ success, message, data });
};

// =====================================================
// 1. GET ALL REWARDS (Kèm Join lấy tên người được khen)
// =====================================================
router.get("/", async (req, res) => {
  const { search, target_type, school_year } = req.query;

  try {
    let query = `
      SELECT 
        r.*,
        CASE 
          WHEN r.student_id IS NOT NULL THEN st.full_name
          WHEN r.teacher_id IS NOT NULL THEN t.full_name
          WHEN r.staff_id IS NOT NULL THEN sf.full_name
          ELSE 'N/A'
        END AS target_name,
        CASE 
          WHEN r.student_id IS NOT NULL THEN 'student'
          WHEN r.teacher_id IS NOT NULL THEN 'teacher'
          WHEN r.staff_id IS NOT NULL THEN 'staff'
          ELSE 'other'
        END AS target_type
      FROM rewards r
      LEFT JOIN students st ON r.student_id = st.id
      LEFT JOIN teachers t ON r.teacher_id = t.id
      LEFT JOIN staffs sf ON r.staff_id = sf.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (r.title LIKE ? OR st.full_name LIKE ? OR t.full_name LIKE ? OR sf.full_name LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (school_year) {
      query += ` AND r.school_year = ?`;
      params.push(school_year);
    }

    if (target_type && target_type !== "all") {
      if (target_type === "student") query += ` AND r.student_id IS NOT NULL`;
      if (target_type === "teacher") query += ` AND r.teacher_id IS NOT NULL`;
      if (target_type === "staff") query += ` AND r.staff_id IS NOT NULL`;
    }

    query += ` ORDER BY r.reward_date DESC, r.created_at DESC`;

    const [rows] = await db.query(query, params);
    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách khen thưởng thành công",
      rows,
    );
  } catch (error) {
    console.error("Lỗi lấy danh sách khen thưởng:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi lấy danh sách khen thưởng",
    );
  }
});

// =====================================================
// 2. GET AVAILABLE TARGETS (Dùng cho Dropdown chọn người)
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
// 3. CREATE REWARD
// =====================================================
router.post("/", async (req, res) => {
  const {
    student_id,
    teacher_id,
    staff_id,
    title,
    reason,
    reward_type,
    reward_date,
    school_year,
  } = req.body;

  if (!title) {
    return sendResponse(res, 400, false, "Tiêu đề khen thưởng là bắt buộc");
  }

  try {
    const [result] = await db.query(
      `
      INSERT INTO rewards 
      (student_id, teacher_id, staff_id, title, reason, reward_type, reward_date, school_year, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        student_id || null,
        teacher_id || null,
        staff_id || null,
        title,
        reason || null,
        reward_type || "Cấp trường",
        reward_date || null,
        school_year || "2025-2026",
      ],
    );

    return sendResponse(res, 201, true, "Thêm khen thưởng thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("Lỗi tạo khen thưởng:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ khi thêm khen thưởng");
  }
});

// =====================================================
// 4. UPDATE REWARD
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    student_id,
    teacher_id,
    staff_id,
    title,
    reason,
    reward_type,
    reward_date,
    school_year,
  } = req.body;

  try {
    const [result] = await db.query(
      `
      UPDATE rewards
      SET student_id = ?, teacher_id = ?, staff_id = ?, title = ?, reason = ?, reward_type = ?, reward_date = ?, school_year = ?
      WHERE id = ?
      `,
      [
        student_id || null,
        teacher_id || null,
        staff_id || null,
        title,
        reason || null,
        reward_type || null,
        reward_date || null,
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
    return sendResponse(res, 500, false, "Lỗi cập nhật khen thưởng");
  }
});

// =====================================================
// 5. DELETE REWARD
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(`DELETE FROM rewards WHERE id = ?`, [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return sendResponse(res, 404, false, "Không tìm thấy dữ liệu");
    return sendResponse(res, 200, true, "Xóa khen thưởng thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi khi xóa khen thưởng");
  }
});

module.exports = router;
