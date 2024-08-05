const express = require("express");
const router = express.Router()
const { upload, getDashboard, createDashboard, createTicket, buyPackage, getPurchaseStatus, getTickets, partnerList, allTransactions, filterTransactions, uploadFiles, withdrawAmount, getTransactions, roitest, updateProfile, generateReferralLink, authVerifier, getUserDetail, getPackages, transferAmount, updateAccountDetails, getAccountDetails, getWithdrawals, getTransferAmount } = require("../controller/userController");

router.route("/get-dashboard").get(getDashboard)
router.route("/create-dashboard").post(createDashboard)
router.route("/get-purchase-status").get(getPurchaseStatus);

router.route("/get-package").get(getPackages)
router.post("/buy-package", upload.single('file'), buyPackage);
router.route("/withdraw").post(withdrawAmount)
router.route("/get-withdrawls").get(getWithdrawals)

router.post("/create-ticket", upload.single('file'), createTicket)
router.route("/get-tickets").get(getTickets);

// router.route("/signup").post(signUpUser);
router.route("/partner-list").get(partnerList)

router.route("/transactions").get(getTransactions);
router.route("/transactions/filter").get(filterTransactions)

router.route("/triggerROIUpdate").post(roitest)
router.post('/update-profile', upload.single('profile_image'), updateProfile);

router.route("/generatereferrallink").get(generateReferralLink)
router.route("/verify-auth").get(authVerifier)

router.route("/user-detail").get(getUserDetail)

router.route("/transfer-amount").post(transferAmount)
router.route("/get-transferAmount").get(getTransferAmount)

router.route("/account-details").post(updateAccountDetails)
router.route("/account-details").get(getAccountDetails)

// router.route("/generateReferralCodes").post(generateReferralCodes)
// router.route("/initializeReferralCodes").post(initializeReferralCodesForAllUsers)

module.exports = router;