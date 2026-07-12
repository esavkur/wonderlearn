# WonderLearn Pro V2

Professional NCERT AI learning platform for Classes 6–10.

## Included in the core code package

- React + Vite responsive frontend
- Node.js + Express backend
- MongoDB
- Student registration/login
- Roles: student, parent, admin
- Library with class/subject/search filters
- In-app PDF reader
- Resume, restart, bookmarks and personal notes
- AI child-friendly explanation
- Optional AI visual
- AI quiz generation and stored attempts
- Reading streak and dashboard
- Parent progress view
- Admin catalog summary
- Dark mode
- Docker Compose
- Health checks and rate limiting

Books are distributed separately by class to avoid upload failures.

## Folder placement

Extract the core ZIP first. Then extract each class ZIP so the final structure is:

server/public/books/Class6/*.pdf
server/public/books/Class7/*.pdf
server/public/books/Class8/*.pdf
server/public/books/Class9/*.pdf
server/public/books/Class10/*.pdf

## Local run

1. Copy environment files:

```powershell
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

2. Start MongoDB:

```powershell
docker run -d --name wonderlearn-mongo -p 27017:27017 -v wonderlearn-data:/data/db mongo:7
```

3. Backend:

```powershell
cd server
npm install
npm run seed
npm run dev
```

4. Frontend:

```powershell
cd client
npm install
npm run dev
```

Open http://localhost:5173

Demo accounts after seed:

- Student: student@example.com / Student@123
- Parent: parent@example.com / Parent@123
- Admin: admin@example.com / Admin@123
