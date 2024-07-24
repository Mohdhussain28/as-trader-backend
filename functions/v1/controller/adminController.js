const admin = require("firebase-admin");
const db = admin.firestore();
const bucket = admin.storage().bucket();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

const approvePurchase = async (req, res) => {
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


module.exports = { upload, approvePurchase };