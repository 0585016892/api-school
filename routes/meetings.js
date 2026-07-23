const express = require("express");
const router = express.Router();
const db = require("../config/db");

const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({ success, message, data });
};

// =====================================================
// 1. GET ALL MEETINGS
// =====================================================
router.get("/", async (req, res) => {
  const { search, status } = req.query;

  try {
    let query = `
      SELECT 
        m.*,
        COUNT(mm.id) AS member_count,
        CASE WHEN mmi.id IS NOT NULL THEN 1 ELSE 0 END AS has_minutes
      FROM meetings m
      LEFT JOIN meeting_members mm ON mm.meeting_id = m.id
      LEFT JOIN meeting_minutes mmi ON mmi.meeting_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (m.title LIKE ? OR m.location LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    if (status && status !== "all") {
      query += ` AND m.status = ?`;
      params.push(status);
    }

    query += ` GROUP BY m.id ORDER BY m.meeting_date DESC`;

    const [rows] = await db.query(query, params);
    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách cuộc họp thành công",
      rows,
    );
  } catch (error) {
    console.error("Lỗi lấy danh sách cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 2. GET DETAIL MEETING (Kèm danh sách thành viên & Biên bản)
// =====================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Thông tin cuộc họp
    const [meetings] = await db.query(`SELECT * FROM meetings WHERE id = ?`, [
      id,
    ]);
    if (meetings.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy cuộc họp");
    }

    // Danh sách thành viên tham dự
    const [members] = await db.query(
      `
      SELECT 
        mm.*,
        CASE 
          WHEN mm.teacher_id IS NOT NULL THEN t.full_name
          WHEN mm.staff_id IS NOT NULL THEN s.full_name
        END AS full_name,
        CASE 
          WHEN mm.teacher_id IS NOT NULL THEN 'teacher'
          WHEN mm.staff_id IS NOT NULL THEN 'staff'
        END AS member_type
      FROM meeting_members mm
      LEFT JOIN teachers t ON mm.teacher_id = t.id
      LEFT JOIN staffs s ON mm.staff_id = s.id
      WHERE mm.meeting_id = ?
      `,
      [id],
    );

    // Biên bản cuộc họp
    const [minutes] = await db.query(
      `SELECT * FROM meeting_minutes WHERE meeting_id = ?`,
      [id],
    );

    return sendResponse(res, 200, true, "Chi tiết cuộc họp", {
      ...meetings[0],
      members,
      minutes: minutes[0] || null,
    });
  } catch (error) {
    console.error("Lỗi lấy chi tiết cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 3. GET AVAILABLE MEMBERS FOR INVITATION
// =====================================================
router.get("/members/available", async (req, res) => {
  try {
    const [teachers] = await db.query(
      `SELECT id, full_name, 'teacher' AS member_type FROM teachers`,
    );
    const [staffs] = await db.query(
      `SELECT id, full_name, 'staff' AS member_type FROM staffs`,
    );

    return sendResponse(res, 200, true, "Danh sách nhân sự", [
      ...teachers,
      ...staffs,
    ]);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 4. CREATE MEETING
// =====================================================
router.post("/", async (req, res) => {
  const {
    title,
    meeting_date,
    location,
    organizer_id,
    description,
    status = "scheduled",
  } = req.body;

  if (!title || !meeting_date) {
    return sendResponse(
      res,
      400,
      false,
      "Tiêu đề và thời gian họp là bắt buộc",
    );
  }

  try {
    const [result] = await db.query(
      `
      INSERT INTO meetings (title, meeting_date, location, organizer_id, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        meeting_date,
        location || null,
        organizer_id || null,
        description || null,
        status,
      ],
    );

    return sendResponse(res, 201, true, "Tạo cuộc họp thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("Lỗi tạo cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 5. UPDATE MEETING
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, meeting_date, location, organizer_id, description, status } =
    req.body;

  try {
    await db.query(
      `
      UPDATE meetings 
      SET title = ?, meeting_date = ?, location = ?, organizer_id = ?, description = ?, status = ?
      WHERE id = ?
      `,
      [
        title,
        meeting_date,
        location,
        organizer_id || null,
        description,
        status,
        id,
      ],
    );

    return sendResponse(res, 200, true, "Cập nhật cuộc họp thành công");
  } catch (error) {
    console.error("Lỗi cập nhật cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 6. DELETE MEETING
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM meetings WHERE id = ?`, [req.params.id]);
    return sendResponse(res, 200, true, "Xóa cuộc họp thành công");
  } catch (error) {
    console.error("Lỗi xóa cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 7. ADD MEMBER TO MEETING
// =====================================================
router.post("/:id/members", async (req, res) => {
  const meeting_id = req.params.id;
  const { member_id, member_type } = req.body;

  const teacher_id = member_type === "teacher" ? member_id : null;
  const staff_id = member_type === "staff" ? member_id : null;

  try {
    // Kiểm tra trùng
    const [exist] = await db.query(
      `SELECT id FROM meeting_members WHERE meeting_id = ? AND ((teacher_id IS NOT NULL AND teacher_id = ?) OR (staff_id IS NOT NULL AND staff_id = ?))`,
      [meeting_id, teacher_id, staff_id],
    );

    if (exist.length > 0) {
      return sendResponse(
        res,
        409,
        false,
        "Thành viên này đã được thêm vào cuộc họp",
      );
    }

    await db.query(
      `INSERT INTO meeting_members (meeting_id, teacher_id, staff_id, attendance_status) VALUES (?, ?, ?, 'invited')`,
      [meeting_id, teacher_id, staff_id],
    );

    return sendResponse(res, 201, true, "Thêm thành viên thành công");
  } catch (error) {
    console.error("Lỗi thêm thành viên cuộc họp:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 8. UPDATE ATTENDANCE STATUS (Điểm danh thành viên)
// =====================================================
router.put("/members/:memberRecordId/attendance", async (req, res) => {
  const { memberRecordId } = req.params;
  const { attendance_status } = req.body; // 'invited', 'present', 'absent'

  try {
    await db.query(
      `UPDATE meeting_members SET attendance_status = ? WHERE id = ?`,
      [attendance_status, memberRecordId],
    );
    return sendResponse(res, 200, true, "Cập nhật điểm danh thành công");
  } catch (error) {
    console.error("Lỗi điểm danh:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 9. REMOVE MEMBER FROM MEETING
// =====================================================
router.delete("/members/:memberRecordId", async (req, res) => {
  try {
    await db.query(`DELETE FROM meeting_members WHERE id = ?`, [
      req.params.memberRecordId,
    ]);
    return sendResponse(res, 200, true, "Gỡ thành viên thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

// =====================================================
// 10. SAVE / UPDATE MEETING MINUTES (Biên bản)
// =====================================================
router.post("/:id/minutes", async (req, res) => {
  const meeting_id = req.params.id;
  const { content, conclusion, file_url, created_by } = req.body;

  try {
    const [exist] = await db.query(
      `SELECT id FROM meeting_minutes WHERE meeting_id = ?`,
      [meeting_id],
    );

    if (exist.length > 0) {
      await db.query(
        `UPDATE meeting_minutes SET content = ?, conclusion = ?, file_url = ?, created_by = ? WHERE meeting_id = ?`,
        [content, conclusion, file_url || null, created_by || null, meeting_id],
      );
    } else {
      await db.query(
        `INSERT INTO meeting_minutes (meeting_id, content, conclusion, file_url, created_by) VALUES (?, ?, ?, ?, ?)`,
        [meeting_id, content, conclusion, file_url || null, created_by || null],
      );
    }

    return sendResponse(res, 200, true, "Lưu biên bản cuộc họp thành công");
  } catch (error) {
    console.error("Lỗi lưu biên bản:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ");
  }
});

module.exports = router;
