const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Kiểm tra đường dẫn config DB của bạn

// Helper response
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({ success, message, data });
};

// =====================================================
// 1. GET ALL DOCUMENTS (Có lọc theo loại, trạng thái & tìm kiếm)
// =====================================================
router.get("/", async (req, res) => {
  const { search, document_type, status } = req.query;

  try {
    let query = `SELECT * FROM documents WHERE 1=1`;
    const params = [];

    if (search) {
      query += ` AND (title LIKE ? OR document_number LIKE ? OR issued_by LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    if (document_type && document_type !== "all") {
      query += ` AND document_type = ?`;
      params.push(document_type);
    }

    if (status && status !== "all") {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY issue_date DESC, created_at DESC`;

    const [rows] = await db.query(query, params);
    return sendResponse(
      res,
      200,
      true,
      "Lấy danh sách văn bản thành công",
      rows,
    );
  } catch (error) {
    console.error("Lỗi lấy danh sách văn bản:", error);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi máy chủ khi lấy danh sách văn bản",
    );
  }
});

// =====================================================
// 2. GET DETAIL DOCUMENT
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM documents WHERE id = ?`, [
      req.params.id,
    ]);
    if (rows.length === 0)
      return sendResponse(res, 404, false, "Không tìm thấy văn bản");
    return sendResponse(res, 200, true, "Chi tiết văn bản", rows[0]);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi khi lấy chi tiết văn bản");
  }
});

// =====================================================
// 3. CREATE DOCUMENT
// =====================================================
router.post("/", async (req, res) => {
  const {
    title,
    document_number,
    document_type,
    issue_date,
    issued_by,
    content,
    file_url,
    status = "draft",
    created_by,
  } = req.body;

  if (!title) {
    return sendResponse(res, 400, false, "Tiêu đề văn bản là bắt buộc");
  }

  try {
    const [result] = await db.query(
      `
      INSERT INTO documents 
      (title, document_number, document_type, issue_date, issued_by, content, file_url, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        title,
        document_number || null,
        document_type || "Công văn",
        issue_date || null,
        issued_by || null,
        content || null,
        file_url || null,
        status,
        created_by || null,
      ],
    );

    return sendResponse(res, 201, true, "Tạo văn bản thành công", {
      id: result.insertId,
    });
  } catch (error) {
    console.error("Lỗi tạo văn bản:", error);
    return sendResponse(res, 500, false, "Lỗi máy chủ khi thêm văn bản");
  }
});

// =====================================================
// 4. UPDATE DOCUMENT
// =====================================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    title,
    document_number,
    document_type,
    issue_date,
    issued_by,
    content,
    file_url,
    status,
  } = req.body;

  try {
    const [result] = await db.query(
      `
      UPDATE documents
      SET title = ?, document_number = ?, document_type = ?, issue_date = ?, issued_by = ?, content = ?, file_url = ?, status = ?
      WHERE id = ?
      `,
      [
        title,
        document_number || null,
        document_type || null,
        issue_date || null,
        issued_by || null,
        content || null,
        file_url || null,
        status || "draft",
        id,
      ],
    );

    if (result.affectedRows === 0)
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy văn bản để cập nhật",
      );
    return sendResponse(res, 200, true, "Cập nhật văn bản thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi khi cập nhật văn bản");
  }
});

// =====================================================
// 5. DELETE DOCUMENT
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(`DELETE FROM documents WHERE id = ?`, [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return sendResponse(res, 404, false, "Không tìm thấy văn bản để xóa");
    return sendResponse(res, 200, true, "Xóa văn bản thành công");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, false, "Lỗi khi xóa văn bản");
  }
});

module.exports = router;
