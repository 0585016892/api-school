const express = require("express");
const router = express.Router();
const db = require("../config/db");

// =====================================================
// HELPER RESPONSE
// =====================================================

const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};

// =====================================================
// GET ALL STAFF
// GET /api/staff
//
// Hỗ trợ:
// ?search=Nguyen
// ?status=active
// ?gender=male
// ?department=Ke toan
// ?page=1
// ?limit=10
// =====================================================

router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      status,
      gender,
      department,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.max(parseInt(limit) || 10, 1);
    const offset = (pageNumber - 1) * limitNumber;

    let whereConditions = [];
    let queryParams = [];

    // =================================================
    // SEARCH
    // =================================================

    if (search.trim()) {
      whereConditions.push(`
        (
          s.full_name LIKE ?
          OR s.phone LIKE ?
          OR s.email LIKE ?
          OR s.position LIKE ?
          OR s.department LIKE ?
        )
      `);

      const searchValue = `%${search.trim()}%`;

      queryParams.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
      );
    }

    // =================================================
    // FILTER STATUS
    // =================================================

    if (status) {
      whereConditions.push("s.status = ?");
      queryParams.push(status);
    }

    // =================================================
    // FILTER GENDER
    // =================================================

    if (gender) {
      whereConditions.push("s.gender = ?");
      queryParams.push(gender);
    }

    // =================================================
    // FILTER DEPARTMENT
    // =================================================

    if (department) {
      whereConditions.push("s.department LIKE ?");
      queryParams.push(`%${department}%`);
    }

    const whereSQL =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // =================================================
    // COUNT TOTAL
    // =================================================

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM staffs s
      ${whereSQL}
      `,
      queryParams,
    );

    const total = countRows[0]?.total || 0;

    // =================================================
    // GET STAFF
    // =================================================

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.full_name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.position,
        s.department,
        s.address,
        s.status,
        s.created_at,
        s.updated_at

      FROM staffs s

      ${whereSQL}

      ORDER BY s.id DESC

      LIMIT ? OFFSET ?
      `,
      [...queryParams, limitNumber, offset],
    );

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách nhân viên thành công",

      data: rows,

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET STAFF ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy danh sách nhân viên",
    );
  }
});

// =====================================================
// GET STAFF BY ID
// GET /api/staff/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        user_id,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        position,
        department,
        address,
        status,
        created_at,
        updated_at

      FROM staffs

      WHERE id = ?
      `,
      [id],
    );

    if (rows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy nhân viên");
    }

    return sendResponse(
      res,
      200,
      true,
      "Lấy thông tin nhân viên thành công",
      rows[0],
    );
  } catch (error) {
    console.error("GET STAFF DETAIL ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy thông tin nhân viên",
    );
  }
});

// =====================================================
// CREATE STAFF
// POST /api/staff
// =====================================================

router.post("/", async (req, res) => {
  try {
    const {
      user_id,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      position,
      department,
      address,
      status = "active",
    } = req.body;

    // =================================================
    // VALIDATE
    // =================================================

    if (!full_name || !full_name.trim()) {
      return sendResponse(res, 400, false, "Họ và tên nhân viên là bắt buộc");
    }

    // =================================================
    // CHECK USER_ID
    // =================================================

    if (user_id) {
      const [userRows] = await db.query(
        `
        SELECT id
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [user_id],
      );

      if (userRows.length === 0) {
        return sendResponse(
          res,
          400,
          false,
          "Tài khoản người dùng không tồn tại",
        );
      }

      // Kiểm tra user đã có staff chưa
      const [staffRows] = await db.query(
        `
        SELECT id
        FROM staffs
        WHERE user_id = ?
        LIMIT 1
        `,
        [user_id],
      );

      if (staffRows.length > 0) {
        return sendResponse(
          res,
          400,
          false,
          "Tài khoản này đã được liên kết với một nhân viên",
        );
      }
    }

    // =================================================
    // INSERT
    // =================================================

    const [result] = await db.query(
      `
      INSERT INTO staffs (
        user_id,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        position,
        department,
        address,
        status
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        user_id || null,
        full_name.trim(),
        gender || null,
        date_of_birth || null,
        phone || null,
        email || null,
        position || null,
        department || null,
        address || null,
        status || "active",
      ],
    );

    // =================================================
    // GET CREATED STAFF
    // =================================================

    const [newStaff] = await db.query(
      `
      SELECT
        id,
        user_id,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        position,
        department,
        address,
        status,
        created_at,
        updated_at

      FROM staffs

      WHERE id = ?
      `,
      [result.insertId],
    );

    return sendResponse(
      res,
      201,
      true,
      "Thêm nhân viên thành công",
      newStaff[0],
    );
  } catch (error) {
    console.error("CREATE STAFF ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi thêm nhân viên");
  }
});

// =====================================================
// UPDATE STAFF
// PUT /api/staff/:id
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      user_id,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      position,
      department,
      address,
      status,
    } = req.body;

    // =================================================
    // CHECK STAFF
    // =================================================

    const [staffRows] = await db.query(
      `
      SELECT id
      FROM staffs
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (staffRows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy nhân viên");
    }

    // =================================================
    // VALIDATE
    // =================================================

    if (!full_name || !full_name.trim()) {
      return sendResponse(res, 400, false, "Họ và tên nhân viên là bắt buộc");
    }

    // =================================================
    // CHECK USER
    // =================================================

    if (user_id) {
      const [userRows] = await db.query(
        `
        SELECT id
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [user_id],
      );

      if (userRows.length === 0) {
        return sendResponse(
          res,
          400,
          false,
          "Tài khoản người dùng không tồn tại",
        );
      }

      // Không cho 2 nhân viên dùng chung user_id
      const [duplicateRows] = await db.query(
        `
        SELECT id
        FROM staffs
        WHERE user_id = ?
        AND id != ?
        LIMIT 1
        `,
        [user_id, id],
      );

      if (duplicateRows.length > 0) {
        return sendResponse(
          res,
          400,
          false,
          "Tài khoản này đã được liên kết với nhân viên khác",
        );
      }
    }

    // =================================================
    // UPDATE
    // =================================================

    await db.query(
      `
      UPDATE staffs

      SET
        user_id = ?,
        full_name = ?,
        gender = ?,
        date_of_birth = ?,
        phone = ?,
        email = ?,
        position = ?,
        department = ?,
        address = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [
        user_id || null,
        full_name.trim(),
        gender || null,
        date_of_birth || null,
        phone || null,
        email || null,
        position || null,
        department || null,
        address || null,
        status || "active",
        id,
      ],
    );

    // =================================================
    // GET UPDATED STAFF
    // =================================================

    const [updatedRows] = await db.query(
      `
      SELECT
        id,
        user_id,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        position,
        department,
        address,
        status,
        created_at,
        updated_at

      FROM staffs

      WHERE id = ?
      `,
      [id],
    );

    return sendResponse(
      res,
      200,
      true,
      "Cập nhật nhân viên thành công",
      updatedRows[0],
    );
  } catch (error) {
    console.error("UPDATE STAFF ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi cập nhật nhân viên");
  }
});

// =====================================================
// UPDATE STAFF STATUS
// PATCH /api/staff/:id/status
// =====================================================

router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return sendResponse(res, 400, false, "Trạng thái không hợp lệ");
    }

    const [result] = await db.query(
      `
      UPDATE staffs

      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [status, id],
    );

    if (result.affectedRows === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy nhân viên");
    }

    return sendResponse(
      res,
      200,
      true,
      "Cập nhật trạng thái nhân viên thành công",
    );
  } catch (error) {
    console.error("UPDATE STAFF STATUS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi cập nhật trạng thái nhân viên",
    );
  }
});

// =====================================================
// DELETE STAFF
// DELETE /api/staff/:id
// =====================================================

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // =================================================
    // CHECK STAFF
    // =================================================

    const [staffRows] = await db.query(
      `
      SELECT id, full_name
      FROM staffs
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (staffRows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy nhân viên");
    }

    // =================================================
    // DELETE
    // =================================================

    await db.query(
      `
      DELETE FROM staffs
      WHERE id = ?
      `,
      [id],
    );

    return sendResponse(
      res,
      200,
      true,
      `Đã xóa nhân viên "${staffRows[0].full_name}" thành công`,
    );
  } catch (error) {
    console.error("DELETE STAFF ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi xóa nhân viên");
  }
});

// =====================================================
// GET STAFF STATISTICS
// GET /api/staff/statistics
// =====================================================

router.get("/statistics/summary", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1
            ELSE 0
          END
        ) AS active,

        SUM(
          CASE
            WHEN status = 'inactive'
            THEN 1
            ELSE 0
          END
        ) AS inactive,

        SUM(
          CASE
            WHEN gender = 'male'
            THEN 1
            ELSE 0
          END
        ) AS male,

        SUM(
          CASE
            WHEN gender = 'female'
            THEN 1
            ELSE 0
          END
        ) AS female,

        SUM(
          CASE
            WHEN gender = 'other'
            THEN 1
            ELSE 0
          END
        ) AS other

      FROM staffs
    `);

    return sendResponse(
      res,
      200,
      true,
      "Lấy thống kê nhân viên thành công",
      rows[0],
    );
  } catch (error) {
    console.error("STAFF STATISTICS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy thống kê nhân viên",
    );
  }
});

module.exports = router;
