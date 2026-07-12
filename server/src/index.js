import "dotenv/config";
import path from "node:path";
import {fileURLToPath} from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import {z} from "zod";
import {User,Book,Progress,QuizAttempt,Activity} from "./models.js";
import {auth,role,sign} from "./auth.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.use(helmet({crossOriginResourcePolicy:false}));
const allowedOrigins=(process.env.CLIENT_ORIGIN||"http://localhost:5173").split(",").map(v=>v.trim());
app.use(cors({origin:(origin,cb)=>!origin||allowedOrigins.includes(origin)?cb(null,true):cb(new Error("CORS origin not allowed"))}));
app.use(express.json({limit:"4mb"}));
app.use(express.static(path.join(__dirname,"../public")));

app.get("/api/health",(_q,r)=>r.status(mongoose.connection.readyState===1?200:503).json({status:mongoose.connection.readyState===1?"ok":"degraded",database:mongoose.connection.readyState===1?"connected":"disconnected",version:process.env.APP_VERSION||"2.0.0"}));

app.post("/api/auth/register",async(req,res)=>{
 const x=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),classLevel:z.number().min(6).max(10)}).parse(req.body);
 if(await User.findOne({email:x.email.toLowerCase()}))return res.status(409).json({message:"Email already exists"});
 const u=await User.create({...x,email:x.email.toLowerCase(),passwordHash:await bcrypt.hash(x.password,12),role:"student"});
 res.status(201).json({token:sign(u),user:{id:u._id,name:u.name,email:u.email,role:u.role,classLevel:u.classLevel}});
});
app.post("/api/auth/login",async(req,res)=>{
 const x=z.object({email:z.string().email(),password:z.string().min(8)}).parse(req.body);
 const u=await User.findOne({email:x.email.toLowerCase()});
 if(!u||!(await bcrypt.compare(x.password,u.passwordHash)))return res.status(401).json({message:"Incorrect email or password"});
 res.json({token:sign(u),user:{id:u._id,name:u.name,email:u.email,role:u.role,classLevel:u.classLevel}});
});

app.get("/api/books",auth,async(req,res)=>{
 const f={isActive:true}; if(req.query.classLevel)f.classLevel=Number(req.query.classLevel); if(req.query.subject)f.subject=req.query.subject;
 res.json(await Book.find(f).sort({classLevel:1,subject:1,title:1}));
});
app.get("/api/books/:id",auth,async(req,res)=>{
 const b=await Book.findById(req.params.id); if(!b)return res.status(404).json({message:"Book not found"}); res.json(b);
});

app.get("/api/progress",auth,async(req,res)=>res.json(await Progress.find({user:req.user.sub}).populate("book").sort({lastReadAt:-1})));
app.get("/api/progress/:bookId",auth,async(req,res)=>res.json(await Progress.findOne({user:req.user.sub,book:req.params.bookId})));
app.put("/api/progress/:bookId",auth,async(req,res)=>{
 const x=z.object({currentPage:z.number().min(1),totalPages:z.number().min(1),readingSeconds:z.number().min(0).default(0)}).parse(req.body);
 const percent=Math.min(100,Math.round(x.currentPage/x.totalPages*100));
 const p=await Progress.findOneAndUpdate({user:req.user.sub,book:req.params.bookId},
  {$set:{currentPage:x.currentPage,totalPages:x.totalPages,percent,lastReadAt:new Date()},$inc:{readingSeconds:x.readingSeconds}},
  {upsert:true,new:true,setDefaultsOnInsert:true});
 const key=new Date().toISOString().slice(0,10);
 await Activity.findOneAndUpdate({user:req.user.sub,dateKey:key},{$inc:{minutes:Math.floor(x.readingSeconds/60),pages:1}},{upsert:true,new:true});
 res.json(p);
});
app.delete("/api/progress/:bookId",auth,async(req,res)=>{await Progress.findOneAndDelete({user:req.user.sub,book:req.params.bookId});res.json({message:"Reset"})});
app.post("/api/progress/:bookId/bookmarks",auth,async(req,res)=>{
 const x=z.object({page:z.number().min(1),label:z.string().max(120).default("Saved page")}).parse(req.body);
 const p=await Progress.findOneAndUpdate({user:req.user.sub,book:req.params.bookId},{$push:{bookmarks:x}},{upsert:true,new:true,setDefaultsOnInsert:true});
 res.status(201).json(p.bookmarks.at(-1));
});
app.post("/api/progress/:bookId/notes",auth,async(req,res)=>{
 const x=z.object({page:z.number().min(1),text:z.string().max(5000).default(""),selectedText:z.string().max(5000).default(""),aiExplanation:z.string().max(20000).default("")}).parse(req.body);
 const p=await Progress.findOneAndUpdate({user:req.user.sub,book:req.params.bookId},{$push:{notes:x}},{upsert:true,new:true,setDefaultsOnInsert:true});
 res.status(201).json(p.notes.at(-1));
});

app.get("/api/dashboard",auth,async(req,res)=>{
 const [progress,activity,attempts]=await Promise.all([
  Progress.find({user:req.user.sub}).populate("book").sort({lastReadAt:-1}),
  Activity.find({user:req.user.sub}).sort({dateKey:-1}).limit(30),
  QuizAttempt.find({user:req.user.sub}).sort({createdAt:-1}).limit(10)
 ]);
 const activeDays=new Set(activity.filter(a=>a.minutes>0||a.pages>0).map(a=>a.dateKey));
 let streak=0,d=new Date();
 while(activeDays.has(d.toISOString().slice(0,10))){streak++;d.setDate(d.getDate()-1)}
 res.json({streak,progress,activity,attempts,totalMinutes:activity.reduce((s,a)=>s+a.minutes,0)});
});

const aiLimit=rateLimit({windowMs:60000,limit:20});
function openai(){if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error("OPENAI_API_KEY is not configured"),{status:503});return new OpenAI({apiKey:process.env.OPENAI_API_KEY})}

app.post("/api/ai/explain-stream",auth,aiLimit,async(req,res)=>{
 const x=z.object({
  selectedText:z.string().min(1).max(3500),classLevel:z.number().min(6).max(10),
  subject:z.string(),language:z.string().default("Hinglish")
 }).parse(req.body);
 const client=openai();

 res.setHeader("Content-Type","text/event-stream; charset=utf-8");
 res.setHeader("Cache-Control","no-cache, no-transform");
 res.setHeader("Connection","keep-alive");
 res.setHeader("X-Accel-Buffering","no");
 res.flushHeaders?.();

 const prompt=`
You are WonderLearn AI Teacher, a patient, accurate, and highly engaging NCERT tutor.

Student profile:
- Class: ${x.classLevel}
- Subject: ${x.subject}
- Preferred language: Natural Hinglish written only in Roman script
- The student may be studying this topic for the first time.

Selected textbook text:
"""
${x.selectedText}
"""

Your goal is to make the concept genuinely understandable. Do not merely translate or paraphrase the selected lines.

Teach using the following structure:

## 1. Sabse Simple Meaning
Explain the central idea in 4-6 very easy sentences.
Begin from the absolute basics.
Assume the student has no prior understanding of the topic.

## 2. Detail Mein Samjho
Explain the concept step by step not more than concise 5-6 sentences.
Show clearly how one idea connects with the next.
Use short paragraphs so that a school student can follow comfortably.
Whenever a new scientific, mathematical, geographical, historical, political, literary, or economic term appears, explain it immediately.


## 3. Ye Kyu aur kaise Hota Hai?
Explain the reason, cause, purpose, or importance behind the concept in concise 5-6 sentences.
If it is a rule, formula, reaction, historical event, social process, or natural phenomenon, explain why it works or why it happens.

If the topic contains a process, sequence, mechanism, reaction, system, event, formula, or cause-effect chain:
- explain what happens first
- explain what happens next
- explain what changes at every stage
- explain the final result

Skip this section only when it is genuinely irrelevant.

## 5. Do Real-Life Examples
Give at least two clear and relatable examples.
Prefer examples from:
- home
- school
- playground
- kitchen
- road or transport
- Indian weather and surroundings
- plants, animals, or common objects

The examples must directly explain the concept, not just mention it.

## 6. Imagine Karo
Create a simple analogy, mental picture, or short mini-story.
Help the student visualize the idea as if it is happening in front of them.

## 7. Textbook Example Ko Break Karke Samjho
If the selected text contains any definition, equation, chemical reaction, diagram description, historical statement, poem line, event, formula, data, or example:
- explain every important part separately
- explain symbols, numbers, terms, people, or places
- explain what the full example demonstrates

Skip this section only if the selected text has no example or statement to break down.

## 8. Important Points
Give 3-4 concise bullet points that the student should remember.


## 9. Quick Check
Ask three questions:
1. one basic recall question
2. one understanding-based question
3. one application-based question

## 10. Answers
Give clear answers to all three questions.

Important rules:
- Use Roman-script Hinglish only.
- Never use Urdu script or Devanagari.
- Use simple, friendly, child-appropriate language.
- Keep standard English academic terms when students need to learn them, but explain those terms.
- Stay aligned with NCERT school-level understanding.
- Do not invent facts, dates, formulas, reactions, or examples.
- If the selected fragment is incomplete or ambiguous, explicitly mention which context is missing.
- Use Markdown headings, bullets, numbered steps, bold text, and equations where helpful.
- Avoid unnecessary greetings, excessive praise, and repeated sentences.
- For a difficult concept, aim for approximately 900-1300 useful words.
- For a small and simple selection, still provide enough detail to understand it properly, normally 600-900 words.
- Do not create an image in this response.
`;

 try{
  const stream=await client.responses.create({
   model:process.env.OPENAI_TEXT_MODEL||"gpt-5-mini",
   input:prompt,
   reasoning:{effort:"minimal"},
   max_output_tokens:3000,
   stream:true
  });

  for await(const event of stream){
   if(event.type==="response.output_text.delta"){
    res.write(`data: ${JSON.stringify({type:"delta",text:event.delta})}\n\n`);
   }
   if(event.type==="response.completed"){
    res.write(`data: ${JSON.stringify({type:"done"})}\n\n`);
   }
  }
  res.end();
 }catch(error){
  console.error("AI stream error",error);
  res.write(`data: ${JSON.stringify({type:"error",message:error.message})}\n\n`);
  res.end();
 }
});

app.post("/api/ai/visual",auth,aiLimit,async(req,res)=>{
 const x=z.object({
  selectedText:z.string().min(1).max(2500),classLevel:z.number().min(6).max(10),subject:z.string()
 }).parse(req.body);
 const client=openai();
 const image=await client.images.generate({
  model:process.env.OPENAI_IMAGE_MODEL||"gpt-image-1",
  size:"1024x1024",
  prompt:`Create one clear, accurate, child-friendly educational diagram for a Class ${x.classLevel} NCERT ${x.subject} student.

Topic:
${x.selectedText.slice(0,900)}

Requirements:
- clean school textbook infographic style
- simple visual hierarchy
- only essential, large English labels
- arrows for processes and relationships
- plain light background
- academically accurate
- no logos, watermarks, decorative paragraphs, or irrelevant objects
- make the concept understandable at a glance`
 });
 const first=image.data?.[0];
 const visual=first?.b64_json?`data:image/png;base64,${first.b64_json}`:(first?.url||null);
 if(!visual)return res.status(502).json({message:"Image model returned no image"});
 res.json({visual});
});

app.post("/api/ai/quiz",auth,aiLimit,async(req,res)=>{
 const x=z.object({bookId:z.string(),page:z.number().min(1),subject:z.string(),classLevel:z.number().min(6).max(10),topic:z.string().min(2).max(500)}).parse(req.body);
 const client=openai();
 const prompt=`Create exactly 5 multiple-choice questions for Class ${x.classLevel}, subject ${x.subject}, topic: ${x.topic}. Return valid JSON only as {"questions":[{"question":"","options":["","","",""],"correctIndex":0,"explanation":""}]}. Use age-appropriate NCERT-level language.`;
 const a=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL||"gpt-5-nano",input:prompt,reasoning:{effort:"minimal"},max_output_tokens:1200});
 let data; try{data=JSON.parse(a.output_text.replace(/^```json|```$/g,"").trim())}catch{return res.status(502).json({message:"AI returned invalid quiz JSON"})}
 const attempt=await QuizAttempt.create({user:req.user.sub,book:x.bookId,page:x.page,topic:x.topic,questions:data.questions,total:data.questions.length,score:0});
 res.status(201).json(attempt);
});
app.put("/api/quizzes/:id/submit",auth,async(req,res)=>{
 const x=z.object({answers:z.array(z.number().int().min(-1))}).parse(req.body);
 const q=await QuizAttempt.findOne({_id:req.params.id,user:req.user.sub}); if(!q)return res.status(404).json({message:"Quiz not found"});
 let score=0;q.questions.forEach((v,i)=>{v.userAnswer=x.answers[i]??-1;if(v.userAnswer===v.correctIndex)score++});q.score=score;await q.save();res.json(q);
});

app.get("/api/parent/student",auth,role("parent"),async(req,res)=>{
 const parent=await User.findById(req.user.sub);if(!parent.linkedStudent)return res.json({student:null});
 const student=await User.findById(parent.linkedStudent).select("-passwordHash");
 const progress=await Progress.find({user:student._id}).populate("book").sort({lastReadAt:-1});
 res.json({student,progress});
});
app.get("/api/admin/summary",auth,role("admin"),async(_req,res)=>{
 const [users,books,reads]=await Promise.all([User.countDocuments(),Book.countDocuments(),Progress.countDocuments()]);
 res.json({users,books,reads});
});

app.use((e,_q,r,_n)=>{console.error(e);r.status(e.status||500).json({message:e.message||"Server error"})});
await mongoose.connect(process.env.MONGODB_URI);
const server=app.listen(Number(process.env.PORT||4000),()=>console.log(`WonderLearn API listening on ${process.env.PORT||4000}`));
const shutdown=async()=>{console.log("Graceful shutdown");server.close(async()=>{await mongoose.disconnect();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
