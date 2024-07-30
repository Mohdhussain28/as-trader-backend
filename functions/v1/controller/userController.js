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

const getUserDetail = async (req, res) => {
    const userId = req.user?.uid;

    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) {
            res.status(404).send('User not found');
        } else {
            res.status(200).json(doc.data());
        }
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).send('Internal Server Error');
    }
}


const generateReferralCode = async (userId) => {
    const prefix = "AS";
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
    const referralCode = `${prefix}${randomDigits}`;

    await db.collection('referralCodes').doc(referralCode).set({ userId, used: false, sponsorId: referralCode });

    return referralCode;
};

const generateReferralLink = async (req, res) => {
    try {
        const userId = req.user?.uid;
        const sponsorId = await getSponsorId(userId);

        if (!sponsorId) {
            return res.status(404).send({ message: 'Sponsor ID not found' });
        }

        res.status(200).send(sponsorId);
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving sponsor ID', error: error.message });
    }
};

const getSponsorId = async (userId) => {
    const userRef = db.collection('referralCodes').where("userId", "==", userId);
    const userSnapshot = await userRef.get();

    if (userSnapshot.empty) {
        throw new Error('User does not exist');
    }

    let sponsorId;
    userSnapshot.forEach(doc => {
        const userData = doc.data();
        sponsorId = userData.sponsorId;
    });

    return sponsorId;
};


// // API endpoint to get sponsorId of a user
// router.get('/api/user/:userId/sponsorId', async (req, res) => {
//     try {
//         const userId = req.params.userId;
//         const sponsorId = await getSponsorId(userId);

//         if (!sponsorId) {
//             return res.status(404).send({ message: 'Sponsor ID not found' });
//         }

//         res.status(200).send({ sponsorId });
//     } catch (error) {
//         res.status(500).send({ message: 'Error retrieving sponsor ID', error: error.message });
//     }
// });

const validateReferralCode = async (referralCode) => {
    const referralDoc = await db.collection('referralCodes').doc(referralCode).get();
    return referralDoc.exists;
};


const deleteReferralCode = async (referralCode) => {
    await db.collection('referralCodes').doc(referralCode).delete();
};

const authVerifier = async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(400).send('Authorization header is missing');
    }

    const token = authHeader;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        res.status(200).json({
            uid: decodedToken.uid,
            email: decodedToken.email,
        });
    } catch (error) {
        res.status(401).send('Invalid or expired token');
    }
}


const updateProfile = async (req, res) => {
    const { fullName, email, mobile, address, city, state, country } = req.body;
    const userId = req.user?.uid;

    try {
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

        const userDoc = db.collection('users').doc(userId);
        const doc = await userDoc.get();

        if (doc.exists) {
            await userDoc.update({
                fullName: fullName || doc.data().fullName,
                email: email || doc.data().email,
                mobile: mobile || doc.data().mobile,
                address: address || doc.data().address,
                city: city || doc.data().city,
                state: state || doc.data().state,
                country: country || doc.data().country,
                profileImage: imageUrl || doc.data().profileImage
            });
        } else {
            await userDoc.set({
                fullName,
                email,
                mobile,
                address,
                city,
                state,
                country,
                profileImage: imageUrl || null
            });
        }

        res.status(200).send('User profile updated successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Error updating user profile' });
    }
};


const getReferredUsers = async (sponsorId) => {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('referredBy', '==', sponsorId).get();

    if (snapshot.empty) {
        return [];
    }

    let referredUsers = [];
    snapshot.forEach(doc => {
        referredUsers.push({ id: doc.id, ...doc.data() });
    });

    return referredUsers;
};

const partnerList = async (req, res) => {
    try {
        const sponsorId = req.query.sponsorId;
        const referredUsers = await getReferredUsers(sponsorId);

        if (referredUsers.length === 0) {
            return res.status(404).send({ message: 'No referred users found' });
        }

        res.status(200).send(referredUsers);
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving referred users', error: error.message });
    }
}

const getDashboard = async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(400).send('User ID is required');
        }

        const doc = await db.collection('users').doc(userId).collection('dashboard').doc('current').get();

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
        const userId = req.user?.uid;
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
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) return;

        const userData = userDoc.data();
        const referredBy = userData.referredBy;

        if (referredBy) {
            const firstLevelBonus = amount * 0.05;

            await db.runTransaction(async (transaction) => {
                const firstReferrerSnapshot = await db.collection('users').where('asTraderId', '==', referredBy).get();

                if (firstReferrerSnapshot.empty) throw new Error('First referrer does not exist');

                const firstReferrerDoc = firstReferrerSnapshot.docs[0];
                const firstReferrerData = firstReferrerDoc.data();
                const firstDashboardRef = firstReferrerDoc.ref.collection('dashboard').doc('current');
                const firstDashboardDoc = await transaction.get(firstDashboardRef);

                if (!firstDashboardDoc.exists) throw new Error('First referrer dashboard does not exist');

                const firstDashboardData = firstDashboardDoc.data();
                const newLevelIncome = (firstDashboardData.levelIncome || 0) + firstLevelBonus;
                transaction.update(firstDashboardRef, { levelIncome: newLevelIncome });

                const secondReferredBy = firstReferrerData.referredBy;
                if (secondReferredBy) {
                    const secondLevelBonus = amount * 0.03;

                    const secondReferrerSnapshot = await db.collection('users').where('asTraderId', '==', secondReferredBy).get();

                    if (secondReferrerSnapshot.empty) throw new Error('Second referrer does not exist');

                    const secondReferrerDoc = secondReferrerSnapshot.docs[0];
                    const secondReferrerData = secondReferrerDoc.data();
                    const secondDashboardRef = secondReferrerDoc.ref.collection('dashboard').doc('current');
                    const secondDashboardDoc = await transaction.get(secondDashboardRef);

                    if (!secondDashboardDoc.exists) throw new Error('Second referrer dashboard does not exist');

                    const secondDashboardData = secondDashboardDoc.data();
                    const newSecondLevelIncome = (secondDashboardData.levelIncome || 0) + secondLevelBonus;
                    transaction.update(secondDashboardRef, { levelIncome: newSecondLevelIncome });

                    const thirdReferredBy = secondReferrerData.referredBy;
                    if (thirdReferredBy) {
                        const thirdLevelBonus = amount * 0.01;

                        const thirdReferrerSnapshot = await db.collection('users').where('asTraderId', '==', thirdReferredBy).get();

                        if (thirdReferrerSnapshot.empty) throw new Error('Third referrer does not exist');

                        const thirdReferrerDoc = thirdReferrerSnapshot.docs[0];
                        const thirdReferrerData = thirdReferrerDoc.data();
                        const thirdDashboardRef = thirdReferrerDoc.ref.collection('dashboard').doc('current');
                        const thirdDashboardDoc = await transaction.get(thirdDashboardRef);

                        if (!thirdDashboardDoc.exists) throw new Error('Third referrer dashboard does not exist');

                        const thirdDashboardData = thirdDashboardDoc.data();
                        const newThirdLevelIncome = (thirdDashboardData.levelIncome || 0) + thirdLevelBonus;
                        transaction.update(thirdDashboardRef, { levelIncome: newThirdLevelIncome });
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error calculating referral bonus:', error.message);
    }
};


const getPackages = async (req, res) => {
    try {
        const packagesSnapshot = await db.collection('packages').get();
        const packages = [];

        packagesSnapshot.forEach(doc => {
            packages.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).send(packages);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching packages', error: error.message });
    }
};



const buyPackage = async (req, res) => {
    try {
        const userId = req.user?.uid || "test-user";
        const { packageName, amount, dailyIncome, totalRevenue, duration } = req.body;
        const file = req.file;

        if (!userId || !packageName || amount === undefined || dailyIncome === undefined || totalRevenue === undefined || duration === undefined) {
            return res.status(400).send('Missing required fields');
        }

        const purchaseId = uuidv4();
        const paymentImageUrl = await uploadImage(file);

        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).send('User not found');
        }

        const email = userDoc.data().email;

        const newPurchase = {
            id: purchaseId,
            userId,
            packageName,
            amount: Number(amount),
            dailyIncome: Number(dailyIncome),
            duration: Number(duration),
            totalRevenue: Number(totalRevenue),
            email,
            status: 'pending',
            createdAt: new Date().toISOString(),
            roiAccumulated: 0,
            roiUpdatedDays: 0,
            walletUpdated: false,
            startDate: null,
            paymentImageUrl
        };

        await db.collection('purchases').doc(purchaseId).set(newPurchase);

        await calculateReferralBonus(userId, Number(amount));

        console.log('Notify admin about the new purchase');

        res.status(201).send({ message: 'Package purchase request created successfully', purchase: newPurchase });
    } catch (error) {
        res.status(500).send({ message: 'Error creating purchase request', error: error.message });
    }
};



const withdrawAmount = async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { amount } = req.body;

        if (!userId || !amount || amount <= 0 || amount < 500) {
            return res.status(400).send('Invalid amount, minimum withdrawal is 500');
        }

        // Get the user's current wallet balance
        const userDoc = await db.collection('users').doc(userId).collection('dashboard').doc('current').get();

        if (!userDoc.exists) {
            return res.status(404).send('User not found');
        }

        const userData = userDoc.data();
        const walletBalance = userData.walletBalance || 0;

        if (amount > walletBalance) {
            return res.status(400).send('Insufficient balance');
        }

        const withdrawalId = uuidv4();

        const newWithdrawal = {
            id: withdrawalId,
            userId,
            amount,
            walletBalance,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        await db.collection('withdrawals').doc(withdrawalId).set(newWithdrawal);

        console.log('Notify admin about the new withdrawal');

        res.status(201).send({ message: 'Withdrawal request created successfully', withdrawal: newWithdrawal });
    } catch (error) {
        res.status(500).send({ message: 'Error creating withdrawal request', error: error.message });
    }
};


const getTransactions = async (req, res) => {
    try {
        const userId = req.user?.uid;
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
                if (operation === 'o2' && transaction.amount) return true;
                if (operation === 'o3' && transaction.operation === 'deposit') return true;
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
        const userId = req.user?.uid;

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
        const userId = req.user?.uid || "test-user";
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
        const userId = req.user?.uid;
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
    const userId = req.user?.uid;
    try {
        const snapshot = await db.collection('transactions').where('userId', '==', userId).get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(transactions);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

const filterTransactions = async (req, res) => {
    const userId = req.user?.uid;
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
    updateProfile,
    roitest,
    getDashboard,
    createDashboard,
    getTransactions,
    createTicket,
    getPackages,
    buyPackage,
    withdrawAmount,
    getPurchaseStatus,
    getTickets,
    partnerList,
    allTransactions,
    filterTransactions,
    generateReferralLink,
    authVerifier,
    getUserDetail,
    generateReferralCode,
    validateReferralCode
};
