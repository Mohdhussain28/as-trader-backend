const admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "gs://as-trader-dcb91.appspot.com"
});

module.exports = {
    v1: require("./v1"),
};
