require("dotenv").config();
const express = require("express");
const morgan = require("morgan"); 
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Deposit = require("./models/Deposit");
const Withdrawal = require("./models/Withdrawal");
const { Resend } = require("resend")

const resend = new Resend(process.env.RESEND_API_KEY)

const app = express();
const authMiddleware = require("./middleware/authMiddleware");

// ======== Email transporter ========

app.use(express.json());

// ======== Logging all requests ========
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} | Body:`, req.body);
  next();
});

app.use(express.json());
app.use(cors({
  origin: "https://nexshares-production.up.railway.app", // your live frontend
  credentials: true
}));

// ======== MongoDB connection ========
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Connection Error:", err));

app.use(express.static("public"));

// ======== Home page ========
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// ======== Start Server ========
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log("Server running on port " + PORT));

app.get("/", (req, res) => {
  res.send("NexShares API is running")
})

app.use(morgan("dev")); // Logs all requests in 'dev' format
app.use(express.json()); // Keep your JSON parser


/* REGISTER API — PROFESSIONAL VERSION WITH LOGGING */



app.post("/register", async (req, res) => {
  console.log("=== REGISTER ROUTE HIT ===")

  function generateReferralCode() {
    return "NX" + Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  try {

    const { username, email, password, referral } = req.body

    if (!username || !email || !password) {
      return res.json({ status: "error", message: "All fields are required" })
    }

    let existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.json({ status: "error", message: "User already exists" })
    }

    let referredBy = null

    if (referral) {
      let refUser = await User.findOne({ referralCode: referral })
      if (refUser) {
        referredBy = referral
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = new User({
      username,
      email,
      password: hashedPassword,
      verified: true,
      referralCode: generateReferralCode(),
      referredBy: referredBy,
      referralCommission: 0,
      referralCount: 0,
      balance: 0
    })

    await user.save()

    if (referredBy) {
      const refUser = await User.findOne({ referralCode: referredBy })
      if (refUser) {
        refUser.referralCount = (refUser.referralCount || 0) + 1
        await refUser.save()
      }
    }

    res.json({
      status: "success",
      message: "Registration successful"
    })

  } catch (err) {

    console.error("REGISTER ERROR:", err)

    res.json({
      status: "error",
      message: "Server error"
    })

  }
})




/* VERIFICATION ROUTE */

app.post("/verify", async (req,res)=>{

try{


console.log("===== VERIFY REQUEST START =====")
console.log("Request body:", req.body)

const { email, code } = req.body

if(!email || !code){
return res.json({
status:"error",
message:"Missing verification data"
})
}

console.log("Searching user email:", email)

/* Find user */

let user = await User.findOne({ email })

console.log("USER FOUND:", user ? "YES" : "NO")

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* Check verification code */

if(String(user.verificationCode) !== String(code)){
return res.json({
status:"error",
message:"Invalid verification code"
})
}

/* Check expiry */

if(!user.codeExpiry || new Date(user.codeExpiry).getTime() < Date.now()){
return res.json({
status:"error",
message:"Verification code expired"
})
}

/* Activate account */

user.verified = true
user.verificationCode = null
user.codeExpiry = null

await user.save()

console.log("User verified successfully")

res.json({
status:"success",
message:"Account verified successfully"
})

}catch(err){

console.log("VERIFY ERROR:", err)

res.json({
status:"error",
message:"Verification failed"
})

}

})

/*RESEND CODE API/
                  

app.post("/resend-code", async(req,res)=>{

try{

const {email} = req.body

const user = await User.findOne({email})

if(!user){
return res.json({status:"error",message:"User not found"})
}

const code = generateCode()

user.verificationCode = code
user.codeExpiry = new Date(Date.now()+15*60*1000)

await user.save()

await transporter.sendMail({
from:process.env.EMAIL_USER,
to:email,
subject:"NexShares Verification Code",
text:`Your new verification code is ${code}`
})

res.json({
status:"success",
message:"New code sent"
})

}catch(err){

console.log(err)

res.json({status:"error"})
}

})*/

/* LOGIN API */

app.post("/login", async (req,res)=>{

try{

const { email, password } = req.body

const user = await User.findOne({ email })

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* check password */

const validPassword = await bcrypt.compare(password,user.password)

if(!validPassword){
return res.json({
status:"error",
message:"Wrong password"
})
}

/* check verification */

if(!user.verified){
return res.json({
status:"error",
message:"Please verify your email first"
})
}

/* create token */

const token = jwt.sign(
{ id:user._id },
process.env.JWT_SECRET,
{ expiresIn:"7d" }
)

res.json({
status:"success",
message:"Login successful",
token
})

}catch(err){

console.log(err)

res.json({
status:"error",
message:"Server error"
})

}

})

/* VERIFY EMAIL CODE /
                      
app.post("/verify-code", async (req,res)=>{

try{

const { email, code } = req.body

const user = await User.findOne({ email })

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* check code *

if(user.verificationCode !== code){
return res.json({
status:"error",
message:"Invalid code"
})
}

/* check expiry /
                 
if(new Date() > user.codeExpiry){
return res.json({
status:"error",
message:"Code expired"
})
}

/* verify user *

user.verified = true
user.verificationCode = null

await user.save()

res.json({
status:"verified"
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})

                   
/* DEPOSIT REQUEST API */

app.post("/deposit", async (req,res)=>{

try{

console.log("DEPOSIT REQUEST BODY:", req.body)

const { email, amount, mpesaCode } = req.body

if(!email){
return res.json({
status:"error",
message:"Email session missing"
})
}

if(!amount){
return res.json({
status:"error",
message:"Enter deposit amount"
})
}

if(!mpesaCode){
return res.json({
status:"error",
message:"Enter Mpesa transaction code"
})
}

/* Save deposit request */

const deposit = new Deposit({
email,
amount:Number(amount),
mpesaCode,
status:"pending"
})

await deposit.save()

res.json({
status:"success",
message:"Deposit request submitted and pending approval"
})

}catch(err){

console.log("DEPOSIT ERROR:", err)

res.json({
status:"error",
message:"Deposit processing failed"
})

}

})

/* APPROVE DEPOSIT (ADMIN ONLY) */

app.post("/admin/approve-deposit", async (req,res)=>{

console.log("APPROVE REQUEST BODY:", req.body)

try{

const { depositId } = req.body
/* CHECK IF ID PROVIDED */

if(!depositId){
return res.json({
status:"error",
message:"Deposit ID missing"
})
}

/* FIND DEPOSIT */

let deposit = await Deposit.findById(depositId)

if(!deposit){
return res.json({
status:"error",
message:"Deposit not found"
})
}

/* CHECK IF ALREADY APPROVED */

if(deposit.status === "approved"){
return res.json({
status:"error",
message:"Deposit already approved"
})
}

/* FIND USER */

let user = await User.findOne({email:deposit.email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* CREDIT USER BALANCE */

user.balance += Number(deposit.amount)

/* UPDATE DEPOSIT STATUS */

deposit.status = "approved"

/* SAVE BOTH */

await user.save()
await deposit.save()

res.json({
status:"success",
message:"Deposit approved and balance credited"
})

}catch(err){

console.log("APPROVE DEPOSIT ERROR:",err)

res.json({
status:"error",
message:"Server error"
})

}

})

/* REJECT DEPOSIT */

app.post("/admin/reject-deposit", async(req,res)=>{

try{

const { depositId } = req.body

let deposit = await Deposit.findById(depositId)

if(!deposit){
return res.json({
status:"error",
message:"Deposit not found"
})
}

deposit.status = "rejected"

await deposit.save()

res.json({
status:"success",
message:"Deposit rejected"
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})

/* WITHDRAWAL REQUEST */

app.post("/withdraw", async(req,res)=>{

try{

const { email, amount } = req.body

let user = await User.findOne({email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* CHECK BALANCE */

if(user.balance < amount){
return res.json({
status:"error",
message:"Insufficient balance"
})
}

/* SAVE WITHDRAWAL REQUEST */

const withdrawal = new Withdrawal({
email,
amount,
status:"pending"
})

await withdrawal.save()

res.json({
status:"success",
message:"Withdrawal request submitted"
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})


/* PURCHASE API */

app.post("/buy-package", async (req,res)=>{

try{

const { email, packageData } = req.body

if(!email || !packageData){
return res.json({
status:"error",
message:"Missing purchase data"
})
}

/* FIND USER */

let user = await User.findOne({email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* CHECK WALLET BALANCE */

if(user.balance < packageData.price){
return res.json({
status:"error",
message:"Insufficient wallet balance"
})
}

/* DEDUCT WALLET */

user.balance -= Number(packageData.price)

/* ACTIVATE PACKAGE */

user.activePackage = packageData.name || null
user.shares = Number(packageData.shares) || 0
user.dailyProfit = Number(packageData.profit) || 0
user.packageDuration = Number(packageData.duration) || 0

user.packageStartDate = new Date()
user.lastProfitUpdate = new Date()

/* SAVE USER FIRST */

await user.save()

/* ===============================
   REFERRAL COMMISSION ENGINE
=============================== */

if(user.referredBy){

let firstRef = await User.findOne({
referralCode:user.referredBy
})

if(firstRef){

/* DIRECT DOWNLINE = 32% PACKAGE PRICE */

let firstCommission = packageData.price * 0.32

firstRef.balance += firstCommission
firstRef.referralCommission += firstCommission

await firstRef.save()

/* SECOND LEVEL = 12% PACKAGE PRICE */

if(firstRef.referredBy){

let secondRef = await User.findOne({
referralCode:firstRef.referredBy
})

if(secondRef){

let secondCommission = packageData.price * 0.12

secondRef.balance += secondCommission
secondRef.referralCommission += secondCommission

await secondRef.save()

}

}

}

}

res.json({
status:"success",
message:"Package purchased successfully"
})

}catch(err){

console.log(err)

res.json({
status:"error",
message:"Server error"
})

}

})


/* GET PENDING DEPOSITS */

app.get("/admin/pending-deposits", async (req,res)=>{

try{

const deposits = await Deposit.find({status:"pending"})

res.json(deposits)

}catch(err){

console.log(err)

res.json([])

}

})

/* DASHBOARD DATA API */

app.get("/dashboard-data", async (req,res)=>{

try{

const authHeader = req.headers.authorization

if(!authHeader){
return res.json({status:"error"})
}

const token = authHeader.split(" ")[1]

const decoded = jwt.verify(token,process.env.JWT_SECRET)

const user = await User.findById(decoded.id)

if(!user){
return res.json({status:"error"})
}

/* Send full dashboard data */

res.json({
status:"ok",
data:{
username:user.username,
balance:user.balance || 0,
profit:user.profit || 0,
referralCommission:user.referralCommission || 0,
referralCode:user.referralCode || "",
referralCount:user.referralCount || 0
}

})

}catch(err){

console.log(err)

res.json({status:"error"})
}

})


/* GET USER DATA */

app.get("/user", async (req,res)=>{

try{

const { email } = req.query

let user = await User.findOne({email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

res.json({
status:"success",
username:user.username,
balance:user.balance
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})

/* DEPOSIT STATUS API */

app.get("/deposit-status", async(req,res)=>{

try{

console.log("DEPOSIT STATUS REQUEST:", req.query)

const { email } = req.query

if(!email){
return res.json([])
}

let deposits = await Deposit.find({email})

res.json(deposits)

}catch(err){

console.log(err)

res.json([])
}

})


/* GET PENDING WITHDRAWALS */

app.get("/admin/pending-withdrawals", async(req,res)=>{

let withdrawals = await Withdrawal.find({status:"pending"})

res.json(withdrawals)

})

/* APPROVE WITHDRAWAL */

app.post("/admin/approve-withdrawal", async(req,res)=>{

try{

const { withdrawalId } = req.body

let withdrawal = await Withdrawal.findById(withdrawalId)

if(!withdrawal){
return res.json({
status:"error",
message:"Withdrawal not found"
})
}

let user = await User.findOne({email:withdrawal.email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

/* Deduct balance */

user.balance -= withdrawal.amount

withdrawal.status = "approved"

await user.save()
await withdrawal.save()

res.json({
status:"success",
message:"Withdrawal approved"
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})
/* WITHDRAWAL STATUS */
app.get("/withdraw-status", async(req,res)=>{
  try{
    const { email } = req.query
    if(!email) return res.json([])
    const withdrawals = await Withdrawal.find({email})
    res.json(withdrawals)
  }catch(err){
    console.log(err)
    res.json([])
  }
})


/* REJECT WITHDRAWAL */

app.post("/admin/reject-withdrawal", async(req,res)=>{

try{

const { withdrawalId } = req.body

let withdrawal = await Withdrawal.findById(withdrawalId)

if(!withdrawal){
return res.json({
status:"error",
message:"Withdrawal not found"
})
}

withdrawal.status = "rejected"

await withdrawal.save()

res.json({
status:"success",
message:"Withdrawal rejected"
})

}catch(err){

console.log(err)

res.json({
status:"error"
})

}

})



// ===== NEXSHARES DAILY PROFIT ENGINE =====

setInterval(async () => {

try{

const users = await User.find({ shares: { $gt: 0 } })

for(const user of users){

if(!user.packageStartDate) continue

const now = new Date()

const lastUpdate = user.lastProfitUpdate || user.packageStartDate

const daysPassed = Math.floor((now - lastUpdate) / (1000*60*60*24))

if(daysPassed <= 0) continue

const maxDays = user.packageDuration

const totalDays = Math.floor((now - user.packageStartDate) / (1000*60*60*24))

if(totalDays >= maxDays){

continue
}

/* SAFE PROFIT DELTA CALCULATION */

const profit = user.dailyProfit * daysPassed

if(profit > 0){

user.balance += profit
user.totalProfitEarned = (user.totalProfitEarned || 0) + profit
user.lastProfitUpdate = now


await user.save()

}

}

}catch(err){

console.log("Profit Engine Error:",err)

}

}, 60000) // runs every 1 minute for better accuracy


/* SHARES DASHBOARD API */

app.post("/shares-dashboard", async (req,res)=>{

try{

const { email } = req.body

if(!email){
return res.json({status:"error"})
}

const user = await User.findOne({email})

if(!user){
return res.json({status:"error"})
}

const now = new Date()

let daysCompleted = 0

if(user.packageStartDate){
daysCompleted = Math.floor(
(now - user.packageStartDate)/(1000*60*60*24)
)
}

res.json({
status:"success",
shares:user.shares || 0,
dailyProfit:user.dailyProfit || 0,
totalProfit:user.totalProfitEarned || 0,
daysCompleted
})

}catch(err){
console.log(err)
res.json({status:"error"})
}

})

/* WITHDRAW REQUEST API */

app.post("/withdraw-shares", async (req,res)=>{

try{

let { email, number, name, amount } = req.body

/* Validate input */

if(!email || !number || !name || !amount){
return res.json({
status:"error",
message:"Fill all withdrawal fields"
})
}

const user = await User.findOne({email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

if(user.balance < Number(amount)){
return res.json({
status:"error",
message:"Insufficient balance"
})
}

/* Create withdrawal request */

const Withdrawal = require("./models/Withdrawal")

const withdrawal = new Withdrawal({
email,
mpesaNumber:number,
mpesaName:name,
amount:Number(amount),
status:"pending"
})

await withdrawal.save()

res.json({
status:"success",
message:"Withdrawal request submitted"
})

}catch(err){

console.log(err)

res.json({
status:"error",
message:"Server error"
})

}

})


/* REFERRAL DATA API */

app.get("/referral-data", async (req,res) => {

try{

const authHeader = req.headers.authorization;

if(!authHeader){
return res.json({
status:"error",
message:"Unauthorized"
});
}

const token = authHeader.split(" ")[1];

if(!token){
return res.json({
status:"error",
message:"Invalid session token"
});
}

/* Safe JWT verification */

let decoded;

try{
decoded = jwt.verify(token, process.env.JWT_SECRET);
}catch(err){
return res.json({
status:"error",
message:"Session expired. Please login again."
});
}

/* Find user */

const user = await User.findById(decoded.id);

if(!user){
return res.json({
status:"error",
message:"User not found"
});
}

/* Generate referral link (IMPORTANT) */

let referralLink = `/index.html?ref=${user.referralCode || ""}`;

/* Find referral users */

const referrals = await User.find({
referredBy: user.referralCode
}).select("username activePackage");

/* Send response */

res.json({
status:"ok",
data:{
referralLink,
referralEarnings: user.referralCommission || 0,
referralCount: referrals.length,
referrals: referrals.map(r => ({
username: r.username,
activePackage: r.activePackage || "Pending Package"
}))
}
});

}catch(err){

console.log(err);

res.json({
status:"error",
message:"Server error"
});

}

});

/*FORGOT PASSWORD API*/

app.post("/forgot-password", async (req,res)=>{

const {email,newPassword} = req.body

const user = await User.findOne({email})

if(!user){
return res.json({
status:"error",
message:"User not found"
})
}

const hashedPassword = await bcrypt.hash(newPassword,10)

user.password = hashedPassword

await user.save()

res.json({
status:"success",
message:"Password reset successful"
})

})

                        
/*VERIFY RESET CODE API/

app.post("/verify-reset-code", async (req,res)=>{

try{

const { email, code } = req.body

let user = await User.findOne({email})

if(!user){
return res.json({status:"error"})
}

if(user.verificationCode !== code){
return res.json({
status:"error",
message:"Invalid code"
})
}

if(new Date() > user.codeExpiry){
return res.json({
status:"error",
message:"Code expired"
})
}

res.json({
status:"success",
message:"Code verified"
})

}catch(err){
console.log(err)
res.json({status:"error"})
}

})



/*RESET PASSWORD API*/


app.post("/reset-password", async (req,res)=>{

try{

const { email, code, newPassword } = req.body

let user = await User.findOne({email})

if(!user){
return res.json({status:"error"})
}

if(user.verificationCode !== code){
return res.json({
status:"error",
message:"Invalid code"
})
}

let hashed = await bcrypt.hash(newPassword,10)

user.password = hashed
user.verificationCode = null

await user.save()

res.json({
status:"success",
message:"Password reset successful"
})

}catch(err){
console.log(err)
res.json({status:"error"})
}

})
