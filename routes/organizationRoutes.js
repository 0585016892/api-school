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
// 1. GET STATISTICS
// GET /api/organizations/statistics
// =====================================================

router.get("/statistics", async (req, res) => {
  try {
    const [organizationCount] = await db.query(`
      SELECT COUNT(*) AS total
      FROM organizations
      WHERE status = 'active'
    `);

    const [memberCount] = await db.query(`
      SELECT COUNT(*) AS total
      FROM organization_members
      WHERE status = 'active'
    `);

    const [teacherCount] = await db.query(`
      SELECT COUNT(*) AS total
      FROM organization_members
      WHERE teacher_id IS NOT NULL
      AND status = 'active'
    `);

    const [staffCount] = await db.query(`
      SELECT COUNT(*) AS total
      FROM organization_members
      WHERE staff_id IS NOT NULL
      AND status = 'active'
    `);

    return sendResponse(res, 200, true, "Lấy thống kê tổ chức thành công", {
      totalOrganizations: organizationCount[0].total,
      totalMembers: memberCount[0].total,
      totalTeachers: teacherCount[0].total,
      totalStaffs: staffCount[0].total,
    });
  } catch (error) {
    console.error("GET ORGANIZATION STATISTICS ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi lấy thống kê tổ chức");
  }
});

// =====================================================
// 2. GET ORGANIZATION TREE
// GET /api/organizations/tree
// =====================================================

router.get("/tree", async (req, res) => {
  try {
    const [organizations] = await db.query(`
      SELECT
        o.*,

        lt.full_name AS leader_teacher_name,

        ls.full_name AS leader_staff_name

      FROM organizations o

      LEFT JOIN teachers lt
        ON o.leader_teacher_id = lt.id

      LEFT JOIN staffs ls
        ON o.leader_staff_id = ls.id

      WHERE o.status = 'active'

      ORDER BY
        o.parent_id IS NULL DESC,
        o.name ASC
    `);

    // Tạo cây tổ chức
    const buildTree = (parentId = null) => {
      return organizations
        .filter((item) => {
          if (parentId === null) {
            return item.parent_id === null;
          }

          return Number(item.parent_id) === Number(parentId);
        })
        .map((item) => ({
          ...item,
          children: buildTree(item.id),
        }));
    };

    const tree = buildTree();

    return sendResponse(res, 200, true, "Lấy sơ đồ tổ chức thành công", tree);
  } catch (error) {
    console.error("GET ORGANIZATION TREE ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi lấy sơ đồ tổ chức");
  }
});

// =====================================================
// 3. GET ALL ORGANIZATIONS
// GET /api/organizations
// =====================================================

router.get("/", async (req, res) => {
  try {
    const { type, status, search } = req.query;

    let sql = `
      SELECT
        o.*,

        lt.full_name AS leader_teacher_name,

        ls.full_name AS leader_staff_name,

        p.name AS parent_name

      FROM organizations o

      LEFT JOIN teachers lt
        ON o.leader_teacher_id = lt.id

      LEFT JOIN staffs ls
        ON o.leader_staff_id = ls.id

      LEFT JOIN organizations p
        ON o.parent_id = p.id

      WHERE 1 = 1
    `;

    const params = [];

    // Lọc loại tổ chức
    if (type) {
      sql += ` AND o.type = ?`;
      params.push(type);
    }

    // Lọc trạng thái
    if (status) {
      sql += ` AND o.status = ?`;
      params.push(status);
    }

    // Tìm kiếm
    if (search) {
      sql += `
        AND (
          o.name LIKE ?
          OR o.description LIKE ?
      `;

      params.push(`%${search}%`, `%${search}%`);
    }

    sql += `
      ORDER BY
        o.parent_id IS NULL DESC,
        o.name ASC
    `;

    const [rows] = await db.query(sql, params);

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách tổ chức thành công",
      rows,
    );
  } catch (error) {
    console.error("GET ORGANIZATIONS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy danh sách tổ chức",
    );
  }
});

// =====================================================
// 4. GET ORGANIZATION BY ID
// GET /api/organizations/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        o.*,

        lt.full_name AS leader_teacher_name,
        lt.phone AS leader_teacher_phone,
        lt.email AS leader_teacher_email,

        ls.full_name AS leader_staff_name,
        ls.phone AS leader_staff_phone,
        ls.email AS leader_staff_email,

        p.name AS parent_name

      FROM organizations o

      LEFT JOIN teachers lt
        ON o.leader_teacher_id = lt.id

      LEFT JOIN staffs ls
        ON o.leader_staff_id = ls.id

      LEFT JOIN organizations p
        ON o.parent_id = p.id

      WHERE o.id = ?
      `,
      [id],
    );

    if (rows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chức");
    }

    return sendResponse(
      res,
      200,
      true,
      "Lấy thông tin tổ chức thành công",
      rows[0],
    );
  } catch (error) {
    console.error("GET ORGANIZATION BY ID ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy thông tin tổ chức",
    );
  }
});

// =====================================================
// 5. GET MEMBERS
// GET /api/organizations/:id/members
// =====================================================

router.get("/:id/members", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        om.id,
        om.organization_id,
        om.teacher_id,
        om.staff_id,
        om.position,
        om.joined_date,
        om.is_leader,
        om.status,

        t.full_name AS teacher_name,
        t.phone AS teacher_phone,
        t.email AS teacher_email,

        s.full_name AS staff_name,
        s.phone AS staff_phone,
        s.email AS staff_email

      FROM organization_members om

      LEFT JOIN teachers t
        ON om.teacher_id = t.id

      LEFT JOIN staffs s
        ON om.staff_id = s.id

      WHERE om.organization_id = ?

      ORDER BY
        om.is_leader DESC,
        om.id ASC
      `,
      [id],
    );

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách thành viên thành công",
      rows,
    );
  } catch (error) {
    console.error("GET ORGANIZATION MEMBERS ERROR:", error);

    return sendResponse(
      res,
      500,
      false,
      "Lỗi server khi lấy danh sách thành viên",
    );
  }
});

// =====================================================
// 6. CREATE ORGANIZATION
// POST /api/organizations
// =====================================================

router.post("/", async (req, res) => {
  try {
    const {
      parent_id,
      name,
      type,
      description,
      leader_teacher_id,
      leader_staff_id,
      status = "active",
    } = req.body;

    // Validate
    if (!name || !type) {
      return sendResponse(
        res,
        400,
        false,
        "Tên tổ chức và loại tổ chức là bắt buộc",
      );
    }

    // Kiểm tra tổ chức cha
    if (parent_id) {
      const [parent] = await db.query(
        `
        SELECT id
        FROM organizations
        WHERE id = ?
        `,
        [parent_id],
      );

      if (parent.length === 0) {
        return sendResponse(res, 400, false, "Tổ chức cha không tồn tại");
      }
    }

    const [result] = await db.query(
      `
      INSERT INTO organizations
      (
        parent_id,
        name,
        type,
        description,
        leader_teacher_id,
        leader_staff_id,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        parent_id || null,
        name,
        type,
        description || null,
        leader_teacher_id || null,
        leader_staff_id || null,
        status,
      ],
    );

    const [newOrganization] = await db.query(
      `
      SELECT *
      FROM organizations
      WHERE id = ?
      `,
      [result.insertId],
    );

    return sendResponse(
      res,
      201,
      true,
      "Tạo tổ chức thành công",
      newOrganization[0],
    );
  } catch (error) {
    console.error("CREATE ORGANIZATION ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi tạo tổ chức");
  }
});

// =====================================================
// 7. UPDATE ORGANIZATION
// PUT /api/organizations/:id
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      parent_id,
      name,
      type,
      description,
      leader_teacher_id,
      leader_staff_id,
      status,
    } = req.body;

    // Kiểm tra tổ chức
    const [existing] = await db.query(
      `
      SELECT *
      FROM organizations
      WHERE id = ?
      `,
      [id],
    );

    if (existing.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chức");
    }

    // Không cho tổ chức làm cha của chính nó
    if (parent_id && Number(parent_id) === Number(id)) {
      return sendResponse(
        res,
        400,
        false,
        "Tổ chức không thể là tổ chức cha của chính nó",
      );
    }

    await db.query(
      `
      UPDATE organizations
      SET
        parent_id = ?,
        name = ?,
        type = ?,
        description = ?,
        leader_teacher_id = ?,
        leader_staff_id = ?,
        status = ?
      WHERE id = ?
      `,
      [
        parent_id || null,
        name,
        type,
        description || null,
        leader_teacher_id || null,
        leader_staff_id || null,
        status || "active",
        id,
      ],
    );

    const [updated] = await db.query(
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
      "Cập nhật tổ chức thành công",
      updated[0],
    );
  } catch (error) {
    console.error("UPDATE ORGANIZATION ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi cập nhật tổ chức");
  }
});

// =====================================================
// 8. DELETE ORGANIZATION
// DELETE /api/organizations/:id
// =====================================================

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra tổ chức
    const [existing] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE id = ?
      `,
      [id],
    );

    if (existing.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chức");
    }

    // Kiểm tra tổ chức con
    const [children] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE parent_id = ?
      `,
      [id],
    );

    if (children.length > 0) {
      return sendResponse(
        res,
        400,
        false,
        "Không thể xóa tổ chức đang có tổ chức con",
      );
    }

    // Xóa thành viên trước
    await db.query(
      `
      DELETE FROM organization_members
      WHERE organization_id = ?
      `,
      [id],
    );

    // Xóa tổ chức
    await db.query(
      `
      DELETE FROM organizations
      WHERE id = ?
      `,
      [id],
    );

    return sendResponse(res, 200, true, "Xóa tổ chức thành công");
  } catch (error) {
    console.error("DELETE ORGANIZATION ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi xóa tổ chức");
  }
});

// =====================================================
// 9. ADD MEMBER
// POST /api/organizations/:id/members
// =====================================================

router.post("/:id/members", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      teacher_id,
      staff_id,
      position,
      joined_date,
      is_leader = false,
      status = "active",
    } = req.body;

    // Phải có teacher hoặc staff
    if (!teacher_id && !staff_id) {
      return sendResponse(
        res,
        400,
        false,
        "Phải chọn giáo viên hoặc nhân viên",
      );
    }

    // Không được chọn cả hai
    if (teacher_id && staff_id) {
      return sendResponse(
        res,
        400,
        false,
        "Chỉ được chọn giáo viên hoặc nhân viên",
      );
    }

    // Kiểm tra tổ chức
    const [organization] = await db.query(
      `
      SELECT id
      FROM organizations
      WHERE id = ?
      `,
      [id],
    );

    if (organization.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy tổ chức");
    }

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
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        teacher_id || null,
        staff_id || null,
        position || null,
        joined_date || null,
        is_leader,
        status,
      ],
    );

    return sendResponse(res, 201, true, "Thêm thành viên thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("ADD ORGANIZATION MEMBER ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi thêm thành viên");
  }
});

// =====================================================
// 10. DELETE MEMBER
// DELETE /api/organizations/:id/members/:memberId
// =====================================================

router.delete("/:id/members/:memberId", async (req, res) => {
  try {
    const { id, memberId } = req.params;

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

    return sendResponse(res, 200, true, "Xóa thành viên thành công");
  } catch (error) {
    console.error("DELETE ORGANIZATION MEMBER ERROR:", error);

    return sendResponse(res, 500, false, "Lỗi server khi xóa thành viên");
  }
});

module.exports = router;
