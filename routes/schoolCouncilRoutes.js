const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ===============================
// RESPONSE HELPER
// ===============================
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({
    success,
    message,
    data,
  });
};

// =====================================================
// GET ALL SCHOOL COUNCILS
// =====================================================
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        sc.*,
        COUNT(cm.id) AS member_count
      FROM school_councils sc
      LEFT JOIN council_members cm ON cm.council_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `);

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách hội đồng thành công",
      rows,
    );
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Không thể lấy danh sách hội đồng");
  }
});

// =====================================================
// GET DETAIL (Đã loại bỏ parent_id)
// =====================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [council] = await db.query(
      `SELECT * FROM school_councils WHERE id = ?`,
      [id],
    );

    if (council.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy hội đồng");
    }

    const [members] = await db.query(
      `
      SELECT
        cm.*,
        CASE
          WHEN cm.teacher_id IS NOT NULL THEN t.full_name
          WHEN cm.staff_id IS NOT NULL THEN s.full_name
          ELSE 'Thành viên'
        END AS full_name,

        CASE
          WHEN cm.teacher_id IS NOT NULL THEN 'teacher'
          WHEN cm.staff_id IS NOT NULL THEN 'staff'
          ELSE 'other'
        END AS member_type

      FROM council_members cm
      LEFT JOIN teachers t ON cm.teacher_id = t.id
      LEFT JOIN staffs s ON cm.staff_id = s.id
      WHERE cm.council_id = ?
      `,
      [id],
    );

    return sendResponse(res, 200, true, "Chi tiết hội đồng", {
      ...council[0],
      members,
    });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi lấy chi tiết");
  }
});

// =====================================================
// CREATE
// =====================================================
router.post("/", async (req, res) => {
  const {
    name,
    type,
    description,
    status = "active",
    chairman_name,
  } = req.body;

  try {
    const [result] = await db.query(
      `
      INSERT INTO school_councils (name, type, description, chairman_name, status, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [name, type, description, chairman_name || null, status],
    );

    return sendResponse(res, 201, true, "Tạo hội đồng thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Không thể tạo hội đồng");
  }
});

// =====================================================
// UPDATE
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, type, description, chairman_name, status } = req.body;

  try {
    await db.query(
      `
      UPDATE school_councils
      SET name = ?, type = ?, description = ?, chairman_name = ?, status = ?
      WHERE id = ?
      `,
      [name, type, description, chairman_name || null, status, id],
    );

    return sendResponse(res, 200, true, "Cập nhật thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi cập nhật");
  }
});

// =====================================================
// DELETE
// =====================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(`DELETE FROM school_councils WHERE id = ?`, [id]);
    return sendResponse(res, 200, true, "Xóa hội đồng thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi xóa");
  }
});

// =====================================================
// GET AVAILABLE MEMBERS (Chỉ lấy Teachers & Staffs)
// =====================================================
router.get("/members/available", async (req, res) => {
  try {
    const [teachers] = await db.query(`
      SELECT id, full_name, 'teacher' AS member_type
      FROM teachers
      WHERE status = 'active'
    `);

    const [staffs] = await db.query(`
      SELECT id, full_name, 'staff' AS member_type
      FROM staffs
      WHERE status = 'active'
    `);

    return sendResponse(res, 200, true, "Danh sách thành viên", [
      ...teachers,
      ...staffs,
    ]);
  } catch (error) {
    console.error(error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi lấy danh sách thành viên khả dụng",
    );
  }
});

// =====================================================
// ADD MEMBER TO COUNCIL
// =====================================================
// =====================================================
// ADD MEMBER TO COUNCIL
// =====================================================
router.post("/:id/members", async (req, res) => {
  const council_id = req.params.id;
  const { member_id, member_type, position = "member" } = req.body;

  console.log("Payload nhận được từ Client:", req.body);

  // Xác định rõ ID thuộc về giáo viên hay nhân viên
  const teacher_id = member_type === "teacher" ? Number(member_id) : null;
  const staff_id = member_type === "staff" ? Number(member_id) : null;

  try {
    if (!teacher_id && !staff_id) {
      return sendResponse(res, 400, false, "Vui lòng chọn thành viên hợp lệ!");
    }

    // Kiểm tra xem thành viên này đã có trong hội đồng chưa
    const [exist] = await db.query(
      `
      SELECT id FROM council_members
      WHERE council_id = ?
      AND (
        (teacher_id IS NOT NULL AND teacher_id = ?) OR
        (staff_id IS NOT NULL AND staff_id = ?)
      )
      `,
      [council_id, teacher_id, staff_id],
    );

    if (exist.length > 0) {
      return sendResponse(
        res,
        409,
        false,
        "Thành viên này đã tồn tại trong hội đồng!",
      );
    }

    // Insert thành viên mới vào DB
    const [result] = await db.query(
      `
      INSERT INTO council_members (council_id, teacher_id, staff_id, position)
      VALUES (?, ?, ?, ?)
      `,
      [council_id, teacher_id, staff_id, position],
    );

    return sendResponse(res, 201, true, "Thêm thành viên thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("Lỗi Server:", error);
    return sendResponse(res, 500, false, "Lỗi thêm thành viên");
  }
});

// =====================================================
// REMOVE MEMBER FROM COUNCIL
// =====================================================
router.delete("/:id/members/:memberId", async (req, res) => {
  try {
    await db.query(`DELETE FROM council_members WHERE id = ?`, [
      req.params.memberId,
    ]);
    return sendResponse(res, 200, true, "Xóa thành viên thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi xóa thành viên");
  }
});

module.exports = router;
