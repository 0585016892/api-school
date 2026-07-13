const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Helper phản hồi dữ liệu chuẩn hóa về Frontend
const sendResponse = (
  res,
  statusCode,
  success,
  message,
  data = null,
  extra = {},
) => {
  return res.status(statusCode).json({ success, message, data, ...extra });
};

// Hệ thống in log lỗi chi tiết ra Terminal phục vụ Debug chuyên nghiệp
const logErrorDetail = (apiName, err) => {
  console.log(
    `\n❌ [TUITION API ERROR] ==================== ${apiName} ====================`,
  );
  console.log(`🔹 Thời gian: ${new Date().toLocaleString()}`);
  console.log(`🔹 Thông báo lỗi: ${err.message}`);
  if (err.sql) {
    console.log(`🔹 Câu lệnh SQL chạy lỗi: ${err.sql}`);
    console.log(`🔹 Mã lỗi SQL State: ${err.code}`);
  }
  console.error("🔹 Vết lỗi hệ thống (Stack Trace):\n", err.stack);
  console.log(
    `=========================================================================\n`,
  );
};

// =========================================================================
// 1. GET: /api/tuition (Lấy danh sách học phí kèm Phân trang + Tìm kiếm)
// =========================================================================
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    // JOIN lấy thêm thông tin tên lớp từ bảng classes
    const [rows] = await db.query(
      `SELECT tf.*, s.student_code, s.full_name as student_name, c.class_name
       FROM tuition_fees tf
       JOIN students s ON tf.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.full_name LIKE ? OR s.student_code LIKE ?
       ORDER BY tf.id DESC LIMIT ? OFFSET ?`,
      [`%${search}%`, `%${search}%`, limit, offset],
    );

    const [[totalCount]] = await db.query(
      `SELECT COUNT(*) as total FROM tuition_fees tf
       JOIN students s ON tf.student_id = s.id
       WHERE s.full_name LIKE ? OR s.student_code LIKE ?`,
      [`%${search}%`, `%${search}%`],
    );

    return sendResponse(
      res,
      200,
      true,
      "Tải danh sách học phí thành công",
      rows,
      {
        total: totalCount?.total || 0,
        page,
        limit,
      },
    );
  } catch (err) {
    logErrorDetail("GET / (Danh sách học phí)", err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi tải danh sách học phí",
    );
  }
});

// =========================================================================
// 2. GET: /api/tuition/dashboard/summary (Số liệu tổng quan trang thống kê)
// =========================================================================
router.get("/dashboard/summary", async (req, res) => {
  try {
    const [[totalTuition]] = await db.query(
      "SELECT IFNULL(SUM(amount), 0) as total FROM tuition_fees",
    );

    const [[paid]] = await db.query(
      "SELECT IFNULL(SUM(amount_paid), 0) as total FROM payments",
    );

    const [[students]] = await db.query(
      "SELECT COUNT(DISTINCT student_id) as total FROM tuition_fees",
    );

    const dataSummary = {
      totalExpected: Number(totalTuition.total),
      totalPaid: Number(paid.total),
      totalDebt: Number(totalTuition.total) - Number(paid.total),
      totalStudents: Number(students.total),
    };

    return sendResponse(
      res,
      200,
      true,
      "Tải số liệu tổng quan thành công",
      dataSummary,
    );
  } catch (err) {
    logErrorDetail("GET /dashboard/summary", err);
    return sendResponse(res, 500, false, "Lỗi hệ thống khi tổng hợp số liệu");
  }
});

// =========================================================================
// 3. GET: /api/tuition/:id (Chi tiết 1 khoản học phí của học sinh)
// =========================================================================
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tf.*, s.student_code, s.full_name, c.class_name 
       FROM tuition_fees tf 
       JOIN students s ON tf.student_id = s.id 
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE tf.id = ?`,
      [req.params.id],
    );

    if (rows.length === 0) {
      return sendResponse(res, 404, false, "Không tìm thấy khoản học phí này");
    }

    return sendResponse(
      res,
      200,
      true,
      "Tải chi tiết học phí thành công",
      rows[0],
    );
  } catch (err) {
    logErrorDetail(`GET /${req.params.id}`, err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi tải chi tiết học phí",
    );
  }
});

// =========================================================================
// 4. POST: /api/tuition (Tạo khoản thu học phí mới)
// =========================================================================
router.post("/", async (req, res) => {
  try {
    const { student_id, amount, due_date, note } = req.body;

    if (!student_id || !amount) {
      return sendResponse(
        res,
        400,
        false,
        "Vui lòng nhập đầy đủ học sinh và số tiền!",
      );
    }

    await db.query(
      `INSERT INTO tuition_fees (student_id, amount, due_date, status, note)
       VALUES (?, ?, ?, 'unpaid', ?)`,
      [student_id, amount, due_date || null, note || null],
    );

    return sendResponse(res, 201, true, "Tạo thông báo học phí thành công");
  } catch (err) {
    logErrorDetail("POST /", err);
    return sendResponse(res, 500, false, "Lỗi hệ thống khi tạo học phí");
  }
});

// =========================================================================
// 5. POST: /api/tuition/payment (Thu tiền đóng học phí - Khóa Transaction)
// =========================================================================
router.post("/payment", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { tuition_id, amount_paid, payment_method } = req.body;
    if (!tuition_id || !amount_paid || amount_paid <= 0) {
      await connection.rollback();
      return sendResponse(res, 400, false, "Số tiền đóng không hợp lệ!");
    }

    const [[fee]] = await connection.query(
      "SELECT amount FROM tuition_fees WHERE id = ?",
      [tuition_id],
    );
    if (!fee) {
      await connection.rollback();
      return sendResponse(res, 404, false, "Khoản học phí không tồn tại!");
    }

    // Chuẩn hóa dữ liệu Enum bảo vệ database không bị crash lỗi loại dữ liệu
    let dbPaymentMethod = "cash";
    if (payment_method === "banking" || payment_method === "Chuyển khoản")
      dbPaymentMethod = "banking";
    if (payment_method === "momo" || payment_method === "Momo")
      dbPaymentMethod = "momo";

    // Thực hiện lưu lịch sử đóng tiền dựa trên đúng cấu trúc bảng payments mới
    await connection.query(
      `INSERT INTO payments (tuition_id, amount_paid, payment_method, payment_date)
       VALUES (?, ?, ?, NOW())`,
      [tuition_id, amount_paid, dbPaymentMethod],
    );

    // Tính toán lại tổng tiền học sinh này thực tế đã đóng cho đợt học phí này
    const [[paid]] = await connection.query(
      "SELECT IFNULL(SUM(amount_paid), 0) as total FROM payments WHERE tuition_id = ?",
      [tuition_id],
    );

    let status = "unpaid";
    if (Number(paid.total) >= Number(fee.amount)) {
      status = "paid";
    } else if (Number(paid.total) > 0) {
      status = "partial";
    }

    // Cập nhật lại trạng thái đóng tiền của đợt học phí
    await connection.query("UPDATE tuition_fees SET status = ? WHERE id = ?", [
      status,
      tuition_id,
    ]);

    await connection.commit();

    return sendResponse(res, 200, true, "Đóng tiền học phí thành công", {
      status,
    });
  } catch (err) {
    await connection.rollback();
    logErrorDetail("POST /payment", err);
    return sendResponse(
      res,
      500,
      false,
      "Giao dịch thất bại, hệ thống đã hoàn tác",
    );
  } finally {
    connection.release();
  }
});

// =========================================================================
// 6. GET: /api/tuition/payments/:tuitionId (Lịch sử các lần đóng tiền)
// =========================================================================
router.get("/payments/:tuitionId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM payments WHERE tuition_id = ? ORDER BY id DESC",
      [req.params.tuitionId],
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải lịch sử thanh toán thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail(`GET /payments/${req.params.tuitionId}`, err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi tải lịch sử thanh toán",
    );
  }
});

// =========================================================================
// 7. PUT: /api/tuition/:id (Cập nhật thông tin học phí an toàn)
// =========================================================================
router.put("/:id", async (req, res) => {
  try {
    const { amount, due_date, note } = req.body;

    await db.query(
      "UPDATE tuition_fees SET amount = ?, due_date = ?, note = ? WHERE id = ?",
      [amount, due_date || null, note || null, req.params.id],
    );
    return sendResponse(res, 200, true, "Cập nhật khoản học phí thành công");
  } catch (err) {
    logErrorDetail(`PUT /${req.params.id}`, err);
    return sendResponse(res, 500, false, "Lỗi hệ thống khi cập nhật thông tin");
  }
});

// =========================================================================
// 8. DELETE: /api/tuition/:id (Xóa đợt thu học phí và các hóa đơn con)
// =========================================================================
router.delete("/:id", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query("DELETE FROM payments WHERE tuition_id = ?", [
      req.params.id,
    ]);
    await connection.query("DELETE FROM tuition_fees WHERE id = ?", [
      req.params.id,
    ]);

    await connection.commit();
    return sendResponse(res, 200, true, "Xóa khoản học phí thành công");
  } catch (err) {
    await connection.rollback();
    logErrorDetail(`DELETE /${req.params.id}`, err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi xóa dữ liệu học phí",
    );
  } finally {
    connection.release();
  }
});

// =========================================================================
// 9. GET: /api/tuition/statistics/debt (Danh sách học sinh nợ tiền học kèm lớp)
// =========================================================================
router.get("/statistics/debt", async (req, res) => {
  try {
    // 🌟 ĐÃ SỬA: Bỏ trường tf.title không tồn tại, gom nhóm chuẩn hóa và xử lý SUM chính xác
    const [rows] = await db.query(
      `SELECT 
        s.student_code,
        s.full_name as student_name,
        c.class_name,
        tf.id as tuition_id,
        tf.amount,
        IFNULL(SUM(p.amount_paid), 0) as paid,
        (tf.amount - IFNULL(SUM(p.amount_paid), 0)) as debt_amount
       FROM tuition_fees tf
       JOIN students s ON tf.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN payments p ON tf.id = p.tuition_id
       GROUP BY tf.id, s.id, s.student_code, s.full_name, c.class_name
       HAVING debt_amount > 0
       ORDER BY debt_amount DESC`,
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải thống kê nợ học phí hoàn tất",
      rows,
    );
  } catch (err) {
    logErrorDetail("GET /statistics/debt", err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi thống kê danh sách nợ",
    );
  }
});

// =========================================================================
// 10. GET: /api/tuition/statistics/top-paid (Top 10 học sinh đóng nhiều phí nhất)
// =========================================================================
router.get("/statistics/top-paid", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        s.student_code,
        s.full_name as student_name,
        c.class_name,
        SUM(p.amount_paid) as total_paid
       FROM payments p
       JOIN tuition_fees tf ON p.tuition_id = tf.id
       JOIN students s ON tf.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       GROUP BY s.id, s.student_code, s.full_name, c.class_name
       ORDER BY total_paid DESC
       LIMIT 10`,
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải danh sách top hoàn thành học phí thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail("GET /statistics/top-paid", err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi thống kê top đóng học phí",
    );
  }
});

// =========================================================================
// 11. GET: /api/tuition/statistics/monthly (Thống kê doanh thu theo tháng)
// =========================================================================
router.get("/statistics/monthly", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        MONTH(payment_date) as month,
        YEAR(payment_date) as year,
        SUM(amount_paid) as revenue
       FROM payments
       WHERE payment_date IS NOT NULL
       GROUP BY YEAR(payment_date), MONTH(payment_date)
       ORDER BY year DESC, month DESC`,
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải thống kê doanh thu theo tháng thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail("GET /statistics/monthly", err);
    return sendResponse(res, 500, false, "Lỗi hệ thống khi thống kê doanh thu");
  }
});

// =========================================================================
// 12. GET: /api/tuition/form/students (Danh mục học sinh kèm tên lớp đổ vào Form)
// =========================================================================
router.get("/form/students", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        s.id, 
        s.student_code, 
        s.full_name, 
        c.class_name 
       FROM students s
       INNER JOIN classes c ON s.class_id = c.id
       ORDER BY c.class_name ASC, s.full_name ASC`,
    );
    return sendResponse(
      res,
      200,
      true,
      "Tải danh mục học sinh kèm lớp thành công",
      rows,
    );
  } catch (err) {
    logErrorDetail("GET /form/students", err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi lấy danh mục học sinh",
    );
  }
});
// =========================================================================
// 13. GET: /api/tuition/student/:studentId (Lấy tổng quan & danh sách học phí của 1 học sinh)
// =========================================================================
router.get("/student/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;

    // 1. Kiểm tra học sinh có tồn tại không và lấy thông tin cơ bản
    const [[student]] = await db.query(
      `SELECT s.id, s.student_code, s.full_name, c.class_name 
       FROM students s 
       LEFT JOIN classes c ON s.class_id = c.id 
       WHERE s.id = ?`,
      [studentId],
    );

    if (!student) {
      return sendResponse(
        res,
        404,
        false,
        "Không tìm thấy thông tin học sinh này",
      );
    }

    // 2. Lấy danh sách chi tiết tất cả các khoản học phí của học sinh này
    // Tính toán số tiền đã đóng (paid) và còn nợ (debt) cho từng khoản ngay trong SQL
    const [tuitionRecords] = await db.query(
      `SELECT 
        tf.id as tuition_id,
        tf.amount,
        tf.due_date,
        tf.status,
        tf.note,
        IFNULL(SUM(p.amount_paid), 0) as total_paid,
        (tf.amount - IFNULL(SUM(p.amount_paid), 0)) as total_debt
       FROM tuition_fees tf
       LEFT JOIN payments p ON tf.id = p.tuition_id
       WHERE tf.student_id = ?
       GROUP BY tf.id
       ORDER BY tf.id DESC`,
      [studentId],
    );

    // 3. Tính toán tổng số liệu gộp (Tổng phải đóng, Tổng đã đóng, Tổng nợ còn lại)
    let totalExpected = 0;
    let totalPaid = 0;
    let totalDebt = 0;

    tuitionRecords.forEach((record) => {
      totalExpected += Number(record.amount);
      totalPaid += Number(record.total_paid);
      totalDebt += Number(record.total_debt);
    });

    // 4. Lấy lịch sử tất cả các lần đóng tiền gần nhất của học sinh này
    const [paymentHistory] = await db.query(
      `SELECT p.id as payment_id, p.tuition_id, p.amount_paid, p.payment_method, p.payment_date, tf.note as fee_note
       FROM payments p
       JOIN tuition_fees tf ON p.tuition_id = tf.id
       WHERE tf.student_id = ?
       ORDER BY p.id DESC`,
      [studentId],
    );

    // Kết hợp cấu trúc dữ liệu trả về cho Frontend gọn đẹp
    const finalData = {
      studentInfo: student,
      summary: {
        totalExpected,
        totalPaid,
        totalDebt,
      },
      tuitionList: tuitionRecords,
      paymentHistory: paymentHistory,
    };

    return sendResponse(
      res,
      200,
      true,
      "Tải dữ liệu học phí học sinh thành công",
      finalData,
    );
  } catch (err) {
    logErrorDetail(`GET /student/${req.params.studentId}`, err);
    return sendResponse(
      res,
      500,
      false,
      "Lỗi hệ thống khi tải học phí của học sinh",
    );
  }
});
module.exports = router;
