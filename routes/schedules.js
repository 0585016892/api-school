const router = require("express").Router();
const db = require("../config/db");

// 1. GET ALL (Có phân trang, bộ lọc)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const classId = req.query.class_id || "";
    const teacherId = req.query.teacher_id || "";

    // Câu lệnh đếm tổng số bản ghi (Cần thiết cho Antd Pagination hiển thị tổng số trang)
    let countSql = `SELECT COUNT(*) AS total FROM schedules WHERE 1=1`;
    let countParams = [];

    let sql = `
      SELECT 
        sc.*,
        c.class_name,
        s.subject_name,
        t.full_name AS teacher_name
      FROM schedules sc
      JOIN classes c ON sc.class_id = c.id
      JOIN subjects s ON sc.subject_id = s.id
      JOIN teachers t ON sc.teacher_id = t.id
      WHERE 1=1
    `;
    let params = [];

    if (classId) {
      sql += ` AND sc.class_id = ? `;
      countSql += ` AND class_id = ? `;
      params.push(classId);
      countParams.push(classId);
    }

    if (teacherId) {
      sql += ` AND sc.teacher_id = ? `;
      countSql += ` AND teacher_id = ? `;
      params.push(teacherId);
      countParams.push(teacherId);
    }

    sql += `
      ORDER BY 
        CASE 
          WHEN sc.day_of_week = 'Monday' THEN 1
          WHEN sc.day_of_week = 'Tuesday' THEN 2
          WHEN sc.day_of_week = 'Wednesday' THEN 3
          WHEN sc.day_of_week = 'Thursday' THEN 4
          WHEN sc.day_of_week = 'Friday' THEN 5
          WHEN sc.day_of_week = 'Saturday' THEN 6
          WHEN sc.day_of_week = 'Sunday' THEN 7
          ELSE 8
        END,
        sc.lesson_period ASC
      LIMIT ? OFFSET ?
    `;

    params.push(limit);
    params.push(offset);

    // Chạy song song cả 2 câu lệnh lấy data và đếm tổng số dòng
    const [[{ total }], [rows]] = await Promise.all([
      db.query(countSql, countParams),
      db.query(sql, params),
    ]);

    // Trả về đúng format để Frontend Antd bóc tách (rows và total)
    res.json({
      data: rows,
      total: total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
  }
});

// 2. GET BY ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM schedules WHERE id = ?`, [
      req.params.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy lịch học" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. POST - THÊM MỚI (Đã sửa lỗi dư dấu phẩy)
router.post("/", async (req, res) => {
  try {
    const {
      class_id,
      subject_id,
      teacher_id,
      day_of_week,
      lesson_period,
      room,
    } = req.body;

    // Kiểm tra trùng lịch của lớp
    const [exists] = await db.query(
      `SELECT id FROM schedules WHERE class_id = ? AND day_of_week = ? AND lesson_period = ?`,
      [class_id, day_of_week, lesson_period],
    );

    if (exists.length) {
      return res.status(400).json({
        message: "Lớp học này đã có tiết học vào thời gian đã chọn!",
      });
    }

    // Đã loại bỏ dấu phẩy thừa ở cuối danh sách cột và VALUES trùng khớp
    await db.query(
      `INSERT INTO schedules (class_id, subject_id, teacher_id, day_of_week, lesson_period, room) 
       VALUES (?, ?, ?, ?, ?, ? )`,
      [class_id, subject_id, teacher_id, day_of_week, lesson_period, room],
    );

    res.json({
      success: true,
      message: "Thêm thời khóa biểu thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

// 4. PUT - CẬP NHẬT (Sửa lại câu UPDATE chuẩn an toàn)
router.put("/:id", async (req, res) => {
  try {
    const {
      class_id,
      subject_id,
      teacher_id,
      day_of_week,
      lesson_period,
      room,
    } = req.body;
    const scheduleId = req.params.id;

    // Kiểm tra xem việc cập nhật có làm trùng lịch lớp khác không (trừ chính nó)
    const [exists] = await db.query(
      `SELECT id FROM schedules WHERE class_id = ? AND day_of_week = ? AND lesson_period = ? AND id != ?`,
      [class_id, day_of_week, lesson_period, scheduleId],
    );

    if (exists.length) {
      return res.status(400).json({ message: "Trùng lịch học của lớp!" });
    }

    await db.query(
      `UPDATE schedules 
       SET class_id = ?, subject_id = ?, teacher_id = ?, day_of_week = ?, lesson_period = ?, room = ?
       WHERE id = ?`,
      [
        class_id,
        subject_id,
        teacher_id,
        day_of_week,
        lesson_period,
        room,
        scheduleId,
      ],
    );

    res.json({
      success: true,
      message: "Cập nhật thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

// 5. DELETE - XÓA
router.delete("/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM schedules WHERE id = ?`, [req.params.id]);
    res.json({
      success: true,
      message: "Xóa thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// 6. GET BY CLASS ID
router.get("/class/:classId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT sc.*, s.subject_name, t.full_name AS teacher_name
       FROM schedules sc
       JOIN subjects s ON sc.subject_id = s.id
       JOIN teachers t ON sc.teacher_id = t.id
       WHERE sc.class_id = ?
       ORDER BY sc.day_of_week, sc.lesson_period`,
      [req.params.classId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 7. GET BY TEACHER ID
router.get("/teacher/:teacherId", async (req, res) => {
  console.log("CALL GET BY TEACHER ID");

  try {
    const [rows] = await db.query(
      `SELECT sc.*, c.class_name, s.subject_name
       FROM schedules sc
       JOIN classes c ON sc.class_id = c.id
       JOIN subjects s ON sc.subject_id = s.id
       WHERE sc.teacher_id = ?
       ORDER BY sc.day_of_week, sc.lesson_period`,
      [req.params.teacherId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 8. DICTIONARY DATA FOR FORM
router.get("/form/data", async (req, res) => {
  try {
    const [classes] = await db.query(
      `SELECT id, class_name, homeroom_teacher_id, homeroom_teacher FROM classes`,
    );
    const [subjects] = await db.query(
      `SELECT id, subject_name, subject_code FROM subjects`,
    );
    const [teachers] = await db.query(
      `SELECT id, full_name, teacher_code FROM teachers`,
    );

    res.json({ classes, subjects, teachers });
  } catch (err) {
    res.status(500).json(err);
  }
});

// 9. STATISTICS SUMMARY
router.get("/statistics/summary", async (req, res) => {
  try {
    const [[totalSchedules]] = await db.query(
      `SELECT COUNT(*) total FROM schedules`,
    );
    const [[totalRooms]] = await db.query(
      `SELECT COUNT(DISTINCT room) total FROM schedules`,
    );
    const [[totalTeachers]] = await db.query(
      `SELECT COUNT(DISTINCT teacher_id) total FROM schedules`,
    );

    res.json({
      totalSchedules: totalSchedules.total,
      totalRooms: totalRooms.total,
      totalTeachers: totalTeachers.total,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// API LẤY THỜI KHÓA BIỂU HỌC SINH (Đã đồng bộ hóa sử dụng biến `db`)
router.get("/student/:student_id", async (req, res) => {
  const studentId = req.params.student_id;
  const timestamp = new Date().toISOString();

  // [LOG] 1. Thêm log khi bắt đầu nhận request
  console.log(
    `[${timestamp}] [INFO] GET /student/${studentId} - Bắt đầu xử lý yêu cầu lấy thời khóa biểu.`,
  );

  // Kiểm tra đầu vào hợp lệ
  if (!studentId || isNaN(studentId)) {
    // [LOG] Log cảnh báo dữ liệu đầu vào không hợp lệ
    console.warn(
      `[${timestamp}] [WARN] GET /student/${studentId} - Thất bại: ID học sinh không hợp lệ.`,
    );
    return res.status(400).json({
      success: false,
      message: "Mã ID học sinh không hợp lệ hoặc không được để trống.",
    });
  }

  try {
    // 2. Câu lệnh SQL truy vấn thông qua các khóa phụ kết nối bảng
    const sqlQuery = `
      SELECT 
        st.id AS student_id,
        st.full_name AS student_name,
        c.class_name,
        sch.day_of_week,
        sch.lesson_period,
        sch.room,
        sub.subject_name,
        t.full_name AS teacher_name
      FROM students st
      JOIN classes c ON st.class_id = c.id
      JOIN schedules sch ON c.id = sch.class_id
      JOIN subjects sub ON sch.subject_id = sub.id
      LEFT JOIN teachers t ON sch.teacher_id = t.id
      WHERE st.id = ?
      ORDER BY 
        CASE 
          WHEN sch.day_of_week LIKE '%Hai%' THEN 2
          WHEN sch.day_of_week LIKE '%Ba%' THEN 3
          WHEN sch.day_of_week LIKE '%Tư%' THEN 4
          WHEN sch.day_of_week LIKE '%Năm%' THEN 5
          WHEN sch.day_of_week LIKE '%Sáu%' THEN 6
          WHEN sch.day_of_week LIKE '%Bảy%' THEN 7
          ELSE 8
        END, 
        sch.lesson_period ASC;
    `;

    // [LOG] Log câu lệnh chuẩn bị chạy (tiện khi cần test query thuần trong MySQL Workbench/Navicat)
    console.log(
      `[${timestamp}] [DB] Đang thực thi truy vấn SQL cho student_id = ${studentId}`,
    );

    // 3. Sử dụng trực tiếp biến `db.query`
    const [rows] = await db.query(sqlQuery, [studentId]);

    // [LOG] Log số lượng bản ghi trả về từ Database
    console.log(
      `[${timestamp}] [DB] Kết quả truy vấn thành công. Tìm thấy: ${rows.length} tiết học.`,
    );

    // 4. Kiểm tra xem học sinh có lịch học không
    if (rows.length === 0) {
      // [LOG] Log cảnh báo nếu tìm thấy dữ liệu học sinh nhưng lớp chưa được phân thời khóa biểu
      console.warn(
        `[${timestamp}] [WARN] Không tìm thấy dữ liệu thời khóa biểu cho student_id = ${studentId}`,
      );
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy thời khóa biểu hoặc thông tin lớp học cho học sinh có ID: ${studentId}`,
        data: [],
      });
    }

    // [LOG] Log khi kết thúc request thành công tốt đẹp
    console.log(
      `[${timestamp}] [INFO] GET /student/${studentId} - Phản hồi thành công (200 OK). Học sinh: ${rows[0].student_name}`,
    );

    // 5. Trả về dữ liệu thành công cho Front-end (React) nhận
    return res.status(200).json({
      success: true,
      message: "Tải thời khóa biểu thành công.",
      data: rows,
    });
  } catch (error) {
    // [LOG] 2. Log lỗi chi tiết (Bao gồm cả stack trace để biết chính xác lỗi ở dòng nào trong code)
    console.error(
      `[${timestamp}] [ERROR] Khách hàng gọi GET /student/${studentId} bị lỗi hệ thống!`,
    );
    console.error(`[${timestamp}] [STACK TRACE]:`, error);

    return res.status(500).json({
      success: false,
      message: "Đã xảy ra lỗi hệ thống khi truy vấn dữ liệu.",
      error: error.message,
    });
  }
});
module.exports = router;

/*
| Method | API                                 |
| ------ | ----------------------------------- |
| GET    | `/api/schedules`                    |
| GET    | `/api/schedules/:id`                |
| POST   | `/api/schedules`                    |
| PUT    | `/api/schedules/:id`                |
| DELETE | `/api/schedules/:id`                |
| GET    | `/api/schedules/class/:classId`     |
| GET    | `/api/schedules/teacher/:teacherId` |
| GET    | `/api/schedules/form/data`          |
| GET    | `/api/schedules/statistics/summary` |

*/
