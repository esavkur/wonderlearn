import "dotenv/config";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {User,Book} from "./models.js";
await mongoose.connect(process.env.MONGODB_URI);
const books=JSON.parse(await fs.readFile(new URL("./data/books.json",import.meta.url),"utf8"));
for(const b of books)await Book.findOneAndUpdate({slug:b.slug},b,{upsert:true,new:true});
async function ensure(name,email,password,role,classLevel=6){if(!(await User.findOne({email})))await User.create({name,email,passwordHash:await bcrypt.hash(password,12),role,classLevel})}
await ensure("Demo Student","student@example.com","Student@123","student",6);
await ensure("Demo Parent","parent@example.com","Parent@123","parent",6);
await ensure("Demo Admin","admin@example.com","Admin@123","admin",6);
console.log(`Seeded ${books.length} books and demo users`);
await mongoose.disconnect();
