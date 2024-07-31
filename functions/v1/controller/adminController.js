const admin = require("firebase-admin");
const db = admin.firestore();
const bucket = admin.storage().bucket();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { generateReferralCode } = require("./userController");

const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

const checkAdmin = async (req, res, next) => {
    try {
        const idToken = req.headers.authorization

        if (!idToken) {
            return res.status(401).send('Unauthorized');
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const adminRef = db.collection('admins').doc(decodedToken.uid);
        const adminDoc = await adminRef.get();

        if (!adminDoc.exists) {
            return res.status(403).send('Forbidden');
        }
        res.status(200).json({
            uid: decodedToken.uid,
            email: decodedToken.email,
        });
    } catch (error) {
        res.status(401).send({ message: 'Unauthorized', error: error.message });
    }
};

const adminSignUp = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        // Create a new Firebase user
        const userRecord = await admin.auth().createUser({
            email,
            password
        });
        const sponsorId = await generateReferralCode(userRecord.uid)
        // Add the user to the 'admins' collection
        const adminRef = db.collection('admins').doc(userRecord.uid);
        await adminRef.set({
            email: userRecord.email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            sponsorId
        });

        res.status(201).send({ message: 'Admin signed up successfully', uid: userRecord.uid });
    } catch (error) {
        res.status(500).send({ message: 'Error signing up admin', error: error.message });
    }
};
const approvePurchase = async (req, res) => {
    try {
        const { purchaseId, status } = req.body;
        if (!purchaseId || !status) {
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
            status: status,
            startDate: new Date().toISOString()
        });

        res.status(200).send({ message: 'Package activated successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error activating package', error: error.message });
    }
};


const checkPurchases = async (req, res) => {
    try {
        // Check if admin is authenticated and authorized
        // const adminId = req.user?.uid;
        // const isAdmin = await checkAdmin(adminId);

        // if (!isAdmin) {
        //     return res.status(403).send('Unauthorized access');
        // }

        const purchasesRef = db.collection('purchases').orderBy('createdAt', 'desc');
        const purchasesSnapshot = await purchasesRef.get();

        if (purchasesSnapshot.empty) {
            return res.status(404).send('No purchases found');
        }

        const purchases = [];
        purchasesSnapshot.forEach(doc => {
            purchases.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).send({ message: 'Purchases retrieved successfully', purchases });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving purchases', error: error.message });
    }
};



const checkWithdrawals = async (req, res) => {
    try {
        // const adminId = req.user?.uid;
        // const isAdmin = await checkAdmin(adminId);

        // if (!isAdmin) {
        //     return res.status(403).send('Unauthorized access');
        // }

        const withdrawalsRef = db.collection('withdrawals').orderBy('createdAt', 'desc');
        const withdrawalsSnapshot = await withdrawalsRef.get();

        if (withdrawalsSnapshot.empty) {
            return res.status(404).send('No withdrawals found');
        }

        const withdrawals = [];
        withdrawalsSnapshot.forEach(doc => {
            withdrawals.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).send({ message: 'Withdrawals retrieved successfully', withdrawals });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving withdrawals', error: error.message });
    }
};

const usersList = async (req, res) => {
    try {
        // const adminId = req.user?.uid;
        // const isAdmin = await checkAdmin(adminId);

        // if (!isAdmin) {
        //     return res.status(403).send('Unauthorized access');
        // }

        const usersRef = db.collection('users').orderBy('createdAt', 'desc');
        const usersSnapshot = await usersRef.get();

        if (usersSnapshot.empty) {
            return res.status(404).send('No users found');
        }

        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).send({ message: 'Users retrieved successfully', users });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving users', error: error.message });
    }
};

const updateWithdrawlStatus = async (req, res) => {
    try {
        const { id, status } = req.params;

        // Validate status
        if (!['Accepted', 'Removed'].includes(status)) {
            return res.status(400).send('Invalid status');
        }

        const withdrawalRef = db.collection('withdrawals').doc(id);

        // Start a transaction
        await db.runTransaction(async (transaction) => {
            const withdrawalDoc = await transaction.get(withdrawalRef);

            if (!withdrawalDoc.exists) {
                throw new Error('Withdrawal not found');
            }

            const withdrawalData = withdrawalDoc.data();

            // Update the withdrawal status
            transaction.update(withdrawalRef, { status });

            if (status === 'Accepted') {
                const userId = withdrawalData.userId;
                const amount = withdrawalData.amount;
                const dashboardRef = db.collection('user').doc(userId).collection('dashboard').doc('current');

                const dashboardDoc = await transaction.get(dashboardRef);

                if (!dashboardDoc.exists) {
                    throw new Error('User dashboard not found');
                }

                const dashboardData = dashboardDoc.data();
                const newWalletBalance = dashboardData.walletBalance - amount;

                // Update the wallet balance
                transaction.update(dashboardRef, { walletBalance: newWalletBalance });
            }
        });

        res.status(200).send({ message: 'Withdrawal status updated successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error updating withdrawal status', error: error.message });
    }
}


const getTickets = async (req, res) => {
    try {
        // const adminId = req.user?.uid;
        // const isAdmin = await checkAdmin(adminId);

        // if (!isAdmin) {
        //     return res.status(403).send('Unauthorized access');
        // }

        const ticketsRef = db.collection('tickets').orderBy('dateAndTime', 'desc');
        const ticketsSnapshot = await ticketsRef.get();

        if (ticketsSnapshot.empty) {
            return res.status(404).send('No tickets found');
        }

        const tickets = [];
        ticketsSnapshot.forEach(doc => {
            tickets.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).send({ message: 'Tickets retrieved successfully', tickets });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving tickets', error: error.message });
    }
};

const downloadImage = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticketRef = db.collection('tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).send('Ticket not found');
        }

        const ticketData = ticketDoc.data();
        const imageUrl = ticketData.imageUrl;

        // Assuming imageUrl is a publicly accessible URL
        res.redirect(imageUrl);
    } catch (error) {
        res.status(500).send({ message: 'Error downloading image', error: error.message });
    }
};
const updateTicketStatus = async (req, res) => {
    try {
        // Check if admin is authenticated and authorized
        // const adminId = req.user?.uid;
        // const isAdmin = await checkAdmin(adminId);

        // if (!isAdmin) {
        //     return res.status(403).send('Unauthorized access');
        // }

        const { ticketId } = req.params;
        const { status } = req.params;

        if (!status) {
            return res.status(400).send('Missing required field: status');
        }

        const ticketRef = db.collection('tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).send('Ticket not found');
        }

        await ticketRef.update({ status });

        res.status(200).send({ message: 'Ticket status updated successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error updating ticket status', error: error.message });
    }
};


const createPackage = async (req, res) => {
    try {
        const { packageName, amount, dailyIncome, totalRevenue, duration } = req.body;

        if (!packageName || !amount || !dailyIncome || !totalRevenue || !duration) {
            return res.status(400).send('Missing required fields');
        }

        const newPackage = {
            packageName,
            amount,
            dailyIncome,
            totalRevenue,
            duration,
            createdAt: new Date().toISOString()
        };

        const packageRef = db.collection('packages').doc();
        await packageRef.set(newPackage);

        res.status(201).send({ message: 'Package created successfully', package: { id: packageRef.id, ...newPackage } });
    } catch (error) {
        res.status(500).send({ message: 'Error creating package', error: error.message });
    }
};

// Delete a package from Firestore
const deletePackage = async (req, res) => {
    try {
        // console.log("object", req.params)
        const { packageId } = req.params;

        if (!packageId) {
            return res.status(400).send('Package ID is required');
        }

        await db.collection('packages').doc(packageId).delete();

        res.status(200).send({ message: 'Package deleted successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error deleting package', error: error.message });
    }
};

const getAllPackages = async (req, res) => {
    try {
        const snapshot = await db.collection('packages').get();
        const packages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        packages.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
        res.status(200).send({ packages });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving packages', error: error.message });
    }
};

const getPackage = async (req, res) => {
    try {
        const { packageId } = req.params;
        const doc = await db.collection('packages').doc(packageId).get();
        if (!doc.exists) {
            return res.status(404).send('Package not found');
        }
        res.status(200).send({ package: { id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving package', error: error.message });
    }
};

const updatePackage = async (req, res) => {
    try {
        const { packageId } = req.params;
        const { packageName, amount, dailyIncome, totalRevenue, duration } = req.body;

        if (!packageName || !amount || !dailyIncome || !totalRevenue || !duration) {
            return res.status(400).send('Missing required fields');
        }

        const updatedPackage = { packageName, amount, dailyIncome, totalRevenue, duration };
        await db.collection('packages').doc(packageId).update(updatedPackage);

        res.status(200).send({ message: 'Package updated successfully', package: { id: packageId, ...updatedPackage } });
    } catch (error) {
        res.status(500).send({ message: 'Error updating package', error: error.message });
    }
};

const serachUser = async (req, res) => {
    try {
        const { email, fullName, asTraderId } = req.query;

        if (!email && !fullName && !asTraderId) {
            return res.status(400).send('At least one search parameter must be provided');
        }

        let query = db.collection('users');

        if (email) {
            query = query.where('email', '==', email);
        } else if (fullName) {
            query = query.where('fullName', '==', fullName);
        } else if (asTraderId) {
            query = query.where('asTraderId', '==', asTraderId);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.status(404).send('No matching user found');
        }

        const users = [];
        snapshot.forEach(doc => {
            users.push(doc.data());
        });

        res.status(200).send({ message: 'Users retrieved successfully', users });
    } catch (error) {
        res.status(500).send({ message: 'Error searching for user', error: error.message });
    }
};
module.exports = { upload, serachUser, approvePurchase, checkPurchases, checkWithdrawals, updateWithdrawlStatus, usersList, getTickets, downloadImage, updateTicketStatus, deletePackage, createPackage, getAllPackages, getPackage, updatePackage, adminSignUp, checkAdmin };