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
// GET ALL DEPARTMENTS
// GET /api/departments
// =====================================================

router.get("/", async (req, res) => {
  try {
    console.log("GET /api/departments");

    const [rows] = await db.query(`
      SELECT
        o.id,
        o.name,
        o.type,
        o.parent_id,
        o.description,
        o.status,
        o.created_at,
        o.updated_at,

        p.name AS parent_name,

        COUNT(DISTINCT om.id) AS member_count,

        COUNT(
          DISTINCT CASE
            WHEN om.teacher_id IS NOT NULL
            THEN om.teacher_id
          END
        ) AS teacher_count,

        COUNT(
          DISTINCT CASE
            WHEN om.staff_id IS NOT NULL
            THEN om.staff_id
          END
        ) AS staff_count

      FROM organizations o

      LEFT JOIN organizations p
        ON o.parent_id = p.id

      LEFT JOIN organization_members om
        ON o.id = om.organization_id

      WHERE o.type = 'department'

      GROUP BY
        o.id,
        o.name,
        o.type,
        o.parent_id,
        o.description,
        o.status,
        o.created_at,
        o.updated_at,
        p.name

      ORDER BY o.id DESC
    `);

    console.log("DEPARTMENTS:", rows);

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách tổ chuyên môn thành công",
      rows,
    );
  } catch (error) {
    console.error("GET DEPARTMENTS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Không thể lấy danh sách tổ chuyên môn",
      {
        error: error.message,
      },
    );
  }
});

// =====================================================
// GET DEPARTMENT DETAIL
// GET /api/departments/:id
// =====================================================

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    console.log("GET DEPARTMENT DETAIL:", id);

    // =================================================
    // DEPARTMENT
    // =================================================

    const [departmentRows] = await db.query(
      `
      SELECT
        o.id,
        o.name,
        o.type,
        o.parent_id,
        o.description,
        o.status,
        o.created_at,
        o.updated_at,

        p.name AS parent_name

      FROM organizations o

      LEFT JOIN organizations p
        ON o.parent_id = p.id

      WHERE o.id = ?
        AND o.type = 'department'

      LIMIT 1
      `,
      [id],
    );

    if (departmentRows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chuyên môn");
    }

    const department = departmentRows[0];

    // =================================================
    // MEMBERS
    // =================================================

    const [members] = await db.query(
      `
      SELECT
        om.id,
        om.organization_id,
        om.teacher_id,
        om.staff_id,

        t.teacher_code,
        t.full_name AS teacher_name,
        t.gender AS teacher_gender,
        t.phone AS teacher_phone,
        t.email AS teacher_email,

        s.full_name AS staff_name,
        s.gender AS staff_gender,
        s.phone AS staff_phone,
        s.email AS staff_email,
        s.position AS staff_position

      FROM organization_members om

      LEFT JOIN teachers t
        ON om.teacher_id = t.id

      LEFT JOIN staffs s
        ON om.staff_id = s.id

      WHERE om.organization_id = ?

      ORDER BY om.id DESC
      `,
      [id],
    );

    // =================================================
    // FORMAT MEMBERS
    // =================================================

    const formattedMembers = members.map((member) => {
      if (member.teacher_id) {
        return {
          id: member.id,
          organization_id: member.organization_id,

          member_type: "teacher",

          teacher_id: member.teacher_id,

          staff_id: null,

          full_name: member.teacher_name,

          code: member.teacher_code,

          gender: member.teacher_gender,

          phone: member.teacher_phone,

          email: member.teacher_email,

          position: "Giáo viên",

          role: member.role,

          joined_at: member.joined_at,
        };
      }

      return {
        id: member.id,
        organization_id: member.organization_id,

        member_type: "staff",

        teacher_id: null,

        staff_id: member.staff_id,

        full_name: member.staff_name,

        code: null,

        gender: member.staff_gender,

        phone: member.staff_phone,

        email: member.staff_email,

        position: member.staff_position,

        role: member.role,

        joined_at: member.joined_at,
      };
    });

    return sendResponse(
      res,
      200,
      true,
      "Lấy chi tiết tổ chuyên môn thành công",
      {
        ...department,

        members: formattedMembers,

        member_count: formattedMembers.length,
      },
    );
  } catch (error) {
    console.error("GET DEPARTMENT DETAIL ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Không thể lấy chi tiết tổ chuyên môn",
      {
        error: error.message,
      },
    );
  }
});

// =====================================================
// CREATE DEPARTMENT
// POST /api/departments
// =====================================================

router.post("/", async (req, res) => {
  const { name, parent_id, description, status = "active" } = req.body;

  try {
    console.log("CREATE DEPARTMENT:", req.body);

    // =================================================
    // VALIDATE
    // =================================================

    if (!name || !name.trim()) {
      return sendResponse(
        res,
        400,
        false,
        "Tên tổ chuyên môn không được để trống",
      );
    }

    // =================================================
    // CHECK DUPLICATE
    // =================================================

    const [existing] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE name = ?
        AND type = 'department'
      LIMIT 1
      `,
      [name.trim()],
    );

    if (existing.length > 0) {
      return sendResponse(res, 409, false, "Tổ chuyên môn đã tồn tại");
    }

    // =================================================
    // INSERT
    // =================================================

    const [result] = await db.query(
      `
      INSERT INTO organizations
      (
        name,
        type,
        parent_id,
        description,
        status
      )
      VALUES (?, 'department', ?, ?, ?)
      `,
      [name.trim(), parent_id || null, description?.trim() || null, status],
    );

    console.log("CREATE DEPARTMENT SUCCESS:", result.insertId);

    // =================================================
    // GET CREATED DATA
    // =================================================

    const [rows] = await db.query(
      `
      SELECT
        *
      FROM organizations
      WHERE id = ?
      `,
      [result.insertId],
    );

    return sendResponse(
      res,
      201,
      true,
      "Thêm tổ chuyên môn thành công",
      rows[0],
    );
  } catch (error) {
    console.error("CREATE DEPARTMENT ERROR:", error);

    return sendResponse(res, 500, false, "Không thể thêm tổ chuyên môn", {
      error: error.message,
    });
  }
});

// =====================================================
// UPDATE DEPARTMENT
// PUT /api/departments/:id
// =====================================================

router.put("/:id", async (req, res) => {
  const { id } = req.params;

  const { name, parent_id, description, status } = req.body;

  try {
    console.log("UPDATE DEPARTMENT:", id);

    // =================================================
    // CHECK EXIST
    // =================================================

    const [existing] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE id = ?
        AND type = 'department'
      LIMIT 1
      `,
      [id],
    );

    if (existing.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chuyên môn");
    }

    // =================================================
    // CHECK DUPLICATE NAME
    // =================================================

    if (name) {
      const [duplicate] = await db.query(
        `
        SELECT id
        FROM organizations
        WHERE name = ?
          AND type = 'department'
          AND id != ?
        LIMIT 1
        `,
        [name.trim(), id],
      );

      if (duplicate.length > 0) {
        return sendResponse(res, 409, false, "Tên tổ chuyên môn đã tồn tại");
      }
    }

    // =================================================
    // UPDATE
    // =================================================

    await db.query(
      `
      UPDATE organizations

      SET
        name = COALESCE(?, name),
        parent_id = ?,
        description = ?,
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
        AND type = 'department'
      `,
      [
        name?.trim() || null,
        parent_id || null,
        description?.trim() || null,
        status || null,
        id,
      ],
    );

    // =================================================
    // GET UPDATED
    // =================================================

    const [rows] = await db.query(
      `
      SELECT *
      FROM organizations
      WHERE id = ?
      `,
      [id],
    );

    return sendResponse(
      res,
      200,
      true,
      "Cập nhật tổ chuyên môn thành công",
      rows[0],
    );
  } catch (error) {
    console.error("UPDATE DEPARTMENT ERROR:", error);

    return sendResponse(res, 500, false, "Không thể cập nhật tổ chuyên môn", {
      error: error.message,
    });
  }
});

// =====================================================
// DELETE DEPARTMENT
// DELETE /api/departments/:id
// =====================================================

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const connection = await db.getConnection();

  try {
    console.log("DELETE DEPARTMENT:", id);

    await connection.beginTransaction();

    // =================================================
    // CHECK EXIST
    // =================================================

    const [department] = await connection.query(
      `
      SELECT id
      FROM organizations
      WHERE id = ?
        AND type = 'department'
      LIMIT 1
      `,
      [id],
    );

    if (department.length === 0) {
      await connection.rollback();

      return sendResponse(res, 404, false, "Không tìm thấy tổ chuyên môn");
    }

    // =================================================
    // DELETE MEMBERS
    // =================================================

    await connection.query(
      `
      DELETE FROM organization_members
      WHERE organization_id = ?
      `,
      [id],
    );

    // =================================================
    // DELETE ORGANIZATION
    // =================================================

    await connection.query(
      `
      DELETE FROM organizations
      WHERE id = ?
        AND type = 'department'
      `,
      [id],
    );

    await connection.commit();

    console.log("DELETE DEPARTMENT SUCCESS:", id);

    return sendResponse(res, 200, true, "Xóa tổ chuyên môn thành công");
  } catch (error) {
    await connection.rollback();

    console.error("DELETE DEPARTMENT ERROR:", error);

    return sendResponse(res, 500, false, "Không thể xóa tổ chuyên môn", {
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

// =====================================================
// GET DEPARTMENT MEMBERS
// GET /api/departments/:id/members
// =====================================================

router.get("/:id/members", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query(
      `
      SELECT
        om.id,
        om.organization_id,
        om.teacher_id,
        om.staff_id,
        om.role,
        om.joined_at,

        t.teacher_code,
        t.full_name AS teacher_name,
        t.gender AS teacher_gender,
        t.phone AS teacher_phone,
        t.email AS teacher_email,

        s.full_name AS staff_name,
        s.gender AS staff_gender,
        s.phone AS staff_phone,
        s.email AS staff_email,
        s.position AS staff_position

      FROM organization_members om

      LEFT JOIN teachers t
        ON om.teacher_id = t.id

      LEFT JOIN staffs s
        ON om.staff_id = s.id

      WHERE om.organization_id = ?

      ORDER BY om.id DESC
      `,
      [id],
    );

    const data = rows.map((item) => ({
      id: item.id,

      organization_id: item.organization_id,

      teacher_id: item.teacher_id,

      staff_id: item.staff_id,

      member_type: item.teacher_id ? "teacher" : "staff",

      full_name: item.teacher_name || item.staff_name || "Không xác định",

      code: item.teacher_code || null,

      gender: item.teacher_gender || item.staff_gender || null,

      phone: item.teacher_phone || item.staff_phone || null,

      email: item.teacher_email || item.staff_email || null,

      position: item.teacher_id ? "Giáo viên" : item.staff_position,

      role: item.role,

      joined_at: item.joined_at,
    }));

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách thành viên tổ thành công",
      data,
    );
  } catch (error) {
    console.error("GET DEPARTMENT MEMBERS ERROR:", error);

    return sendResponse(res, 500, false, "Không thể lấy danh sách thành viên", {
      error: error.message,
    });
  }
});

// =====================================================
// ADD MEMBER TO DEPARTMENT
// POST /api/departments/:id/members
// =====================================================

router.post("/:id/members", async (req, res) => {
  const { id } = req.params;

  console.log("CALL POST MEMBERS");

  let {
    teacher_id,
    staff_id,
    member_id,
    member_type,
    role = "member",
  } = req.body;

  // =================================================
  // CHUYỂN member_id -> teacher_id / staff_id
  // =================================================

  if (member_id && member_type === "teacher") {
    teacher_id = member_id;
    staff_id = null;
  }

  if (member_id && member_type === "staff") {
    staff_id = member_id;
    teacher_id = null;
  }

  console.log("ADD DEPARTMENT MEMBER:", {
    department_id: id,
    member_id,
    member_type,
    teacher_id,
    staff_id,
    role,
  });

  try {
    // =================================================
    // VALIDATE
    // =================================================

    if (!teacher_id && !staff_id) {
      return sendResponse(
        res,
        400,
        false,
        "Vui lòng chọn giáo viên hoặc nhân viên",
      );
    }

    if (teacher_id && staff_id) {
      return sendResponse(
        res,
        400,
        false,
        "Chỉ được chọn giáo viên hoặc nhân viên",
      );
    }

    // =================================================
    // CHECK DEPARTMENT
    // =================================================

    const [department] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE id = ?
      AND type = 'department'
      LIMIT 1
      `,
      [id],
    );

    if (department.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chuyên môn");
    }

    // =================================================
    // CHECK TEACHER
    // =================================================

    if (teacher_id) {
      const [teacher] = await db.query(
        `
        SELECT id
        FROM teachers
        WHERE id = ?
        LIMIT 1
        `,
        [teacher_id],
      );

      if (teacher.length === 0) {
        return sendResponse(res, 404, false, "Không tìm thấy giáo viên");
      }
    }

    // =================================================
    // CHECK STAFF
    // =================================================

    if (staff_id) {
      const [staff] = await db.query(
        `
        SELECT id
        FROM staffs
        WHERE id = ?
        LIMIT 1
        `,
        [staff_id],
      );

      if (staff.length === 0) {
        return sendResponse(res, 404, false, "Không tìm thấy nhân viên");
      }
    }

    // =================================================
    // CHECK DUPLICATE
    // =================================================

    let duplicateQuery;
    let duplicateParams;

    if (teacher_id) {
      duplicateQuery = `
        SELECT id
        FROM organization_members
        WHERE organization_id = ?
        AND teacher_id = ?
        LIMIT 1
      `;

      duplicateParams = [id, teacher_id];
    } else {
      duplicateQuery = `
        SELECT id
        FROM organization_members
        WHERE organization_id = ?
        AND staff_id = ?
        LIMIT 1
      `;

      duplicateParams = [id, staff_id];
    }

    const [duplicate] = await db.query(duplicateQuery, duplicateParams);

    if (duplicate.length > 0) {
      return sendResponse(res, 409, false, "Thành viên đã có trong tổ");
    }

    // =================================================
    // INSERT
    // =================================================

    const [result] = await db.query(
      `
INSERT INTO organization_members
(
    organization_id,
    teacher_id,
    staff_id,
    position,
    joined_date,
    is_leader,
    status
)
VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?)
`,
      [id, teacher_id || null, staff_id || null, "Thành viên", 0, "active"],
    );
    // =================================================
    // LẤY THÔNG TIN THÀNH VIÊN VỪA THÊM
    // =================================================

    const [member] = await db.query(
      `
      SELECT
          om.*,
          t.full_name AS teacher_name,
          s.full_name AS staff_name
      FROM organization_members om
      LEFT JOIN teachers t
          ON om.teacher_id = t.id
      LEFT JOIN staffs s
          ON om.staff_id = s.id
      WHERE om.id = ?
      `,
      [result.insertId],
    );

    return sendResponse(
      res,
      201,
      true,
      "Thêm thành viên vào tổ thành công",
      member[0],
    );
  } catch (error) {
    console.error("ADD DEPARTMENT MEMBER ERROR:", error);

    return sendResponse(res, 500, false, "Không thể thêm thành viên", {
      error: error.message,
    });
  }
});

// =====================================================
// REMOVE MEMBER
// DELETE /api/departments/:id/members/:memberId
// =====================================================

router.delete("/:id/members/:memberId", async (req, res) => {
  const { id, memberId } = req.params;

  try {
    const [result] = await db.query(
      `
        DELETE FROM organization_members

        WHERE id = ?

          AND organization_id = ?
        `,
      [memberId, id],
    );

    if (result.affectedRows === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy thành viên");
    }

    return sendResponse(res, 200, true, "Xóa thành viên khỏi tổ thành công");
  } catch (error) {
    console.error("REMOVE DEPARTMENT MEMBER ERROR:", error);

    return sendResponse(res, 500, false, "Không thể xóa thành viên", {
      error: error.message,
    });
  }
});

// =====================================================
// GET DEPARTMENT STATISTICS
// GET /api/departments/statistics
// =====================================================

router.get("/statistics", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(DISTINCT o.id) AS total_departments,

        COUNT(
          DISTINCT CASE
            WHEN o.status = 'active'
            THEN o.id
          END
        ) AS active_departments,

        COUNT(
          DISTINCT CASE
            WHEN o.status = 'inactive'
            THEN o.id
          END
        ) AS inactive_departments,

        COUNT(
          DISTINCT CASE
            WHEN om.teacher_id IS NOT NULL
            THEN om.teacher_id
          END
        ) AS total_teachers,

        COUNT(
          DISTINCT CASE
            WHEN om.staff_id IS NOT NULL
            THEN om.staff_id
          END
        ) AS total_staffs,

        COUNT(
          DISTINCT om.id
        ) AS total_members

      FROM organizations o

      LEFT JOIN organization_members om
        ON o.id = om.organization_id

      WHERE o.type = 'department'
    `);

    const data = rows[0] || {};

    return sendResponse(
      res,
      200,
      true,
      "Lấy thống kê tổ chuyên môn thành công",
      {
        total_departments: Number(data.total_departments || 0),

        active_departments: Number(data.active_departments || 0),

        inactive_departments: Number(data.inactive_departments || 0),

        total_teachers: Number(data.total_teachers || 0),

        total_staffs: Number(data.total_staffs || 0),

        total_members: Number(data.total_members || 0),
      },
    );
  } catch (error) {
    console.error("GET DEPARTMENT STATISTICS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Không thể lấy thống kê tổ chuyên môn",
      {
        error: error.message,
      },
    );
  }
});
// =====================================================
// GET AVAILABLE MEMBERS
// GET /api/departments/members/available
// =====================================================

router.get("/members/available", async (req, res) => {
  try {
    const [teachers] = await db.query(`
      SELECT
        t.id,
        t.full_name,
        t.teacher_code,
        t.gender,
        t.phone,
        t.email,
        'teacher' AS member_type
      FROM teachers t
      WHERE NOT EXISTS (
        SELECT 1
        FROM organization_members om
        INNER JOIN organizations o
          ON om.organization_id = o.id
        WHERE om.teacher_id = t.id
          AND o.type = 'department'
      )
      ORDER BY t.full_name ASC
    `);

    const [staffs] = await db.query(`
      SELECT
        s.id,
        s.full_name,
        NULL AS teacher_code,
        s.gender,
        s.phone,
        s.email,
        'staff' AS member_type
      FROM staffs s
      WHERE NOT EXISTS (
        SELECT 1
        FROM organization_members om
        INNER JOIN organizations o
          ON om.organization_id = o.id
        WHERE om.staff_id = s.id
          AND o.type = 'department'
      )
      ORDER BY s.full_name ASC
    `);

    const data = [...teachers, ...staffs];

    res.json({
      success: true,
      message: "Lấy danh sách thành viên có thể thêm thành công",
      data,
    });
  } catch (error) {
    console.error("GET AVAILABLE DEPARTMENT MEMBERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách thành viên có thể thêm",
      error: error.message,
    });
  }
});
module.exports = router;
