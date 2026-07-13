const router = require("express").Router();
const db = require("../config/db");

/* =========================================================
   📊 GET BẢNG ĐIỂM THEO LỚP (EXCEL VIEW)
========================================================= */
router.get("/class/:classId", async (req, res) => {
  try {
    const { classId } = req.params;
    const { subject_id, semester } = req.query;

    if (!subject_id || !semester) {
      return res.status(400).json({
        success: false,
        message: "Thiếu subject_id hoặc semester",
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        s.id AS student_id,
        s.student_code,
        s.full_name,

        COALESCE(MAX(CASE WHEN sc.score_type='mieng' THEN sc.score END),0) AS mieng,
        COALESCE(MAX(CASE WHEN sc.score_type='15p' THEN sc.score END),0) AS p15,
        COALESCE(MAX(CASE WHEN sc.score_type='1tiet' THEN sc.score END),0) AS tiet1,
        COALESCE(MAX(CASE WHEN sc.score_type='giuaky' THEN sc.score END),0) AS giuaky,
        COALESCE(MAX(CASE WHEN sc.score_type='cuoiky' THEN sc.score END),0) AS cuoiky

      FROM students s

      LEFT JOIN scores sc
        ON sc.student_id = s.id
        AND sc.class_id = s.class_id
        AND sc.subject_id = ?
        AND sc.semester = ?

      WHERE s.class_id = ?

      GROUP BY s.id
      ORDER BY s.full_name ASC
      `,
      [subject_id, semester, classId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
});

/* =========================================================
   📥 BULK UPSERT SCORES (EXCEL SAVE)
========================================================= */
router.post("/bulk", async (req, res) => {
  try {
    const { scores } = req.body;

    if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid data",
      });
    }

    const values = scores.map((item) => [
      item.student_id,
      item.class_id,
      item.subject_id,
      item.semester,
      item.score_type,
      item.score || 0,
    ]);

    const sql = `
      INSERT INTO scores
      (student_id, class_id, subject_id, semester, score_type, score)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        score = VALUES(score),
        updated_at = CURRENT_TIMESTAMP
    `;

    const result = await db.query(sql, [values]);

    res.json({
      success: true,
      message: "Lưu điểm thành công",
      affectedRows: result?.[0]?.affectedRows,
    });
  } catch (err) {
    console.log("BULK ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

/* =========================================================
   📊 GET SCORES BY STUDENT
========================================================= */
router.get("/student/:studentId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT *
      FROM scores
      WHERE student_id = ?
      ORDER BY subject_id, score_type
      `,
      [req.params.studentId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📈 AVERAGE BY SUBJECT
========================================================= */
router.get("/student/:studentId/average", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        subject_id,
        ROUND(AVG(score),2) AS avg_score
      FROM scores
      WHERE student_id = ?
      GROUP BY subject_id
      `,
      [req.params.studentId],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   🧠 RANKING
========================================================= */
router.get("/student/:studentId/ranking", async (req, res) => {
  try {
    const [[row]] = await db.query(
      `
      SELECT AVG(score) AS avg
      FROM scores
      WHERE student_id = ?
      `,
      [req.params.studentId],
    );

    const score = Number(row?.avg || 0);

    let rank = "Yếu";
    if (score >= 8) rank = "Giỏi";
    else if (score >= 6.5) rank = "Khá";
    else if (score >= 5) rank = "Trung bình";

    res.json({
      average: score.toFixed(2),
      rank,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* =========================================================
   📊 DASHBOARD
========================================================= */
router.get("/statistics/dashboard", async (req, res) => {
  try {
    const [[total]] = await db.query(`SELECT COUNT(*) AS total FROM scores`);

    const [[avg]] = await db.query(`SELECT AVG(score) AS average FROM scores`);

    const [[max]] = await db.query(`SELECT MAX(score) AS max FROM scores`);

    const [[min]] = await db.query(`SELECT MIN(score) AS min FROM scores`);

    res.json({
      total: total.total,
      average: avg.average || 0,
      max: max.max || 0,
      min: min.min || 0,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
