const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema({

username:{
type:String,
required:true
},

email:{
type:String,
required:true,
unique:true
},

password:{
type:String,
required:true
},

verified:{
type:Boolean,
default:true
},

referralCode:String,
referredBy:String,

referralCommission:{
type:Number,
default:0
},

referralCount:{
type:Number,
default:0
},

balance:{
type:Number,
default:0
},

shares:Number,
dailyProfit:Number,
packageDuration:Number,

packageStartDate:Date,
lastProfitUpdate:Date,

totalProfitEarned:{
type:Number,
default:0
}

})

module.exports = mongoose.model("User",UserSchema)
