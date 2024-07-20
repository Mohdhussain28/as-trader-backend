const express = require("express");
const router = express.Router()
const { upload, getDashboard, createDashboard, createTicket, buyPackage, getPurchaseStatus, getTickets, signup, partnerList, allTransactions, filterTransactions, uploadFiles, withdrawAmount, getTransactions } = require("../controller/userController");

router.route("/get-dashboard").get(getDashboard)
router.route("/create-dashboard").post(createDashboard)
router.route("/get-purchase-status").get(getPurchaseStatus);

router.route("/buy-package").post(buyPackage);
router.route("/withdraw").post(withdrawAmount)

router.post("/create-ticket", upload.single('ticketImage'), createTicket)
router.route("/get-tickets").get(getTickets);

router.route("/signup").post(signup);
router.route("/partner-list").get(partnerList)

router.route("/transactions").get(getTransactions);
router.route("/transactions/filter").get(filterTransactions)

module.exports = router;