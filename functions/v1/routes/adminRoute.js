const express = require("express");
const router = express.Router()
const { upload, approvePurchase } = require("../controller/adminController");

router.route("/approve-purchase").post(approvePurchase);




module.exports = router
