// ═══════════════════════════════════════════════════════════════════════
// Workley Cloud Functions - account-deletion cleanup.
//
// When an Auth user is deleted (either by the person themselves via the
// "Delete account" button, or by an admin from the Firebase console), this
// trigger purges their public profile + nested data + avatar. That removes
// them from the talent catalog, which reads users/{uid} where role=='talent'.
//
// This runs with Admin privileges, which is required because firestore.rules
// deliberately forbids a client from deleting its own users/{uid} doc
// (allow delete: if false). 1st-gen Auth triggers are used because Auth
// onDelete has no 2nd-gen equivalent.
// ═══════════════════════════════════════════════════════════════════════
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const SUBCOLLECTIONS = ["private_settings", "profile_views", "reviews", "portfolio_items"];

exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);

  // 1) Delete known subcollections under the user document.
  for (const sub of SUBCOLLECTIONS) {
    try {
      const snap = await userRef.collection(sub).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.warn(`[Workley] cleanup of ${sub} for ${uid} failed:`, e.message);
    }
  }

  // 2) Delete the public profile document itself (removes them from the catalog).
  try {
    await userRef.delete();
  } catch (e) {
    console.warn(`[Workley] profile doc delete for ${uid} failed:`, e.message);
  }

  // 3) Best-effort: remove their uploaded avatar / any files under their prefix.
  try {
    await admin.storage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  } catch (e) {
    console.warn(`[Workley] storage cleanup for ${uid} failed:`, e.message);
  }

  console.log(`[Workley] purged data for deleted user ${uid}`);
  return null;
});
