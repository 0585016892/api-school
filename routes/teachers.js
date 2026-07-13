const router = require("express").Router();
const bcrypt = require("bcryptjs");

const db = require("../config/db");

router.get("/dashboard/summary", async (req, res) => {
  try {
    const [[totalTeachers]] = await db.query(`
            SELECT COUNT(*) total
            FROM teachers
        `);

    const [[maleTeachers]] = await db.query(`
            SELECT COUNT(*) total
            FROM teachers
            WHERE gender = 'Nam'
        `);

    const [[femaleTeachers]] = await db.query(`
            SELECT COUNT(*) total
            FROM teachers
            WHERE gender = 'Nữ'
        `);

    const [[totalSalary]] = await db.query(`
            SELECT IFNULL(SUM(salary),0) total
            FROM teachers
        `);

    res.json({
      totalTeachers: totalTeachers.total,
      maleTeachers: maleTeachers.total,
      femaleTeachers: femaleTeachers.total,
      totalSalary: totalSalary.total,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const offset = (page - 1) * limit;

    const search = req.query.search || "";

    const [rows] = await db.query(
      `
            SELECT *

            FROM teachers

            WHERE
                teacher_code LIKE ?
                OR full_name LIKE ?
                OR phone LIKE ?

            ORDER BY id DESC

            LIMIT ?
            OFFSET ?
            `,
      [`%${search}%`, `%${search}%`, `%${search}%`, limit, offset],
    );

    const [[total]] = await db.query(
      `
            SELECT COUNT(*) total

            FROM teachers

            WHERE
                teacher_code LIKE ?
                OR full_name LIKE ?
                OR phone LIKE ?
            `,
      [`%${search}%`, `%${search}%`, `%${search}%`],
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
            SELECT *
            FROM teachers
            WHERE id = ?
            `,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Không tìm thấy giáo viên",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/", async (req, res) => {
  const connection = await db.getConnection();

  try {
    console.log("========== CREATE TEACHER ==========");
    console.log("BODY:", req.body);

    await connection.beginTransaction();

    const {
      teacher_code,
      full_name,
      gender,
      birthday,
      phone,
      email,
      address,
      avatar,
      qualification,
      hire_date,
      salary,
    } = req.body;

    // 1. INSERT TEACHER
    const [teacherResult] = await connection.query(
      `
      INSERT INTO teachers
      (
        teacher_code,
        full_name,
        gender,
        birthday,
        phone,
        email,
        address,
        avatar,
        qualification,
        hire_date,
        salary
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        teacher_code,
        full_name,
        gender,
        birthday,
        phone,
        email,
        address,
        avatar,
        qualification,
        hire_date,
        salary,
      ],
    );

    const teacherId = teacherResult.insertId;

    console.log("TEACHER CREATED ID:", teacherId);

    // 2. AUTO CREATE USER ACCOUNT
    const defaultPassword = "123456"; // hoặc random

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await connection.query(
      `
     INSERT INTO users
(
  username,
  password,
  role,
  is_active,
  teacher_id
)
VALUES (?,?,?,?,?)
      `,
      [email, hashedPassword, "teacher", 1, teacherId],
    );

    await connection.commit();

    console.log("USER ACCOUNT CREATED");

    res.json({
      success: true,
      message: "Tạo giáo viên + tài khoản thành công",
      data: {
        teacher_id: teacherId,
        default_password: defaultPassword,
      },
    });
  } catch (err) {
    await connection.rollback();

    console.log("========== ERROR ==========");
    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    connection.release();
  }
});
router.put("/:id", async (req, res) => {
  try {
    await db.query(
      `
            UPDATE teachers
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
    await db.query(
      `
            DELETE FROM teachers
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
router.get("/:id/subjects", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT

                s.id,
                s.subject_code,
                s.subject_name

            FROM teacher_subjects ts

            JOIN subjects s
            ON ts.subject_id = s.id

            WHERE ts.teacher_id = ?
            `,
      [req.params.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/:id/classes", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT DISTINCT

                c.id,
                c.class_name

            FROM schedules sc

            JOIN classes c
            ON sc.class_id = c.id

            WHERE sc.teacher_id = ?
            `,
      [req.params.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/:id/schedules", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT

                sc.*,

                c.class_name,

                s.subject_name

            FROM schedules sc

            JOIN classes c
            ON sc.class_id = c.id

            JOIN subjects s
            ON sc.subject_id = s.id

            WHERE sc.teacher_id = ?

            ORDER BY
                day_of_week,
                lesson_period
            `,
      [req.params.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/profile/:id", async (req, res) => {
  console.log("=== CALL TEACHER PROFILE ===");
  console.log("Teacher ID:", req.params.id);

  try {
    const [[teacher]] = await db.query(`SELECT * FROM teachers WHERE id = ?`, [
      req.params.id,
    ]);

    console.log("TEACHER:", teacher);

    const [subjects] = await db.query(
      `
      SELECT s.subject_name
      FROM teacher_subjects ts
      JOIN subjects s ON ts.subject_id = s.id
      WHERE ts.teacher_id = ?
      `,
      [req.params.id],
    );

    console.log("SUBJECTS:", subjects);

    const [classes] = await db.query(
      `
      SELECT DISTINCT c.class_name
      FROM schedules sc
      JOIN classes c ON sc.class_id = c.id
      WHERE sc.teacher_id = ?
      `,
      [req.params.id],
    );

    console.log("CLASSES:", classes);

    const response = {
      teacher,
      subjects,
      classes,
    };

    console.log("FINAL RESPONSE:", response);

    res.json(response);
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});
router.get("/statistics/by-subject", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT

                s.subject_name,

                COUNT(ts.teacher_id)
                total_teachers

            FROM subjects s

            LEFT JOIN teacher_subjects ts
            ON s.id = ts.subject_id

            GROUP BY s.id
            `,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/statistics/top-teachers", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
            SELECT

                t.teacher_code,

                t.full_name,

                COUNT(
                    DISTINCT sc.class_id
                ) total_classes

            FROM teachers t

            JOIN schedules sc
            ON t.id = sc.teacher_id

            GROUP BY t.id

            ORDER BY total_classes DESC

            LIMIT 10
            `,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
router.get("/form/data", async (req, res) => {
  try {
    const [teachers] = await db.query(
      `
            SELECT
                id,
                teacher_code,
                full_name
            FROM teachers
            ORDER BY full_name
            `,
    );

    res.json(teachers);
  } catch (err) {
    res.status(500).json(err);
  }
});
module.exports = router;
/**
 * | Method | API                                     |
| ------ | --------------------------------------- |
| GET    | `/api/teachers`                         |
| GET    | `/api/teachers/:id`                     |
| POST   | `/api/teachers`                         |
| PUT    | `/api/teachers/:id`                     |
| DELETE | `/api/teachers/:id`                     |
| GET    | `/api/teachers/profile/:id`             |
| GET    | `/api/teachers/:id/subjects`            |
| GET    | `/api/teachers/:id/classes`             |
| GET    | `/api/teachers/:id/schedules`           |
| GET    | `/api/teachers/dashboard/summary`       |
| GET    | `/api/teachers/statistics/by-subject`   |
| GET    | `/api/teachers/statistics/top-teachers` |
| GET    | `/api/teachers/form/data`               |

 */
