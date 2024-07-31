const express = require("express");
const router = express.Router()
const { upload, approvePurchase, checkPurchases, checkWithdrawals, usersList, downloadImage, getTickets, updateTicketStatus, createPackage, deletePackage, getAllPackages, getPackage, updatePackage, updateWithdrawlStatus, adminSignUp, checkAdmin, serachUser } = require("../controller/adminController");

router.route("/admin-sign-up").post(adminSignUp)
router.route("/admin-verifier").get(checkAdmin)
router.route("/approve-purchase").post(approvePurchase);
router.route("/check-purchase").get(checkPurchases)
router.route("/searchUser").get(serachUser)

router.route("/check-withdrawl").get(checkWithdrawals)
router.route("/withdrawals/:id/:status").patch(updateWithdrawlStatus)

router.route("/user-detail").get(usersList)

router.route("/ticket-download/:ticketId").get(downloadImage)
router.route("/ticket-details").get(getTickets)
router.route("/tickets/:ticketId/:status").patch(updateTicketStatus)

router.route("/create-package").post(createPackage)
router.route("/delete-package/:packageId").delete(deletePackage)
router.route("/all-package").get(getAllPackages)
router.route("/single-package/:packageId").get(getPackage)
router.route("/update-package/:packageId").put(updatePackage)

module.exports = router
