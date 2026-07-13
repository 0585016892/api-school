const router = require("express").Router();
const db = require("../config/db");

router.get("/", async (req, res) => {
  console.log("CALL DASHBOARD");

  try {
    // =========================
    // Tổng số học sinh
    // =========================

    const [[students]] = await db.query(`
            SELECT COUNT(*) total
            FROM students
        `);

    // =========================
    // Tổng số giáo viên
    // =========================

    const [[teachers]] = await db.query(`
            SELECT COUNT(*) total
            FROM teachers
        `);

    // =========================
    // Tổng số lớp
    // =========================

    const [[classes]] = await db.query(`
            SELECT COUNT(*) total
            FROM classes
        `);

    // =========================
    // Tổng số môn học
    // =========================

    const [[subjects]] = await db.query(`
            SELECT COUNT(*) total
            FROM subjects
        `);

    // =========================
    // Điểm danh hôm nay
    // =========================

    const [[attendanceToday]] = await db.query(`
            SELECT COUNT(*) total
            FROM attendance
            WHERE attendance_date = CURDATE()
        `);

    // =========================
    // Có mặt hôm nay
    // =========================

    const [[presentToday]] = await db.query(`
            SELECT COUNT(*) total
            FROM attendance
            WHERE attendance_date = CURDATE()
            AND status = 'present'
        `);

    // =========================
    // Vắng hôm nay
    // =========================

    const [[absentToday]] = await db.query(`
            SELECT COUNT(*) total
            FROM attendance
            WHERE attendance_date = CURDATE()
            AND status = 'absent'
        `);

    // =========================
    // Đi muộn
    // =========================

    const [[lateToday]] = await db.query(`
            SELECT COUNT(*) total
            FROM attendance
            WHERE attendance_date = CURDATE()
            AND status = 'late'
        `);

    // =========================
    // Tổng học phí
    // =========================

    const [[tuition]] = await db.query(`
            SELECT
            IFNULL(SUM(amount),0) total
            FROM tuition_fees
        `);

    // =========================
    // Đã thu
    // =========================

    const [[paid]] = await db.query(`
            SELECT
            IFNULL(SUM(amount_paid),0) total
            FROM payments
        `);

    // =========================
    // Chưa thu
    // =========================

    const unpaid = tuition.total - paid.total;

    // =========================
    // Điểm trung bình toàn trường
    // =========================

    const [[avgScore]] = await db.query(`
            SELECT
            ROUND(AVG(score),2) average_score
            FROM scores
        `);

    // =========================
    // Top 5 lớp đông học sinh
    // =========================

    const [topClasses] = await db.query(`
            SELECT
                c.class_name,
                COUNT(s.id) total_students
            FROM classes c
            LEFT JOIN students s
                ON c.id = s.class_id
            GROUP BY c.id
            ORDER BY total_students DESC
            LIMIT 5
        `);

    // =========================
    // Học sinh theo lớp
    // =========================

    const [studentByClass] = await db.query(`
            SELECT
                c.class_name,
                COUNT(s.id) total
            FROM classes c
            LEFT JOIN students s
                ON c.id = s.class_id
            GROUP BY c.id
        `);

    // =========================
    // Điểm danh theo trạng thái
    // =========================

    const [attendanceChart] = await db.query(`
            SELECT
                status,
                COUNT(*) total
            FROM attendance
            GROUP BY status
        `);

    // =========================
    // Điểm TB theo môn
    // =========================

    const [subjectChart] = await db.query(`
            SELECT
                sub.subject_name,
                ROUND(AVG(sc.score),2) avg_score
            FROM scores sc
            JOIN subjects sub
                ON sc.subject_id = sub.id
            GROUP BY sub.id
        `);

    // =========================
    // 5 học sinh điểm cao nhất
    // =========================

    const [topStudents] = await db.query(`
            SELECT
                st.student_code,
                st.full_name,
                ROUND(AVG(sc.score),2) avg_score
            FROM students st
            JOIN scores sc
                ON st.id = sc.student_id
            GROUP BY st.id
            ORDER BY avg_score DESC
            LIMIT 5
        `);

    // =========================
    // Trả dữ liệu
    // =========================

    res.json({
      cards: {
        totalStudents: students.total,

        totalTeachers: teachers.total,

        totalClasses: classes.total,

        totalSubjects: subjects.total,

        attendanceToday: attendanceToday.total,

        presentToday: presentToday.total,

        absentToday: absentToday.total,

        lateToday: lateToday.total,

        totalTuition: tuition.total,

        totalCollected: paid.total,

        totalDebt: unpaid,

        averageScore: avgScore.average_score || 0,
      },

      charts: {
        studentByClass,

        attendanceChart,

        subjectChart,
      },

      tables: {
        topClasses,

        topStudents,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: err.message,
    });
  }
});
router.get("/teacher/:teacher_id", async (req, res) => {
  try {
    const { teacher_id } = req.params;
    console.log("TEACHER ID", teacher_id);
    // =========================
    // LỚP GIÁO VIÊN DẠY
    // =========================
    const [classes] = await db.query(
      `
      SELECT c.id, c.class_name
      FROM classes c
      WHERE c.homeroom_teacher_id = ?
    `,
      [teacher_id],
    );

    const classIds = classes.map((c) => c.id);
    console.log("CLASS IDS", classIds);
    if (classIds.length === 0) {
      return res.json({
        cards: {
          totalClasses: 0,
          totalStudents: 0,
          averageScore: 0,
          attendanceToday: 0,
        },
        charts: {},
        tables: {},
      });
    }

    // =========================
    // HỌC SINH CỦA TEACHER
    // =========================
    const [[students]] = await db.query(
      `
      SELECT COUNT(*) total
      FROM students
      WHERE class_id IN (?)
    `,
      [classIds],
    );

    // =========================
    // ATTENDANCE HÔM NAY (CHỈ LỚP GV)
    // =========================
    const [[attendanceToday]] = await db.query(
      `
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND class_id IN (?)
    `,
      [classIds],
    );

    const [[presentToday]] = await db.query(
      `
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'present'
      AND class_id IN (?)
    `,
      [classIds],
    );

    const [[absentToday]] = await db.query(
      `
      SELECT COUNT(*) total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'absent'
      AND class_id IN (?)
    `,
      [classIds],
    );

    // =========================
    // ĐIỂM TRUNG BÌNH LỚP GV
    // =========================
    const [[avgScore]] = await db.query(
      `
      SELECT ROUND(AVG(score),2) average_score
      FROM scores
      WHERE subject_id IN (
        SELECT id FROM subjects
      )
      AND student_id IN (
        SELECT id FROM students WHERE class_id IN (?)
      )
    `,
      [classIds],
    );

    // =========================
    // HỌC SINH THEO LỚP
    // =========================
    const [studentByClass] = await db.query(
      `
      SELECT c.class_name, COUNT(s.id) total
      FROM classes c
      LEFT JOIN students s ON c.id = s.class_id
      WHERE c.id IN (?)
      GROUP BY c.id
    `,
      [classIds],
    );

    // =========================
    // TOP HỌC SINH TRONG LỚP GV
    // =========================
    const [topStudents] = await db.query(
      `
      SELECT
        st.student_code,
        st.full_name,
        ROUND(AVG(sc.score),2) avg_score
      FROM students st
      JOIN scores sc ON st.id = sc.student_id
      WHERE st.class_id IN (?)
      GROUP BY st.id
      ORDER BY avg_score DESC
      LIMIT 5
    `,
      [classIds],
    );

    res.json({
      cards: {
        totalClasses: classes.length,
        totalStudents: students.total,
        attendanceToday: attendanceToday.total,
        presentToday: presentToday.total,
        absentToday: absentToday.total,
        averageScore: avgScore.average_score || 0,
      },

      charts: {
        studentByClass,
      },

      tables: {
        classes,
        topStudents,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
});
// =================================================================
// API DASHBOARD DÀNH CHO HỌC SINH / PHỤ HUYNH
// =================================================================
router.get("/student/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;
    console.log("CALL STUDENT DASHBOARD ID:", student_id);

    // 1. Kiểm tra học sinh có tồn tại & lấy thông tin lớp học
    const [[studentInfo]] = await db.query(
      `
      SELECT s.id, s.full_name, s.student_code, s.class_id, c.class_name, c.school_year 
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
      `,
      [student_id],
    );

    if (!studentInfo) {
      return res.status(444).json({
        success: false,
        message: "Không tìm thấy thông tin học sinh.",
      });
    }

    const classId = studentInfo.class_id;

    // =================================================================
    // CARDS: THÔNG SỐ TỔNG QUAN CÁ NHÂN
    // =================================================================

    // Điểm trung bình tất cả các môn của học sinh này (Bảng scores)
    const [[avgScore]] = await db.query(
      `
      SELECT ROUND(AVG(score), 2) average_score
      FROM scores
      WHERE student_id = ?
      `,
      [student_id],
    );

    // Thống kê điểm danh (Bảng attendance)
    const [[attendanceStats]] = await db.query(
      `
      SELECT 
        COUNT(CASE WHEN LOWER(status) = 'absent' OR status = 'Vắng' THEN 1 END) total_absent,
        COUNT(CASE WHEN LOWER(status) = 'late' OR status = 'Muộn' THEN 1 END) total_late
      FROM attendance
      WHERE student_id = ?
      `,
      [student_id],
    );

    // Tính số nhiệm vụ/môn học chưa có đầu điểm dựa vào Thời khóa biểu (Bảng schedules & scores)
    const [[pendingAssignments]] = await db.query(
      `
      SELECT COUNT(DISTINCT sch.subject_id) total
      FROM schedules sch
      WHERE sch.class_id = ? 
      AND sch.subject_id NOT IN (
        SELECT DISTINCT subject_id FROM scores WHERE student_id = ?
      )
      `,
      [classId, student_id],
    );

    // Lấy học phí dựa trên cấu trúc bảng mới của bạn (student_id, amount, status)
    const [[tuitionStats]] = await db.query(
      `
      SELECT 
        IFNULL(SUM(amount), 0) total_fee,
        IFNULL(SUM(CASE WHEN status != 'paid' THEN amount ELSE 0 END), 0) total_debt
      FROM tuition_fees
      WHERE student_id = ?
      `,
      [student_id],
    );

    // =================================================================
    // CHARTS: BIỂU ĐỒ DIỄN BIẾN HỌC TẬP
    // =================================================================

    // Biểu đồ điểm số theo từng môn học
    const [subjectScoresChart] = await db.query(
      `
      SELECT sub.subject_name, ROUND(AVG(sc.score), 2) avg_score
      FROM scores sc
      JOIN subjects sub ON sc.subject_id = sub.id
      WHERE sc.student_id = ?
      GROUP BY sub.id
      `,
      [student_id],
    );

    // =================================================================
    // TABLES: DANH SÁCH THÔNG TIN GẦN ĐÂY
    // =================================================================

    // Top 5 đầu điểm mới nhận gần đây nhất
    // =================================================================
    // TABLES: DANH SÁCH THÔNG TIN GẦN ĐÂY (ĐÃ XOAY TRỤC DỮ LIỆU - PIVOT)
    // =================================================================

    // Gom gọn toàn bộ đầu điểm: Mỗi môn học + Học kỳ chỉ nằm trên 1 dòng duy nhất
    const [recentScores] = await db.query(
      `
  SELECT 
    sub.subject_name,
    sc.semester,
    MAX(CASE WHEN sc.score_type = 'mieng' THEN sc.score END) AS diem_mieng,
    MAX(CASE WHEN sc.score_type = '15p' THEN sc.score END) AS diem_15p,
    MAX(CASE WHEN sc.score_type = '1tiet' THEN sc.score END) AS diem_1tiet,
    MAX(CASE WHEN sc.score_type = 'giuaky' THEN sc.score END) AS diem_giuaky,
    MAX(CASE WHEN sc.score_type = 'cuoiky' THEN sc.score END) AS diem_cuoiky,
    ROUND(AVG(sc.score), 2) AS avg_subject_score
  FROM scores sc
  JOIN subjects sub ON sc.subject_id = sub.id
  WHERE sc.student_id = ?
  GROUP BY sc.subject_id, sc.semester
  ORDER BY sc.updated_at DESC
  LIMIT 5
  `,
      [student_id],
    );

    // Lấy danh sách các môn học trong thời khóa biểu của lớp (Bảng schedules)
    const [recentSchedules] = await db.query(
      `
      SELECT sub.subject_name, sch.day_of_week, sch.lesson_period, sch.room
      FROM schedules sch
      JOIN subjects sub ON sch.subject_id = sub.id
      WHERE sch.class_id = ?
      ORDER BY FIELD(sch.day_of_week, 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật')
      LIMIT 5
      `,
      [classId],
    );

    // =================================================================
    // TRẢ DỮ LIỆU ĐỒNG BỘ CHO FRONTEND
    // =================================================================
    res.json({
      studentInfo: {
        fullName: studentInfo.full_name,
        studentCode: studentInfo.student_code,
        className: studentInfo.class_name,
        schoolYear: studentInfo.school_year,
      },
      cards: {
        averageScore: avgScore.average_score || 0,
        totalAbsent: attendanceStats.total_absent || 0,
        totalLate: attendanceStats.total_late || 0,
        pendingAssignments: pendingAssignments.total || 0,
        totalTuition: tuitionStats.total_fee,
        totalDebt: tuitionStats.total_debt,
      },
      charts: {
        subjectScoresChart,
      },
      tables: {
        recentScores,
        recentSchedules,
      },
    });
  } catch (err) {
    console.error("Lỗi tại Student Dashboard API:", err);
    res.status(500).json({
      message: "Lỗi hệ thống khi tải bảng điều khiển học sinh.",
      error: err.message,
    });
  }
});
module.exports = router;
