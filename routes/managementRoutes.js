const express = require("express");
const router = express.Router();
const db = require("../config/db");

// =====================================================
// HELPER
// =====================================================

const getRows = (result) => {
  if (!result) return [];

  // mysql2/promise:
  // result = [rows, fields]

  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0];
  }

  return result;
};

const getFirstRow = (result) => {
  const rows = getRows(result);

  if (Array.isArray(rows)) {
    return rows[0] || {};
  }

  return rows || {};
};

const safeNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

// =====================================================
// GET MANAGEMENT DASHBOARD
// GET /api/management/dashboard
// =====================================================

router.get("/dashboard", async (req, res) => {
  console.log("\n");
  console.log("=====================================================");
  console.log("📊 GET MANAGEMENT DASHBOARD");
  console.log("=====================================================");
  console.log("⏰ Time:", new Date().toISOString());

  try {
    // =================================================
    // 1. KIỂM TRA DATABASE
    // =================================================

    console.log("\n🔌 [1] CHECK DATABASE CONNECTION");

    try {
      const [dbTest] = await db.query("SELECT DATABASE() AS database_name");

      console.log("✅ Database connected:", dbTest);
    } catch (dbError) {
      console.error("❌ Database connection error:", dbError);

      throw dbError;
    }

    // =================================================
    // 2. OVERVIEW
    // =================================================

    console.log("\n📌 [2] QUERY OVERVIEW");

    const [overviewRows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM students) AS students,
        (SELECT COUNT(*) FROM teachers) AS teachers,
        (SELECT COUNT(*) FROM staffs) AS staffs,
        (SELECT COUNT(*) FROM classes) AS classes,
        (SELECT COUNT(*) FROM organizations) AS organizations,
        (SELECT COUNT(*) FROM rewards) AS rewards,
        (SELECT COUNT(*) FROM disciplines) AS disciplines,
        (SELECT COUNT(*) FROM documents) AS documents,
        (SELECT COUNT(*) FROM meetings) AS meetings
    `);

    const overview = overviewRows[0] || {};

    console.log("✅ OVERVIEW RAW:");
    console.dir(overview, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 3. ATTENDANCE
    // =================================================

    console.log("\n📌 [3] QUERY ATTENDANCE");

    const [attendanceRows] = await db.query(`
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused

      FROM attendance
    `);

    const attendance = attendanceRows[0] || {};

    console.log("✅ ATTENDANCE RAW:");
    console.dir(attendance, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 4. TUITION
    // =================================================

    console.log("\n📌 [4] QUERY TUITION");

    const [tuitionRows] = await db.query(`
      SELECT
        COUNT(*) AS total_records,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM tuition_fees
    `);

    const tuition = tuitionRows[0] || {};

    console.log("✅ TUITION RAW:");
    console.dir(tuition, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 5. ORGANIZATION
    // =================================================

    console.log("\n📌 [5] QUERY ORGANIZATION");

    const [organizationRows] = await db.query(`
      SELECT
        COUNT(*) AS totalOrganizations,

        (
          SELECT COUNT(*)
          FROM organization_members
          WHERE teacher_id IS NOT NULL
        ) AS totalTeachers,

        (
          SELECT COUNT(*)
          FROM organization_members
          WHERE staff_id IS NOT NULL
        ) AS totalStaffs,

        (
          SELECT COUNT(*)
          FROM organization_members
        ) AS totalMembers

      FROM organizations
    `);

    const organization = organizationRows[0] || {};

    console.log("✅ ORGANIZATION RAW:");
    console.dir(organization, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 6. STUDENTS BY GRADE
    // =================================================

    console.log("\n📌 [6] QUERY STUDENT BY GRADE");

    const [studentByGradeRows] = await db.query(`
      SELECT
        CASE
          WHEN c.class_name LIKE '1%' THEN '1'
          WHEN c.class_name LIKE '2%' THEN '2'
          WHEN c.class_name LIKE '3%' THEN '3'
          WHEN c.class_name LIKE '4%' THEN '4'
          WHEN c.class_name LIKE '5%' THEN '5'
          ELSE 'Khác'
        END AS grade,

        COUNT(s.id) AS total

      FROM students s

      LEFT JOIN classes c
        ON s.class_id = c.id

      GROUP BY grade

      ORDER BY grade
    `);

    console.log("✅ STUDENT BY GRADE RAW:");
    console.dir(studentByGradeRows, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 7. STUDENT GENDER
    // =================================================

    console.log("\n📌 [7] QUERY STUDENT GENDER");

    const [studentGenderRows] = await db.query(`
      SELECT
        gender,
        COUNT(*) AS total
      FROM students
      GROUP BY gender
    `);

    console.log("✅ STUDENT GENDER RAW:");
    console.dir(studentGenderRows, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 8. TEACHER GENDER
    // =================================================

    console.log("\n📌 [8] QUERY TEACHER GENDER");

    const [teacherGenderRows] = await db.query(`
      SELECT
        gender,
        COUNT(*) AS total
      FROM teachers
      GROUP BY gender
    `);

    console.log("✅ TEACHER GENDER RAW:");
    console.dir(teacherGenderRows, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 9. STAFF GENDER
    // =================================================

    console.log("\n📌 [9] QUERY STAFF GENDER");

    const [staffGenderRows] = await db.query(`
      SELECT
        gender,
        COUNT(*) AS total
      FROM staffs
      GROUP BY gender
    `);

    console.log("✅ STAFF GENDER RAW:");
    console.dir(staffGenderRows, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 10. TEACHERS
    // =================================================

    console.log("\n📌 [10] QUERY TEACHERS");

    const [teachers] = await db.query(`
      SELECT
        *
      FROM teachers
      ORDER BY id DESC
    `);

    console.log("✅ TEACHERS COUNT:", teachers.length);

    console.dir(teachers, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 11. STAFFS
    // =================================================

    console.log("\n📌 [11] QUERY STAFFS");

    const [staffs] = await db.query(`
      SELECT
        id,
        user_id,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        position,
        department,
        address,
        status,
        created_at,
        updated_at
      FROM staffs
      ORDER BY id DESC
    `);

    console.log("✅ STAFFS COUNT:", staffs.length);

    console.dir(staffs, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 12. CLASSES
    // =================================================

    console.log("\n📌 [12] QUERY CLASSES");

    const [classes] = await db.query(`
      SELECT
        c.id,
        c.class_name,
        c.school_year,
        c.homeroom_teacher_id,
        t.full_name AS homeroom_teacher_name
      FROM classes c
      LEFT JOIN teachers t
        ON c.homeroom_teacher_id = t.id
      ORDER BY c.class_name
    `);

    console.log("✅ CLASSES COUNT:", classes.length);

    console.dir(classes, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 13. REWARDS
    // =================================================

    console.log("\n📌 [13] QUERY REWARDS");

    const [rewards] = await db.query(`
      SELECT
        r.*,

        s.full_name AS student_name,

        t.full_name AS teacher_name,

        st.full_name AS staff_name

      FROM rewards r

      LEFT JOIN students s
        ON r.student_id = s.id

      LEFT JOIN teachers t
        ON r.teacher_id = t.id

      LEFT JOIN staffs st
        ON r.staff_id = st.id

      ORDER BY r.id DESC
      LIMIT 10
    `);

    console.log("✅ REWARDS COUNT:", rewards.length);

    console.dir(rewards, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 14. DISCIPLINES
    // =================================================

    console.log("\n📌 [14] QUERY DISCIPLINES");

    const [disciplines] = await db.query(`
      SELECT
        d.*,

        s.full_name AS student_name,

        t.full_name AS teacher_name,

        st.full_name AS staff_name

      FROM disciplines d

      LEFT JOIN students s
        ON d.student_id = s.id

      LEFT JOIN teachers t
        ON d.teacher_id = t.id

      LEFT JOIN staffs st
        ON d.staff_id = st.id

      ORDER BY d.id DESC
      LIMIT 10
    `);

    console.log("✅ DISCIPLINES COUNT:", disciplines.length);

    console.dir(disciplines, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 15. ORGANIZATIONS
    // =================================================

    console.log("\n📌 [15] QUERY ORGANIZATIONS");

    const [organizations] = await db.query(`
      SELECT
        o.id,
        o.name,
        o.type,
        o.parent_id,
        o.status
      FROM organizations o
      ORDER BY o.id
    `);

    console.log("✅ ORGANIZATIONS COUNT:", organizations.length);

    console.dir(organizations, {
      depth: null,
      colors: true,
    });

    // =================================================
    // 16. FORMAT
    // =================================================

    console.log("\n📊 [16] FORMAT DATA");

    const attendanceTotal = safeNumber(attendance.total);

    const attendanceRate =
      attendanceTotal > 0
        ? Math.round((safeNumber(attendance.present) / attendanceTotal) * 100)
        : 0;

    const responseData = {
      overview: {
        students: safeNumber(overview.students),
        teachers: safeNumber(overview.teachers),
        staffs: safeNumber(overview.staffs),
        classes: safeNumber(overview.classes),
        organizations: safeNumber(overview.organizations),
        rewards: safeNumber(overview.rewards),
        disciplines: safeNumber(overview.disciplines),
        documents: safeNumber(overview.documents),
        meetings: safeNumber(overview.meetings),
      },

      attendance: {
        total: safeNumber(attendance.total),
        present: safeNumber(attendance.present),
        absent: safeNumber(attendance.absent),
        late: safeNumber(attendance.late),
        excused: safeNumber(attendance.excused),
        rate: attendanceRate,
      },

      tuition: {
        total_records: safeNumber(tuition.total_records),
        total_amount: safeNumber(tuition.total_amount),
      },

      organization: {
        totalOrganizations: safeNumber(organization.totalOrganizations),

        totalMembers: safeNumber(organization.totalMembers),

        totalTeachers: safeNumber(organization.totalTeachers),

        totalStaffs: safeNumber(organization.totalStaffs),
      },

      charts: {
        studentByGrade: studentByGradeRows.map((item) => ({
          name: `Khối ${item.grade}`,
          value: safeNumber(item.total),
        })),

        studentGender: studentGenderRows.map((item) => ({
          name: item.gender,
          value: safeNumber(item.total),
        })),

        teacherGender: teacherGenderRows.map((item) => ({
          name: item.gender,
          value: safeNumber(item.total),
        })),

        staffGender: staffGenderRows.map((item) => ({
          name: item.gender,
          value: safeNumber(item.total),
        })),
      },

      teachers,

      staffs,

      classes,

      rewards,

      disciplines,

      organizations,
    };

    // =================================================
    // LOG FINAL
    // =================================================

    console.log("\n");
    console.log("=====================================================");
    console.log("✅ MANAGEMENT DASHBOARD SUCCESS");
    console.log("=====================================================");

    console.log("📊 OVERVIEW:");
    console.table(responseData.overview);

    console.log("📅 ATTENDANCE:");
    console.table(responseData.attendance);

    console.log("💰 TUITION:");
    console.table(responseData.tuition);

    console.log("🏢 ORGANIZATION:");
    console.table(responseData.organization);

    console.log("📈 STUDENT BY GRADE:");
    console.table(responseData.charts.studentByGrade);

    console.log("👨‍🏫 TEACHERS:", responseData.teachers.length);

    console.log("👨‍💼 STAFFS:", responseData.staffs.length);

    console.log("🏫 CLASSES:", responseData.classes.length);

    console.log("🏆 REWARDS:", responseData.rewards.length);

    console.log("⚠️ DISCIPLINES:", responseData.disciplines.length);

    console.log("🏢 ORGANIZATIONS:", responseData.organizations.length);

    console.log("=====================================================");
    console.log("\n");

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Lấy dữ liệu quản lý Ban Giám Hiệu thành công",

      data: responseData,
    });
  } catch (error) {
    // =================================================
    // FULL ERROR LOG
    // =================================================

    console.error("\n");
    console.error("=====================================================");
    console.error("❌ GET MANAGEMENT DASHBOARD ERROR");
    console.error("=====================================================");

    console.error("📌 Message:", error.message);

    console.error("📌 Name:", error.name);

    console.error("📌 Code:", error.code);

    console.error("📌 Errno:", error.errno);

    console.error("📌 SQL State:", error.sqlState);

    console.error("📌 SQL Message:", error.sqlMessage);

    console.error("📌 SQL:", error.sql);

    console.error("📌 Stack:");
    console.error(error.stack);

    console.error("=====================================================");
    console.error("\n");

    return res.status(500).json({
      success: false,

      message: "Không thể lấy dữ liệu quản lý nhà trường",

      error: {
        message: error.message,
        name: error.name,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
      },
    });
  }
});

module.exports = router;
