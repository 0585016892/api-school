const db = require("./config/db");

// ================= DATA =================
const lastNames = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Huỳnh",
  "Vũ",
  "Võ",
  "Đặng",
  "Bùi",
];

const middleNames = [
  "Văn",
  "Thị",
  "Minh",
  "Hữu",
  "Quang",
  "Ngọc",
  "Thanh",
  "Đức",
  "Gia",
  "Phúc",
];

const firstNames = [
  "An",
  "Bình",
  "Cường",
  "Dũng",
  "Huy",
  "Khoa",
  "Long",
  "Nam",
  "Phúc",
  "Tài",
  "Tuấn",
  "Hưng",
  "Khánh",
  "Phong",
  "Quân",
  "Sơn",
  "Thắng",
  "Trung",
  "Vũ",
  "Duy",
];

// ================= RANDOM =================
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateName = () => {
  return `${rand(lastNames)} ${rand(middleNames)} ${rand(firstNames)}`;
};

// ================= MAIN =================
const run = async () => {
  const values = [];
  const usedNames = new Set();

  let studentIndex = 1;

  for (let classId = 4; classId <= 13; classId++) {
    for (let i = 0; i < 20; i++) {
      let name = generateName();

      // đảm bảo không trùng tên
      while (usedNames.has(name)) {
        name = generateName();
      }

      usedNames.add(name);

      const studentCode = `SV${classId}${String(i + 1).padStart(3, "0")}`;

      values.push([
        studentCode,
        name,
        Math.random() > 0.5 ? "Nam" : "Nữ",
        "2005-01-01",
        `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        `${studentCode.toLowerCase()}@gmail.com`,
        "Hà Nội",
        classId,
        null,
      ]);

      studentIndex++;
    }
  }

  const sql = `
    INSERT INTO students
    (student_code, full_name, gender, birthday, phone, email, address, class_id, avatar)
    VALUES ?
  `;

  try {
    const [result] = await db.query(sql, [values]);
    console.log("✅ Insert success:", result.affectedRows);
  } catch (err) {
    console.log("❌ Error:", err);
  }
};

run();
