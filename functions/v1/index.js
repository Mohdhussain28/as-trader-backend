// Firebase SDK
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Third Party Libraries
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// Middlewares
const authMiddleware = require("./middlewares/auth");

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json()); // For parsing application/json
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.json());


// app.use(authMiddleware);
app.use("/user", require('./routes/userRoute'))

app.get("/test", async (req, res) => {
    res.status(200).send("hiiiii")
})

app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).send(err.message || "Unexpected error!");
});

module.exports = functions.https.onRequest(app);
// const PORT = process.env.PORT || 6000;

// app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });