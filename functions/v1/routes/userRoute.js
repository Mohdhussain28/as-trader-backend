const express = require("express");
const router = express.Router()
const { upload, getDashboard, createDashboard, createTicket, buyPackage, getPurchaseStatus, getTickets, signUpUser, partnerList, allTransactions, filterTransactions, uploadFiles, withdrawAmount, getTransactions, roitest, updateProfile, generateReferralCodes, initializeReferralCodesForAllUsers } = require("../controller/userController");

router.route("/get-dashboard").get(getDashboard)
router.route("/create-dashboard").post(createDashboard)
router.route("/get-purchase-status").get(getPurchaseStatus);

router.route("/buy-package").post(buyPackage);
router.route("/withdraw").post(withdrawAmount)

router.post("/create-ticket", upload.single('file'), createTicket)
router.route("/get-tickets").get(getTickets);

router.route("/signup").post(signUpUser);
router.route("/partner-list").get(partnerList)

router.route("/transactions").get(getTransactions);
router.route("/transactions/filter").get(filterTransactions)

router.route("/triggerROIUpdate").post(roitest)
router.post('/update-profile', upload.single('profile_image'), updateProfile);

router.route("/generateReferralCodes").post(generateReferralCodes)
router.route("/initializeReferralCodes").post(initializeReferralCodesForAllUsers)

module.exports = router;