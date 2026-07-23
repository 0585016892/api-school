const express = require("express");
const router = express.Router();

const db = require("../config/db");
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
        SELECT
            o.*,

            COUNT(DISTINCT om.id) total_members,

            COUNT(DISTINCT om.teacher_id) teacher_count,

            COUNT(DISTINCT om.staff_id) staff_count

        FROM organizations o

        LEFT JOIN organization_members om
            ON om.organization_id = o.id

        WHERE o.type='union'

        GROUP BY o.id

        ORDER BY o.id DESC
    `);

    return sendResponse(res, 200, true, "Danh sách công đoàn", rows);
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [org] = await db.query(
      `
      SELECT *
      FROM organizations
      WHERE id=?
      AND type='union'
    `,
      [id],
    );

    if (!org.length) {
      return sendResponse(res, 404, false, "Không tìm thấy công đoàn");
    }

    const [members] = await db.query(
      `
        SELECT

            om.id,

            om.teacher_id,

            om.staff_id,

            om.position,

            om.is_leader,

            om.status,

            om.joined_date,

            CASE
                WHEN om.teacher_id IS NOT NULL THEN 'teacher'
                ELSE 'staff'
            END member_type,

            COALESCE(t.full_name,s.full_name) full_name,

            t.teacher_code,


            COALESCE(t.phone,s.phone) phone

        FROM organization_members om

        LEFT JOIN teachers t
            ON t.id=om.teacher_id

        LEFT JOIN staffs s
            ON s.id=om.staff_id

        WHERE om.organization_id=?
    `,
      [id],
    );

    org[0].members = members;

    return sendResponse(res, 200, true, "Chi tiết công đoàn", org[0]);
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.post("/", async (req, res) => {
  try {
    const { name, description, status = "active" } = req.body;

    const [result] = await db.query(
      `
      INSERT INTO organizations
      (
          name,
          type,
          description,
          status
      )
      VALUES
      (
          ?,
          'union',
          ?,
          ?
      )
    `,
      [name, description, status],
    );

    return sendResponse(res, 201, true, "Thêm công đoàn thành công", {
      id: result.insertId,
    });
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { name, description, status } = req.body;

    await db.query(
      `
      UPDATE organizations

      SET
          name=?,
          description=?,
          status=?

      WHERE id=?
      AND type='union'
    `,
      [name, description, status, id],
    );

    return sendResponse(res, 200, true, "Cập nhật thành công");
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      DELETE
      FROM organizations
      WHERE id=?
      AND type='union'
    `,
      [id],
    );

    return sendResponse(res, 200, true, "Xóa thành công");
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.get("/available/members", async (req, res) => {
  try {
    const [teachers] = await db.query(`
        SELECT

            id,

            full_name,

            teacher_code,

            phone,

            'teacher' member_type

        FROM teachers

        WHERE id NOT IN (

            SELECT teacher_id

            FROM organization_members

            WHERE teacher_id IS NOT NULL
        )
    `);

    const [staffs] = await db.query(`
        SELECT

            id,

            full_name,


            phone,

            'staff' member_type

        FROM staffs

        WHERE id NOT IN (

            SELECT staff_id

            FROM organization_members

            WHERE staff_id IS NOT NULL
        )
    `);

    return sendResponse(res, 200, true, "Danh sách thành viên", [
      ...teachers,
      ...staffs,
    ]);
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.post("/:id/members", async (req, res) => {
  const { id } = req.params;

  const {
    member_id,

    member_type,

    position,

    is_leader = 0,
  } = req.body;

  try {
    let teacher_id = null;
    let staff_id = null;

    if (member_type === "teacher") {
      teacher_id = member_id;
    } else {
      staff_id = member_id;
    }

    await db.query(
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
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                CURDATE(),
                ?,
                'active'
            )
        `,
      [id, teacher_id, staff_id, position || "Ủy viên", is_leader],
    );

    return sendResponse(res, 201, true, "Thêm thành viên thành công");
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
router.delete("/:id/members/:memberId", async (req, res) => {
  const { memberId } = req.params;

  try {
    await db.query(
      `
            DELETE FROM organization_members
            WHERE id=?
        `,
      [memberId],
    );

    return sendResponse(res, 200, true, "Đã xóa thành viên");
  } catch (err) {
    console.log(err);

    return sendResponse(res, 500, false, "Lỗi server");
  }
});
module.exports = router;
