// Firebase SDK
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Third Party Libraries
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cron = require('node-cron');

// Middlewares
const authMiddleware = require("./middlewares/auth");
const { validateReferralCode, generateReferralCode } = require("./controller/userController");

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.json());

const db = admin.firestore();

app.post("/signup", async (req, res) => {
    try {
        const { email, password, sponsorId, fullName } = req.body;
        if (!email || !password || !sponsorId) {
            return res.status(400).send('Missing required fields');
        }

        const isValidReferral = await validateReferralCode(sponsorId);
        if (!isValidReferral) {
            return res.status(400).send('Invalid sponsor ID');
        }
        const userRecord = await admin.auth().createUser({
            email,
            password,
        });
        const userId = userRecord.uid;
        const asTraderId = await generateReferralCode(userId);
        const newUser = {
            email,
            fullName,
            referredBy: sponsorId,
            levelIncome: 0,
            level: 1,
            walletBalance: 0,
            userId,
            asTraderId,
            createdAt: new Date().toISOString(),
        };

        await db.collection('users').doc(userId).set(newUser);

        const dashboardData = {
            awardReward: 0,
            directMembers: 0,
            levelIncome: 0,
            level: 1,
            roi: 0,
            roiWallet: 0,
            totalDownline: 0,
            totalIncome: 0,
            walletBalance: 0
        };

        await db.collection('users').doc(userId).collection('dashboard').doc('current').set(dashboardData);



        res.status(201).send({ message: 'User signed up successfully', user: newUser, referralCode: asTraderId });
    } catch (error) {
        res.status(500).send({ message: 'Error signing up user', error: error.message });
    }
});




async function updateDailyROI() {
    const purchasesSnapshot = await db.collection('purchases')
        .where('status', '==', 'active')
        .get();

    purchasesSnapshot.forEach(async (doc) => {
        const purchase = doc.data();

        if (purchase.roiUpdatedDays < 500) {
            const currentDate = new Date();
            const currentDay = currentDate.getDay();

            if (currentDay !== 0) {
                const dailyROI = purchase.dailyIncome;

                const updatedDays = purchase.roiUpdatedDays + 1;
                const updatedROI = purchase.roiAccumulated + dailyROI;

                await db.collection('purchases').doc(doc.id).update({
                    roiAccumulated: updatedROI,
                    roiUpdatedDays: updatedDays
                });

                if (updatedDays % 30 === 0 && !purchase.roiWalletUpdated) {
                    const userRef = db.collection('users').doc(purchase.userId);
                    await db.runTransaction(async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists) {
                            throw new Error('User does not exist');
                        }

                        const dashboardRef = userRef.collection('dashboard').doc('current');
                        const dashboardDoc = await transaction.get(dashboardRef);

                        if (!dashboardDoc.exists) {
                            throw new Error('Dashboard document does not exist');
                        }

                        const currentROIWallet = dashboardDoc.data().roiWallet || 0;
                        const newROIWallet = currentROIWallet + updatedROI;
                        transaction.update(dashboardRef, { roiWallet: newROIWallet });

                        transaction.update(db.collection('purchases').doc(doc.id), { roiWalletUpdated: true });
                    });
                }

                if (updatedDays === 500) {
                    await db.collection('purchases').doc(doc.id).update({ status: 'completed' });
                }
            }
        }
    });
}



// Schedule the cron job to run daily at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Running daily ROI update');
    updateDailyROI().catch(console.error);
});

//for every minute to test
// cron.schedule('* * * * *', () => {
//     console.log('Running daily ROI update');
//     updateDailyROI().catch(console.error);
// });
app.use("/admin", require('./routes/adminRoute'))


app.use(authMiddleware);

app.use("/user", require('./routes/userRoute'))

app.get("/test", async (req, res) => {
    res.status(200).send("hiiiiii")
});

app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).send(err.message || "Unexpected error!");
});

// module.exports = functions.https.onRequest(app);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
