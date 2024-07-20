const admin = require("firebase-admin");
const db = admin.firestore();
const bucket = admin.storage().bucket();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cron = require('node-cron');


const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

const signup = async (req, res) => {
    const { sponsorId, name, email } = req.body;
    const userId = req.user.uid || "test-user"

    try {
        const userDoc = db.collection('users').doc(userId);
        await userDoc.set({ userId, email, name, sponsorId, level: 1, income: 0 });
        res.status(201).send('User signed up successfully');
    } catch (err) {
        res.status(500).send({ error: 'Error signing up user' });
    }
}

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

// Function to handle package purchase
const buyPackage = async (req, res) => {
    try {
        const userId = req.user?.uid || "test-user";
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
            status: 'pending', // To be activated by the admin
            createdAt: new Date().toISOString(),
            roiAccumulated: 0, // Track accumulated ROI for the first 20 days
            roiUpdatedDays: 0, // Track the total number of days ROI updates have been made
            walletUpdated: false, // Track if the wallet has been updated after 30 days
            startDate: null // Track when the package is activated
        };

        // Save the new purchase request to Firestore
        await db.collection('purchases').doc(purchaseId).set(newPurchase);

        // Notify admin (this is a placeholder, replace with actual notification logic)
        console.log('Notify admin about the new purchase');

        res.status(201).send({ message: 'Package purchase request created successfully', purchase: newPurchase });
    } catch (error) {
        res.status(500).send({ message: 'Error creating purchase request', error: error.message });
    }
};

// Function to update daily ROI
const updateDailyROI = async () => {
    const userId = "test-user"
    const purchasesSnapshot = await db.collection('purchases').where('status', '==', 'active').get();

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

        if (!userId || !amount || amount <= 0) {
            return res.status(400).send('Invalid amount');
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
        const userId = req.user?.uid || "test-user"; // Ensure you handle authentication properly
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
        const { topic, status, ticketNo } = req.body;
        const ticketImage = req.file;
        // console.log("object11", req.file)
        // console.log("object12", req.body)
        if (!topic || !status || !ticketNo) {
            return res.status(400).send('Missing required fields');
        }

        const ticketId = db.collection('tickets').doc().id;

        let imageUrl = '';
        if (ticketImage) {
            imageUrl = await uploadImage(ticketImage);
        }

        const newTicket = {
            id: ticketId,
            userId,
            topic,
            status,
            ticketNo,
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


module.exports = { upload, getDashboard, createDashboard, getTransactions, createTicket, buyPackage, withdrawAmount, getPurchaseStatus, getTickets, signup, partnerList, allTransactions, filterTransactions };
