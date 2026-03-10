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

const { Resend } = require("resend");
const nodemailer = require("nodemailer");

const authMiddleware = require("./middleware/authMiddleware");

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

/* ===== MIDDLEWARE ===== */

app.use(morgan("dev"));
app.use(express.json());

app.use(cors({
  origin: "https://nexshares-production.up.railway.app",
  credentials: true
}));

/* ===== EMAIL TRANSPORT ===== */

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const USE_RESEND = !!process.env.RESEND_API_KEY;

/* ===== HELPERS ===== */

function generateReferralCode(){
  return "NX" + Math.random().toString(36).substring(2,8).toUpperCase();
}

function generateCode(){
  return Math.floor(100000 + Math.random() * 900000);
}

/* ===== MONGODB ===== */

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log("MongoDB Error:",err));

/* ===== STATIC ===== */

app.use(express.static("public"));

app.get("/", (req,res)=>{
  res.sendFile(__dirname + "/public/index.html");
});

/* ===== SERVER START ===== */

const PORT = process.env.PORT || 5000;

app.listen(PORT,"0.0.0.0",()=>{
  console.log("Server running on port "+PORT);
});


/* ===== REGISTER ===== */

app.post("/register", async (req, res) => {
  try {
    const { username, email, password, referral } = req.body;

    if (!username || !email || !password) {
      return res.json({ status: "error", message: "All fields required" });
    }

    // Check existing user
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ status: "error", message: "User exists" });
    }

    // Handle referral
    let referredBy = null;
    if (referral) {
      const refUser = await User.findOne({ referralCode: referral });
      if (refUser) referredBy = referral;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification code
    const code = generateCode();

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      verified: false,
      referralCode: generateReferralCode(),
      referredBy,
      referralCommission: 0,
      referralCount: 0,
      balance: 0,
      verificationCode: code,
      codeExpiry: new Date(Date.now() + 15 * 60 * 1000),
    });

    await user.save();

    // ===== SEND EMAIL =====
    if (USE_RESEND) {
      try {
        console.log("Sending verification email to:", email);
        const response = await resend.emails.send({
          from: "onboarding@resend.dev",
          to: email,
          subject: "NexShares Verification Code",
          text: `Your new verification code is ${code}`,
        });
        console.log("Resend email response:", response);
      } catch (err) {
        console.error("Resend email sending failed:", err);
      }
    } else if (transporter) {
      try {
        const response = await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: "NexShares Verification Code",
          text: `Your new verification code is ${code}`,
        });
        console.log("Gmail email response:", response);
      } catch (err) {
        console.error("Gmail email sending failed:", err);
      }
    }

    // ===== Update referrer =====
    if (referredBy) {
      const refUser = await User.findOne({ referralCode: referredBy });
      if (refUser) {
        refUser.referralCount = (refUser.referralCount || 0) + 1;
        await refUser.save();
      }
    }

    return res.json({ status: "success", message: "Registration successful" });

  } catch (err) {
    console.error("Registration error:", err);
    return res.json({ status: "error", message: "Something went wrong" });
  }
});


/* ===== VERIFY ===== */

app.post("/verify", async(req,res)=>{

try{

const {email,code} = req.body;

let user = await User.findOne({email});

if(!user){
return res.json({status:"error",message:"User not found"});
}

if(String(user.verificationCode)!==String(code)){
return res.json({status:"error",message:"Invalid code"});
}

if(new Date(user.codeExpiry) < Date.now()){
return res.json({status:"error",message:"Code expired"});
}

user.verified=true;
user.verificationCode=null;
user.codeExpiry=null;

await user.save();

res.json({status:"success",message:"Account verified"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== RESEND CODE ===== */

app.post("/resend-code", async(req,res)=>{

try{

const {email} = req.body;

const user = await User.findOne({email});

if(!user){
return res.json({status:"error"});
}

const code = generateCode();

user.verificationCode=code;
user.codeExpiry=new Date(Date.now()+15*60*1000);

await user.save();

await transporter.sendMail({
from:process.env.EMAIL_USER,
to:email,
subject:"Verification Code",
text:`Your new verification code is ${code}`
});

res.json({status:"success"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== LOGIN ===== */

app.post("/login", async(req,res)=>{

try{

const {email,password}=req.body;

const user = await User.findOne({email});

if(!user){
return res.json({status:"error",message:"User not found"});
}

const valid = await bcrypt.compare(password,user.password);

if(!valid){
return res.json({status:"error",message:"Wrong password"});
}

if(!user.verified){
return res.json({status:"error",message:"Verify email first"});
}

const token = jwt.sign(
{id:user._id},
process.env.JWT_SECRET,
{expiresIn:"7d"}
);

res.json({status:"success",token});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== DEPOSIT ===== */

app.post("/deposit", async(req,res)=>{

try{

const {email,amount,mpesaCode} = req.body;

if(!email || !amount || !mpesaCode){
return res.json({status:"error"});
}

const deposit = new Deposit({
email,
amount:Number(amount),
mpesaCode,
status:"pending"
});

await deposit.save();

res.json({status:"success"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== APPROVE DEPOSIT ===== */

app.post("/admin/approve-deposit", async(req,res)=>{

try{

const {depositId}=req.body;

let deposit = await Deposit.findById(depositId);

if(!deposit){
return res.json({status:"error"});
}

if(deposit.status==="approved"){
return res.json({status:"error"});
}

let user = await User.findOne({email:deposit.email});

user.balance += Number(deposit.amount);

deposit.status="approved";

await user.save();
await deposit.save();

res.json({status:"success"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== REJECT DEPOSIT ===== */

app.post("/admin/reject-deposit", async(req,res)=>{

try{

const {depositId}=req.body;

let deposit = await Deposit.findById(depositId);

deposit.status="rejected";

await deposit.save();

res.json({status:"success"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== WITHDRAW ===== */

app.post("/withdraw", async(req,res)=>{

try{

const {email,amount}=req.body;

let user = await User.findOne({email});

if(user.balance < amount){
return res.json({status:"error"});
}

const withdrawal = new Withdrawal({
email,
amount,
status:"pending"
});

await withdrawal.save();

res.json({status:"success"});

}catch(err){
console.log(err);
res.json({status:"error"});
}

});

/* ===== ADMIN PENDING WITHDRAWALS ===== */

app.get("/admin/pending-withdrawals", async(req,res)=>{

let withdrawals = await Withdrawal.find({status:"pending"});

res.json(withdrawals);

});

/* ===== PROFIT ENGINE ===== */

setInterval(async()=>{

try{

const users = await User.find({shares:{$gt:0}});

for(const user of users){

if(!user.packageStartDate) continue;

const now = new Date();

const lastUpdate = user.lastProfitUpdate || user.packageStartDate;

const daysPassed = Math.floor((now-lastUpdate)/(1000*60*60*24));

if(daysPassed<=0) continue;

const profit = user.dailyProfit * daysPassed;

user.balance += profit;
user.totalProfitEarned = (user.totalProfitEarned || 0) + profit;

user.lastProfitUpdate=now;

await user.save();

}

}catch(err){
console.log("Profit engine error",err);
}

},60000);
