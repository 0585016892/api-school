require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/classes", require("./routes/classes"));
app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/scores", require("./routes/scores"));
app.use("/api/tuition", require("./routes/tuition"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/organizations", require("./routes/organizationRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/management", require("./routes/managementRoutes"));
app.use("/api/departments", require("./routes/departmentRoutes"));
app.use("/api/unions", require("./routes/unionRoutes"));
app.use("/api/school-councils", require("./routes/schoolCouncilRoutes"));
app.use("/api/parents", require("./routes/parentsRoutes"));
app.use("/api/rewards", require("./routes/rewardsRoutes"));
app.use("/api/disciplines", require("./routes/disciplines"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/meetings", require("./routes/meetings"));

app.listen(process.env.PORT, () => {
  console.log(`Server running ${process.env.PORT}`);
});
