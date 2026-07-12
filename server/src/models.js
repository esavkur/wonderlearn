import mongoose from "mongoose";

const noteSchema=new mongoose.Schema({
  text:String,page:Number,selectedText:String,aiExplanation:String,createdAt:{type:Date,default:Date.now}
},{_id:true});

export const User=mongoose.model("User",new mongoose.Schema({
  name:{type:String,required:true},email:{type:String,unique:true,lowercase:true,required:true},
  passwordHash:{type:String,required:true},role:{type:String,enum:["student","parent","admin"],default:"student"},
  classLevel:{type:Number,min:6,max:10,default:6},linkedStudent:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  preferences:{darkMode:{type:Boolean,default:false},language:{type:String,default:"Hinglish"}}
},{timestamps:true}));

export const Book=mongoose.model("Book",new mongoose.Schema({
  slug:{type:String,unique:true},classLevel:Number,subject:String,title:String,description:String,
  pdfPath:String,coverPath:String,pageCount:Number,language:String,isActive:{type:Boolean,default:true}
},{timestamps:true}));

export const Progress=mongoose.model("Progress",new mongoose.Schema({
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  book:{type:mongoose.Schema.Types.ObjectId,ref:"Book",required:true},
  currentPage:{type:Number,default:1},totalPages:{type:Number,default:1},percent:{type:Number,default:0},
  readingSeconds:{type:Number,default:0},lastReadAt:{type:Date,default:Date.now},
  bookmarks:[{page:Number,label:String,createdAt:{type:Date,default:Date.now}}],
  notes:[noteSchema]
},{timestamps:true}));
Progress.schema.index({user:1,book:1},{unique:true});

export const QuizAttempt=mongoose.model("QuizAttempt",new mongoose.Schema({
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  book:{type:mongoose.Schema.Types.ObjectId,ref:"Book",required:true},
  page:Number,topic:String,questions:[{
    question:String,options:[String],correctIndex:Number,explanation:String,userAnswer:Number
  }],
  score:Number,total:Number
},{timestamps:true}));

export const Activity=mongoose.model("Activity",new mongoose.Schema({
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  dateKey:{type:String,required:true},minutes:{type:Number,default:0},pages:{type:Number,default:0}
},{timestamps:true}));
Activity.schema.index({user:1,dateKey:1},{unique:true});
