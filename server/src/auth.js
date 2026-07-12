import jwt from "jsonwebtoken";
export function sign(user){return jwt.sign({sub:user._id.toString(),role:user.role,name:user.name,classLevel:user.classLevel},process.env.JWT_SECRET,{expiresIn:"7d"})}
export function auth(req,res,next){
 const token=req.headers.authorization?.replace("Bearer ","");
 if(!token)return res.status(401).json({message:"Login required"});
 try{req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({message:"Session expired"})}
}
export function role(...roles){return(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:"Not allowed"})}
