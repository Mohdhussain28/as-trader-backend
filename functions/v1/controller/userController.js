const admin = require("firebase-admin");
const db = admin.firestore();
const bucket = admin.storage().bucket();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cron = require('node-cron');

const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// const generateReferralCode = async () => {
//     let referralCode;
//     let codeExists = true;

//     while (codeExists) {
//         referralCode = uuidv4().split('-')[0];
//         const referralDoc = await db.collection('referrals').doc(referralCode).get();
//         codeExists = referralDoc.exists;
//     }

//     await db.collection('referrals').doc(referralCode).set({
//         createdAt: new Date().toISOString()
//     });

//     return referralCode;
// };

const generateReferralCode = async () => {
    const prefix = "AS";
    let unique = false;
    let referralCode;

    while (!unique) {
        const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString(); // Generates an 8-digit number
        referralCode = `${prefix}${randomDigits}`;

        // Check if the code already exists in the database
        const existingCodeSnapshot = await db.collection('referralCodes').doc(referralCode).get();
        if (!existingCodeSnapshot.exists) {
            unique = true;
        }
    }

    // Store the generated referral code in the referralCodes collection
    await db.collection('referralCodes').doc(referralCode).set({ used: false });

    return referralCode;
};
const generateReferralLink = async (req, res) => {
    try {
        const prefix = "AS";
        let unique = false;
        let referralCode;

        while (!unique) {
            const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString(); // Generates an 8-digit number
            referralCode = `${prefix}${randomDigits}`;

            // Check if the code already exists in the database
            const existingCodeSnapshot = await db.collection('referralCodes').doc(referralCode).get();
            if (!existingCodeSnapshot.exists) {
                unique = true;
            }
        }

        // Store the generated referral code in the referralCodes collection
        await db.collection('referralCodes').doc(referralCode).set({ used: false });

        // Return the referral link
        return res.status(201).send(`https://hyipland.com/sign-up/?ref=${referralCode}`)
    } catch (error) {
        res.status(500).send({ error: error.message })
    }
};

const validateReferralCode = async (referralCode) => {
    const referralDoc = await db.collection('referralCodes').doc(referralCode).get();
    return referralDoc.exists;
};

const deleteReferralCode = async (referralCode) => {
    await db.collection('referralCodes').doc(referralCode).delete();
};

const signUpUser = async (req, res) => {
    try {
        const { email, password, sponsorId } = req.body;

        if (!email || !password || !sponsorId) {
            return res.status(400).send('Missing required fields');
        }

        // Validate sponsorId
        const isValidReferral = await validateReferralCode(sponsorId);
        if (!isValidReferral) {
            return res.status(400).send('Invalid sponsor ID');
        }

        // Create a new user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email,
            password,
        });

        const userId = userRecord.uid;

        // Create a new user document in Firestore
        const newUser = {
            email,
            referredBy: sponsorId,
            levelIncome: 0,
            walletBalance: 0,
            createdAt: new Date().toISOString(),
        };

        await db.collection('users').doc(userId).set(newUser);

        // Delete used referral code
        await deleteReferralCode(sponsorId);

        // Generate a new referral code for the new user
        const newReferralCode = await generateReferralCode();

        res.status(201).send({ message: 'User signed up successfully', user: newUser, referralCode: newReferralCode });
    } catch (error) {
        res.status(500).send({ message: 'Error signing up user', error: error.message });
    }
};



const updateProfile = async (req, res) => {
    const { fullName, email, mobile, address, city, state, country } = req.body;
    const userId = "test-user"; // Replace with actual user ID retrieval logic

    try {
        // Handle profile image upload
        let imageUrl = null;
        if (req.file) {
            // console.log('File received:', req.file);
            const ext = path.extname(req.file.originalname);
            const fileName = `${uuidv4()}${ext}`;
            const file = bucket.file(fileName);

            await file.save(req.file.buffer, {
                metadata: { contentType: req.file.mimetype }
            });

            imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        }

        // Check if user document exists
        const userDoc = db.collection('users').doc(userId);
        const doc = await userDoc.get();

        if (doc.exists) {
            // Update existing user profile
            await userDoc.update({
                fullName: fullName || doc.data().fullName, // Preserve existing value if not provided
                email: email || doc.data().email,
                mobile: mobile || doc.data().mobile,
                address: address || doc.data().address,
                city: city || doc.data().city,
                state: state || doc.data().state,
                country: country || doc.data().country,
                profileImage: imageUrl || doc.data().profileImage // Preserve existing image URL if not provided
            });
        } else {
            // Create a new user profile
            await userDoc.set({
                fullName,
                email,
                mobile,
                address,
                city,
                state,
                country,
                profileImage: imageUrl || null // Set imageUrl if available, otherwise null
            });
        }

        res.status(200).send('User profile updated successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Error updating user profile' });
    }
};



const partnerList = async (req, res) => {
    const { sponsorId } = req.params;
    try {
        const referralsSnapshot = await db.collection('users').where('sponsorId', '==', sponsorId).get();
        const referrals = [];
        referralsSnapshot.forEach(doc => referrals.push(doc.data()));
        res.json(referrals);
    } catch (err) {
        res.status(500).send({ error: 'Error fetching referrals' });
    }
}

const getDashboard = async (req, res) => {
    try {
        const userId = "test-user";
        const doc = await db.collection('dashboard').doc(userId).get();
        if (!doc.exists) {
            return res.status(404).send('No data found');
        }
        res.status(200).send(doc.data());
    } catch (error) {
        res.status(500).send('Error getting data: ' + error.message);
    }
}

const createDashboard = async (req, res) => {
    try {
        const userId = "test-user";
        const data = req.body;
        await db.collection('dashboard').doc(userId).set(data, { merge: true });
        res.status(200).send('Data updated successfully');
    } catch (error) {
        res.status(500).send('Error updating data: ' + error.message);
    }
}

const sendNotification = async (title, message, topic) => {
    const payload = {
        notification: {
            title: title,
            body: message,
        }
    };

    try {
        const response = await admin.messaging().sendToTopic(topic, payload);
        console.log('Notification sent successfully:', response);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};
const roitest = async (req, res) => {
    try {
        await updateDailyROI();
        res.status(200).send('ROI Update Triggered');
    } catch (error) {
        res.status(500).send('Error Triggering ROI Update');
    }
};


const calculateReferralBonus = async (userId, amount) => {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) return;

    const userData = userDoc.data();
    const referredBy = userData.referredBy;

    if (referredBy) {
        const firstLevelBonus = amount * 0.05; // 5% bonus
        await db.runTransaction(async (transaction) => {
            const referrerDoc = await transaction.get(db.collection('users').doc(referredBy));
            if (!referrerDoc.exists) throw new Error('Referrer does not exist');

            const newLevelIncome = (referrerDoc.data().levelIncome || 0) + firstLevelBonus;
            transaction.update(db.collection('users').doc(referredBy), { levelIncome: newLevelIncome });
        });

        // Second level
        const firstReferrerDoc = await db.collection('users').doc(referredBy).get();
        const secondReferredBy = firstReferrerDoc.data().referredBy;

        if (secondReferredBy) {
            const secondLevelBonus = amount * 0.03; // 3% bonus
            await db.runTransaction(async (transaction) => {
                const secondReferrerDoc = await transaction.get(db.collection('users').doc(secondReferredBy));
                if (!secondReferrerDoc.exists) throw new Error('Second referrer does not exist');

                const newLevelIncome = (secondReferrerDoc.data().levelIncome || 0) + secondLevelBonus;
                transaction.update(db.collection('users').doc(secondReferredBy), { walletBalance: newLevelIncome });
            });

            // Third level
            const secondReferrerDoc = await db.collection('users').doc(secondReferredBy).get();
            const thirdReferredBy = secondReferrerDoc.data().referredBy;

            if (thirdReferredBy) {
                const thirdLevelBonus = amount * 0.01; // 1% bonus
                await db.runTransaction(async (transaction) => {
                    const thirdReferrerDoc = await transaction.get(db.collection('users').doc(thirdReferredBy));
                    if (!thirdReferrerDoc.exists) throw new Error('Third referrer does not exist');

                    const newLevelIncome = (thirdReferrerDoc.data().levelIncome || 0) + thirdLevelBonus;
                    transaction.update(db.collection('users').doc(thirdReferredBy), { levelIncome: newLevelIncome });
                });
            }
        }
    }
};

const buyPackage = async (req, res) => {
    try {
        const userId = req.user?.uid || "test-user-2";
        const { packageName, amount, dailyIncome, totalRevenue, duration } = req.body;

        if (!userId || !packageName || !amount || !dailyIncome || !totalRevenue || !duration) {
            return res.status(400).send('Missing required fields');
        }

        const purchaseId = uuidv4();

        const newPurchase = {
            id: purchaseId,
            userId,
            packageName,
            amount,
            dailyIncome,
            duration,
            totalRevenue,
            status: 'pending',
            createdAt: new Date().toISOString(),
            roiAccumulated: 0,
            roiUpdatedDays: 0,
            walletUpdated: false,
            startDate: null
        };

        // Save the new purchase request to Firestore
        await db.collection('purchases').doc(purchaseId).set(newPurchase);

        // Calculate referral bonuses
        await calculateReferralBonus(userId, amount);

        // Notify admin 
        console.log('Notify admin about the new purchase');

        res.status(201).send({ message: 'Package purchase request created successfully', purchase: newPurchase });
    } catch (error) {
        res.status(500).send({ message: 'Error creating purchase request', error: error.message });
    }
};

// Function to update daily ROI
const updateDailyROI = async () => {
    const purchasesSnapshot = await db.collection('purchases')
        .where('status', '==', 'active')
        .get();

    purchasesSnapshot.forEach(async (doc) => {
        const purchase = doc.data();

        if (purchase.roiUpdatedDays < 500) {
            // Calculate daily ROI
            const dailyROI = purchase.dailyIncome;

            // Update the purchase document with the total number of days ROI has been updated
            const updatedDays = purchase.roiUpdatedDays + 1;

            // Accumulate ROI only for the first 20 days
            let updatedROI = purchase.roiAccumulated;
            if (purchase.roiUpdatedDays < 20) {
                updatedROI += dailyROI;
            }

            await db.collection('purchases').doc(doc.id).update({
                roiAccumulated: updatedROI,
                roiUpdatedDays: updatedDays
            });

            // Update user's wallet balance if 30 days are completed and it has not been updated yet
            if (updatedDays === 30 && !purchase.walletUpdated) {
                const userRef = db.collection('users').doc(purchase.userId);
                await db.runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) {
                        throw new Error('User does not exist');
                    }

                    const newWalletBalance = (userDoc.data().walletBalance || 0) + updatedROI;
                    transaction.update(userRef, { walletBalance: newWalletBalance });

                    // Mark the wallet as updated
                    transaction.update(db.collection('purchases').doc(doc.id), { walletUpdated: true });
                });
            }

            // Mark the purchase as completed after 500 days
            if (updatedDays === 500) {
                await db.collection('purchases').doc(doc.id).update({ status: 'completed' });
            }
        }
    });
};


// Schedule the updateDailyROI function to run once every day at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Running daily ROI update');
    updateDailyROI().catch(console.error);
});

//for every minute to test
// cron.schedule('* * * * *', () => {
//     console.log('Running daily ROI update');
//     updateDailyROI().catch(console.error);
// });



// Function to activate the package (called by admin)
const activatePackage = async (req, res) => {
    try {
        const { purchaseId } = req.body;
        if (!purchaseId) {
            return res.status(400).send('Missing required fields');
        }

        const purchaseRef = db.collection('purchases').doc(purchaseId);
        const purchaseDoc = await purchaseRef.get();

        if (!purchaseDoc.exists) {
            return res.status(404).send('Purchase not found');
        }

        const purchase = purchaseDoc.data();
        if (purchase.status !== 'pending') {
            return res.status(400).send('Package is already activated or completed');
        }

        // Activate the package
        await purchaseRef.update({
            status: 'active',
            startDate: new Date().toISOString()
        });

        res.status(200).send({ message: 'Package activated successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error activating package', error: error.message });
    }
};


const withdrawAmount = async (req, res) => {
    try {
        const userId = req.user?.uid || "test-user";
        const { amount } = req.body;

        if (!userId || !amount || amount <= 0 || amount < 500) {
            return res.status(400).send('Invalid amount, minimum withdrawal is 500');
        }

        // Generate a new withdrawal ID
        const withdrawalId = uuidv4();

        const newWithdrawal = {
            id: withdrawalId,
            userId,
            amount,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        // Save the new withdrawal request to Firestore
        await db.collection('withdrawals').doc(withdrawalId).set(newWithdrawal);

        // Notify admin (this is a placeholder, replace with actual notification logic)
        console.log('Notify admin about the new withdrawal');

        res.status(201).send({ message: 'Withdrawal request created successfully', withdrawal: newWithdrawal });
    } catch (error) {
        res.status(500).send({ message: 'Error creating withdrawal request', error: error.message });
    }
};


const getTransactions = async (req, res) => {
    try {
        const userId = req.user?.uid || "test-user";
        const { dateFrom, dateTo, operation, status } = req.query;

        const filters = [];
        if (dateFrom) filters.push({ field: 'createdAt', operator: '>=', value: new Date(dateFrom).toISOString() });
        if (dateTo) filters.push({ field: 'createdAt', operator: '<=', value: new Date(dateTo).toISOString() });
        if (status) filters.push({ field: 'status', operator: '==', value: status });

        let withdrawalsQuery = db.collection('withdrawals').where('userId', '==', userId);
        let purchasesQuery = db.collection('purchases').where('userId', '==', userId);

        filters.forEach(filter => {
            withdrawalsQuery = withdrawalsQuery.where(filter.field, filter.operator, filter.value);
            purchasesQuery = purchasesQuery.where(filter.field, filter.operator, filter.value);
        });

        const [withdrawalsSnapshot, purchasesSnapshot] = await Promise.all([
            withdrawalsQuery.get(),
            purchasesQuery.get()
        ]);

        const withdrawals = withdrawalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const purchases = purchasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let transactions = [...withdrawals, ...purchases];

        if (operation && operation !== 'o1') {
            transactions = transactions.filter(transaction => {
                if (operation === 'o2' && transaction.amount) return true; // Withdraw funds
                if (operation === 'o3' && transaction.operation === 'deposit') return true; // Deposit funds
                return false;
            });
        }

        res.status(200).send({ transactions });
    } catch (error) {
        res.status(500).send({ message: 'Error fetching transactions', error: error.message });
    }
};

const getPurchaseStatus = async (req, res) => {
    try {
        const userId = req.query.userId || "test-user"

        if (!userId) {
            return res.status(400).send('Missing user ID');
        }

        const purchasesRef = db.collection('purchases').where('userId', '==', userId);
        const snapshot = await purchasesRef.get();

        if (snapshot.empty) {
            return res.status(404).send('No purchases found');
        }

        const purchases = [];
        snapshot.forEach(doc => {
            purchases.push(doc.data());
        });

        res.status(200).send({ purchases });
    } catch (error) {
        res.status(500).send({ message: 'Error getting purchase status', error: error.message });
    }
};

const uploadImage = (file) => {
    const blob = bucket.file(uuidv4() + path.extname(file.originalname));
    const blobStream = blob.createWriteStream({
        metadata: {
            contentType: file.mimetype,
            firebaseStorageDownloadTokens: uuidv4(),
            cacheControl: "public, max-age=31536000"
        },
        gzip: true
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
            console.error("Blob stream error:", err);
            reject(err);
        });

        blobStream.on('finish', async () => {
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            resolve(imageUrl);
        });

        blobStream.end(file.buffer);
    });
};

const createTicket = async (req, res) => {
    try {
        // console.log("Full Request Object:", req);
        const userId = "test-user";
        const { topic, status, ticketNo, message } = req.body;
        const file = req.file;
        // console.log("object11", req.file)
        // console.log("object12", req.body)
        if (!topic || !status || !ticketNo || !message) {
            return res.status(400).send('Missing required fields');
        }

        const ticketId = db.collection('tickets').doc().id;

        let imageUrl = '';
        if (file) {
            imageUrl = await uploadImage(file);
        }

        const newTicket = {
            id: ticketId,
            userId,
            topic,
            status,
            ticketNo,
            message,
            dateAndTime: new Date().toISOString(),
            imageUrl
        };

        await db.collection('tickets').doc(ticketId).set(newTicket);

        res.status(201).send({ message: 'Ticket created successfully', ticket: newTicket });
    } catch (error) {
        res.status(500).send({ message: 'Error creating ticket', error: error.message });
    }
}

const getTickets = async (req, res) => {
    try {
        const userId = "test-user";  // replace this with actual user ID from req if needed
        const ticketsSnapshot = await db.collection('tickets').where('userId', '==', userId).get();

        if (ticketsSnapshot.empty) {
            return res.status(404).send({ message: 'No tickets found' });
        }

        const tickets = [];
        ticketsSnapshot.forEach(doc => {
            tickets.push(doc.data());
        });

        res.status(200).send({ tickets });
    } catch (error) {
        res.status(500).send({ message: 'Error getting tickets', error: error.message });
    }
};


const allTransactions = async (req, res) => {
    const userId = "test-user";
    try {
        const snapshot = await db.collection('transactions').where('userId', '==', userId).get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(transactions);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

const filterTransactions = async (req, res) => {
    const userId = "test-user"
    const { dateFrom, dateTo, operation, status } = req.body;
    try {
        let query = db.collection('transactions').where('userId', '==', userId);

        if (dateFrom) {
            query = query.where('timestamp', '>=', new Date(dateFrom));
        }
        if (dateTo) {
            query = query.where('timestamp', '<=', new Date(dateTo));
        }
        if (operation && operation !== 'o1') {
            query = query.where('operation', '==', operation);
        }
        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query.get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(transactions);
    } catch (error) {
        res.status(500).send(error.message);
    }
}


module.exports =
{
    upload,
    signUpUser,
    updateProfile,
    roitest,
    getDashboard,
    createDashboard,
    getTransactions,
    createTicket,
    buyPackage,
    withdrawAmount,
    getPurchaseStatus,
    getTickets,
    partnerList,
    allTransactions,
    filterTransactions,
    generateReferralLink
};
