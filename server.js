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

app.listen(process.env.PORT, () => {
  console.log(`Server running ${process.env.PORT}`);
});
