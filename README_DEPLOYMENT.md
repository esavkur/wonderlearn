# WonderLearn – fastest Azure/Jenkins demo deployment

## 1. Values
```bash
export AZURE_SUBSCRIPTION_ID='<AZURE_SUBSCRIPTION_ID>'
export AZURE_TENANT_ID='<AZURE_TENANT_ID>'
export UNIQUE_SUFFIX='sk85'   # lowercase, globally unique
export LOCATION='canadacentral'
```

## 2. Create Azure infrastructure once
```bash
az login
./azure/01-create-infrastructure.sh
```

## 3. Insert Key Vault secrets and configure apps
MongoDB Atlas: use separate DB names `wonderlearn_dev` and `wonderlearn_prod`. For today's demo, Atlas network access `0.0.0.0/0` works but must be restricted later.
```bash
export MONGODB_DEV_URI='<MONGODB_DEV_URI>'
export MONGODB_PROD_URI='<MONGODB_PROD_URI>'
export OPENAI_API_KEY='<OPENAI_API_KEY>'
export YOUTUBE_API_KEY='<YOUTUBE_API_KEY>'
export JWT_DEV_SECRET="$(openssl rand -hex 32)"
export JWT_PROD_SECRET="$(openssl rand -hex 32)"
./azure/02-set-secrets-and-config.sh
```

## 4. Upload NCERT PDFs
Keep folders such as Class6, Class7, Class8, Class9, Class10 under one local root.
```bash
export BOOKS_SOURCE='/mnt/c/path/to/NCERT-Books'
./azure/03-upload-books.sh dev
./azure/03-upload-books.sh prod
```
Current catalog still supports local `/books/...` paths. For a private production container, add a backend SAS endpoint before switching catalog URLs; for the immediate demo, existing application can be demonstrated locally or container access can temporarily be set to blob public read:
```bash
az storage container set-permission --account-name stwonderlearndev${UNIQUE_SUFFIX} --name books --public-access blob --auth-mode login
az storage container set-permission --account-name stwonderlearnprod${UNIQUE_SUFFIX} --name books --public-access blob --auth-mode login
```
Production recommendation: return short-lived user-delegation SAS URLs from the authenticated backend and keep container private.

## 5. Start SonarQube and Jenkins
```bash
docker network create devops-net 2>/dev/null || true
docker compose -f sonar/docker-compose.yml up -d
docker compose -f jenkins/docker-compose.yml up -d --build
docker logs -f jenkins-jenkins-1
```
Sonar: http://localhost:9000 (initial admin/admin), change password, create project key `wonderlearn`, token, then Jenkins credential `sonarqube-token` (Secret text). Jenkins > Manage Jenkins > System: add Sonar server named `sonarqube`, URL `http://sonarqube:9000`, token credential; add webhook in Sonar: `http://jenkins:8080/sonarqube-webhook/`.

## 6. Jenkins Azure service principal
```bash
./azure/04-create-jenkins-sp.sh
```
Create Jenkins **Username with password** credential ID `azure-sp-wonderlearn`: username=appId, password=password. Also define global environment variables `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` in Jenkins.

## 7. GitHub
```bash
git init
git checkout -b main
git add .
git commit -m "Initial WonderLearn deployment implementation"
git remote add origin <GITHUB_REPOSITORY_URL>
git push -u origin main
```
Create a Pipeline job from SCM, point it to GitHub, Script Path `Jenkinsfile`, Build Now. Dev deploys first; production waits for approval and promotes the exact same Git SHA images.

## URLs and diagnostics
```bash
curl https://app-wonderlearn-api-dev-${UNIQUE_SUFFIX}.azurewebsites.net/api/health
curl https://app-wonderlearn-frontend-dev-${UNIQUE_SUFFIX}.azurewebsites.net/health
az webapp log config -g rg-wonderlearn-dev -n app-wonderlearn-api-dev-${UNIQUE_SUFFIX} --docker-container-logging filesystem
az webapp log tail -g rg-wonderlearn-dev -n app-wonderlearn-api-dev-${UNIQUE_SUFFIX}
az webapp config appsettings list -g rg-wonderlearn-dev -n app-wonderlearn-api-dev-${UNIQUE_SUFFIX} --query "[?name=='MONGODB_URI' || name=='OPENAI_API_KEY'].[name,value]"
az keyvault secret show --vault-name kv-wonderlearn-dev-${UNIQUE_SUFFIX} --name MongoDbUri --query attributes.enabled
```

## Important demo notes
- Jenkins Docker socket access is powerful and effectively grants host-level Docker control; acceptable only for a controlled local demo.
- Frontend URL is generated at container startup through `config.js`, so the same frontend image can move Dev → Prod.
- Secrets are never baked into images; App Service resolves Key Vault references through backend managed identity.
- `server/public/books/` is intentionally excluded from Git and Docker.
