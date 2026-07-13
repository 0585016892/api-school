const router = require("express").Router();
const db = require("../config/db");
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const offset = (page - 1) * limit;

    const search = req.query.search || "";

    const [rows] = await db.query(
      `
            SELECT
                c.*,
                t.full_name AS homeroom_teacher,

                (
                    SELECT COUNT(*)
                    FROM students s
                    WHERE s.class_id = c.id
                ) AS total_students

            FROM classes c

            LEFT JOIN teachers t
            ON c.homeroom_teacher_id = t.id

            WHERE c.class_name LIKE ?

            ORDER BY c.id DESC

            LIMIT ?
            OFFSET ?
            `,
      [`%${search}%`, limit, offset],
    );

    const [[total]] = await db.query(
      `
            SELECT COUNT(*) total
            FROM classes
            WHERE class_name LIKE ?
            `,
      [`%${search}%`],
    );

    res.json({
      data: rows,
      total: total.total,
      page,
      totalPages: Math.ceil(total.total / limit),
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT
                c.*,
                t.full_name AS homeroom_teacher
            FROM classes c
            LEFT JOIN teachers t
            ON c.homeroom_teacher_id = t.id
            WHERE c.id = ?
            `,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Không tìm thấy lớp",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.post("/", async (req, res) => {
  try {
    const { class_name, school_year, homeroom_teacher_id } = req.body;

    await db.query(
      `
            INSERT INTO classes
            (
                class_name,
                school_year,
                homeroom_teacher_id
            )
            VALUES (?, ?, ?)
            `,
      [class_name, school_year, homeroom_teacher_id],
    );

    res.json({
      success: true,
      message: "Thêm lớp thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/:id", async (req, res) => {
  try {
    await db.query(
      `
            UPDATE classes
            SET ?
            WHERE id = ?
            `,
      [req.body, req.params.id],
    );

    res.json({
      success: true,
      message: "Cập nhật thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const [[student]] = await db.query(
      `
            SELECT COUNT(*) total
            FROM students
            WHERE class_id = ?
            `,
      [req.params.id],
    );

    if (student.total > 0) {
      return res.status(400).json({
        message: "Lớp đang có học sinh",
      });
    }

    await db.query(
      `
            DELETE FROM classes
            WHERE id = ?
            `,
      [req.params.id],
    );

    res.json({
      success: true,
      message: "Xóa thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/:id/students", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT
                id,
                student_code,
                full_name,
                gender,
                birthday
            FROM students
            WHERE class_id = ?
            ORDER BY full_name
            `,
      [req.params.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/teachers/homeroom/list", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT
                id,
                teacher_code,
                full_name
            FROM teachers
            ORDER BY full_name
            `,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.put("/transfer/student/:studentId", async (req, res) => {
  try {
    const { new_class_id } = req.body;

    await db.query(
      `
                UPDATE students
                SET class_id = ?
                WHERE id = ?
                `,
      [new_class_id, req.params.studentId],
    );

    res.json({
      success: true,
      message: "Chuyển lớp thành công",
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/statistics/summary", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
                SELECT

                    c.id,
                    c.class_name,

                    COUNT(s.id) total_students

                FROM classes c

                LEFT JOIN students s
                ON c.id = s.class_id

                GROUP BY c.id

                ORDER BY total_students DESC
                `,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/dashboard/class-overview", async (req, res) => {
  try {
    const [[classes]] = await db.query(
      `
                SELECT COUNT(*) total
                FROM classes
                `,
    );

    const [[students]] = await db.query(
      `
                SELECT COUNT(*) total
                FROM students
                `,
    );

    res.json({
      total_classes: classes.total,
      total_students: students.total,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/teacher/:teacherId/classes", async (req, res) => {
  try {
    const { teacherId } = req.params;
    console.log("TEACHER ID", teacherId);
    // =========================
    // GET ALL CLASSES OF TEACHER
    // =========================
    const [classes] = await db.query(
      `
      SELECT 
        c.id AS class_id,
        c.class_name,
        t.full_name AS teacher_name
      FROM classes c
      LEFT JOIN teachers t 
        ON c.homeroom_teacher_id = t.id
      WHERE c.homeroom_teacher_id = ?
      `,
      [teacherId],
    );
    console.log("CLASSES", classes);
    if (!classes.length) {
      return res.json({
        success: true,
        classes: [],
      });
    }

    // lấy class_id đầu tiên (hoặc bạn có thể loop nhiều class)
    const classId = classes[0].class_id;
    console.log("CLASS ID", classId);
    // =========================
    // STUDENTS
    // =========================
    const [students] = await db.query(
      `
      SELECT *
      FROM students
      WHERE class_id = ?
      `,
      [classId],
    );

    // =========================
    // SCORES
    // =========================
    const [scores] = await db.query(
      `
      SELECT 
        sc.*,
        st.student_code,
        st.full_name,
        sb.subject_name
      FROM scores sc
      JOIN students st ON sc.student_id = st.id
      JOIN subjects sb ON sc.subject_id = sb.id
      WHERE st.class_id = ?
      `,
      [classId],
    );

    // =========================
    // ATTENDANCE
    // =========================
    const [attendance] = await db.query(
      `
      SELECT 
        a.*,
        st.student_code,
        st.full_name
      FROM attendance a
      JOIN students st ON a.student_id = st.id
      WHERE a.class_id = ?
      `,
      [classId],
    );

    res.json({
      success: true,
      class: classes[0],
      students,
      scores,
      attendance,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
module.exports = router;

/*Method	API
GET	/api/classes
GET	/api/classes/:id
POST	/api/classes
PUT	/api/classes/:id
DELETE	/api/classes/:id
GET	/api/classes/:id/students
GET	/api/classes/teachers/homeroom/list
PUT	/api/classes/transfer/student/:studentId
GET	/api/classes/statistics/summary
GET	/api/classes/dashboard/class-overview
*/
