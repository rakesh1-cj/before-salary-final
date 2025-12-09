import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import firebaseAdmin from "./firebaseAdmin.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

// protected example: check session cookie
app.get("/api/private", async (req, res) => {
  try {
    const sessionCookie = req.cookies.session || "";
    const decodedClaims = await firebaseAdmin.auth().verifySessionCookie(sessionCookie, true);
    res.json({ ok: true, uid: decodedClaims.uid });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.listen(5000, () => console.log("Server on 5000"));
