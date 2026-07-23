const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Đảm bảo đường dẫn tới file config database đúng

// Helper gửi response đồng bộ
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({
    success,
    message,
    data,
  });
};

// =====================================================
// 1. GET ALL PARENTS (Có tìm kiếm & Đếm số con)
// =====================================================
router.get("/", async (req, res) => {
  const { search } = req.query;

  try {
    let query = `
      SELECT 
        p.*,
        COUNT(sp.student_id) AS children_count
      FROM parents p
      LEFT JOIN student_parents sp ON sp.parent_id = p.id
    `;
    const params = [];

    if (search) {
      query += ` WHERE p.full_name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

    const [rows] = await db.query(query, params);

    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách phụ huynh thành công",
      rows,
    );
  } catch (error) {
    console.error("Lỗi lấy danh sách phụ huynh:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi lấy danh sách phụ huynh",
    );
  }
});

// =====================================================
// 2. GET DETAIL PARENT (Kèm danh sách con/học sinh)
// =====================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Lấy thông tin phụ huynh
    const [parents] = await db.query(`SELECT * FROM parents WHERE id = ?`, [
      id,
    ]);

    if (parents.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy phụ huynh");
    }

    // 2. Lấy danh sách con/học sinh liên kết từ bảng student_parents & students
    const [children] = await db.query(
      `
      SELECT 
        s.id,
        s.full_name,
        s.student_code,
        s.gender,
        s.birthday,
        sp.relationship
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.id
      WHERE sp.parent_id = ?
      `,
      [id],
    );

    return sendResponse(res, 200, true, "Chi tiết phụ huynh", {
      ...parents[0],
      children,
    });
  } catch (error) {
    console.error("Lỗi lấy chi tiết phụ huynh:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi lấy chi tiết phụ huynh",
    );
  }
});

// =====================================================
// 3. CREATE PARENT (Thêm mới phụ huynh + gán con)
// =====================================================
router.post("/", async (req, res) => {
  const { full_name, phone, email, address, gender, occupation, students } =
    req.body;
  // `students` là mảng các object: [{ student_id: 1, relationship: 'Cha' }]

  if (!full_name || !phone) {
    return sendResponse(res, 400, false, "Họ tên và số điện thoại là bắt buộc");
  }

  const connection = await db.getConnection(); // Dùng transaction đảm bảo an toàn dữ liệu

  try {
    await connection.beginTransaction();

    // 1. Thêm bản ghi vào bảng parents
    const [result] = await connection.query(
      `
      INSERT INTO parents (full_name, phone, email, address, gender, occupation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        full_name,
        phone,
        email || null,
        address || null,
        gender || null,
        occupation || null,
      ],
    );

    const parentId = result.insertId;

    // 2. Nếu có danh sách học sinh đính kèm, thêm vào bảng student_parents
    if (Array.isArray(students) && students.length > 0) {
      const studentParentValues = students.map((st) => [
        st.student_id,
        parentId,
        st.relationship || "Phụ huynh",
      ]);

      await connection.query(
        `
        INSERT INTO student_parents (student_id, parent_id, relationship)
        VALUES ?
        `,
        [studentParentValues],
      );
    }

    await connection.commit();

    return sendResponse(res, 201, true, "Tạo thông tin phụ huynh thành công", {
      id: parentId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Lỗi tạo phụ huynh:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ khi tạo phụ huynh");
  } finally {
    connection.release();
  }
});

// =====================================================
// 4. UPDATE PARENT
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { full_name, phone, email, address, gender, occupation } = req.body;

  try {
    const [result] = await db.query(
      `
      UPDATE parents 
      SET full_name = ?, phone = ?, email = ?, address = ?, gender = ?, occupation = ?
      WHERE id = ?
      `,
      [
        full_name,
        phone,
        email || null,
        address || null,
        gender || null,
        occupation || null,
        id,
      ],
    );

    if (result.affectedRows === 0) {
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy phụ huynh để cập nhật",
      );
    }

    return sendResponse(
      res,
      200,
      true,
      "Cập nhật thông tin phụ huynh thành công",
    );
  } catch (error) {
    console.error("Lỗi cập nhật phụ huynh:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ khi cập nhật phụ huynh");
  }
});

// =====================================================
// 5. DELETE PARENT
// =====================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(`DELETE FROM parents WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy phụ huynh để xóa");
    }

    return sendResponse(res, 200, true, "Xóa phụ huynh thành công");
  } catch (error) {
    console.error("Lỗi xóa phụ huynh:", error);
    return sendResponse(res, 500, false, "Không thể xóa phụ huynh này");
  }
});

// =====================================================
// 6. LINK STUDENT TO PARENT (Thêm con cho phụ huynh)
// =====================================================
// =====================================================
// LINK STUDENT TO PARENT (Hỗ trợ nhập Mã HS hoặc ID)
// =====================================================
router.post("/:id/students", async (req, res) => {
  const parent_id = req.params.id;
  const { student_id: inputStudent, relationship = "Phụ huynh" } = req.body;

  if (!inputStudent) {
    return sendResponse(res, 400, false, "Vui lòng nhập Mã hoặc ID học sinh");
  }

  try {
    // 1. Tra cứu học sinh dựa theo ID hoặc Mã học sinh (student_code)
    const [students] = await db.query(
      `SELECT id FROM students WHERE id = ? OR student_code = ?`,
      [inputStudent, inputStudent],
    );

    if (students.length === 0) {
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy học sinh với mã/ID này!",
      );
    }

    const realStudentId = students[0].id; // Lấy ra ID dạng số nguyên (INT)

    // 2. Kiểm tra liên kết đã tồn tại chưa
    const [exist] = await db.query(
      `SELECT * FROM student_parents WHERE student_id = ? AND parent_id = ?`,
      [realStudentId, parent_id],
    );

    if (exist.length > 0) {
      return sendResponse(
        res,
        409,
        false,
        "Học sinh này đã được gán cho phụ huynh!",
      );
    }

    // 3. Insert dữ liệu chuẩn với student_id là số nguyên
    await db.query(
      `
      INSERT INTO student_parents (student_id, parent_id, relationship)
      VALUES (?, ?, ?)
      `,
      [realStudentId, parent_id, relationship],
    );

    return sendResponse(res, 201, true, "Thêm liên kết học sinh thành công!");
  } catch (error) {
    console.error("Lỗi gán học sinh:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi thêm con cho phụ huynh",
    );
  }
});

// =====================================================
// 7. UNLINK STUDENT FROM PARENT (Gỡ con khỏi phụ huynh)
// =====================================================
router.delete("/:id/students/:studentId", async (req, res) => {
  const { id: parent_id, studentId: student_id } = req.params;

  try {
    const [result] = await db.query(
      `DELETE FROM student_parents WHERE parent_id = ? AND student_id = ?`,
      [parent_id, student_id],
    );

    if (result.affectedRows === 0) {
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy liên kết giữa phụ huynh và học sinh này",
      );
    }

    return sendResponse(
      res,
      200,
      true,
      "Đã gỡ liên kết học sinh khỏi phụ huynh",
    );
  } catch (error) {
    console.error("Lỗi gỡ liên kết học sinh:", error);
    return sendResponse(res, 500, false, "Lỗi khi gỡ liên kết học sinh");
  }
});

module.exports = router;
