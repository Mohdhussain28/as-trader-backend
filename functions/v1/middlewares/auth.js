const admin = require("firebase-admin");
const functions = require("firebase-functions");

module.exports = async (req, res, next) => {
    let token = null;
    // const hasAuthHeaders = !!(
    //     req.headers.authorization &&
    //     req.headers.authorization.startsWith("Bearer ")
    // );

    if (req?.headers?.authorization) token = req.headers.authorization;
    else if (!token && req.cookies) token = req.cookies.__session;
    else
        return res
            .status(401)
            .send({ success: false, error: "Unauthorized Request - 1" });

    try {
        req.user = await admin.auth().verifyIdToken(token);
        return next();
    } catch (error) {
        functions.logger.error(error);
        return res.status(401).send({
            success: false,
            message: "Not Authorized, Couldn't verify user token",
            error: error,
        });
    }
};
