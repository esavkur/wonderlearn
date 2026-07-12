pipeline {
 agent any
 options { timestamps(); disableConcurrentBuilds(); timeout(time: 90, unit: 'MINUTES'); buildDiscarder(logRotator(numToKeepStr:'10')) }
 parameters {
  string(name:'UNIQUE_SUFFIX', defaultValue:'sk85')
  string(name:'ACR_NAME', defaultValue:'acrwonderlearnsk85')
  booleanParam(name:'DEPLOY_PROD', defaultValue:true)
 }
 environment {
  AZURE_CREDS=credentials('azure-sp-wonderlearn')
  SONAR_TOKEN=credentials('sonarqube-token')
 }
 stages {
  stage('Checkout'){steps{checkout scm; script{env.GIT_SHA=sh(script:'git rev-parse --short HEAD',returnStdout:true).trim(); env.FE_IMAGE="${params.ACR_NAME}.azurecr.io/wonderlearn-frontend:${env.GIT_SHA}";env.BE_IMAGE="${params.ACR_NAME}.azurecr.io/wonderlearn-backend:${env.GIT_SHA}"}}}
  stage('Install and Build'){parallel{
   stage('Frontend'){steps{dir('client'){sh 'npm ci && npm run build'}}}
   stage('Backend'){steps{dir('server'){sh 'npm ci && node --check src/index.js && node --check src/auth.js && node --check src/models.js'}}}
  }}
  stage('Dependency Audit'){steps{sh 'mkdir -p reports/frontend reports/backend; (cd client && npm audit --json > ../reports/frontend/npm-audit.json || true); (cd server && npm audit --json > ../reports/backend/npm-audit.json || true)'}}
  stage('Gitleaks'){steps{sh 'mkdir -p reports; gitleaks detect --source . --no-banner --redact --report-format json --report-path reports/gitleaks.json'} }
  stage('SonarQube'){steps{withSonarQubeEnv('sonarqube'){sh 'sonar-scanner -Dsonar.token=$SONAR_TOKEN'}}}
  stage('Quality Gate'){steps{timeout(time:10,unit:'MINUTES'){waitForQualityGate abortPipeline:true}}}
  stage('Build Images'){steps{sh 'docker build --build-arg GIT_SHA=$GIT_SHA -t $FE_IMAGE client; docker build -t $BE_IMAGE server'}}
  stage('Trivy'){steps{sh '''mkdir -p reports/trivy
   trivy fs --format json -o reports/trivy/filesystem.json . || true
   trivy image --format json -o reports/trivy/frontend.json $FE_IMAGE || true
   trivy image --format json -o reports/trivy/backend.json $BE_IMAGE || true
   trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed $FE_IMAGE
   trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed $BE_IMAGE'''}}
  stage('Azure Login and Push'){steps{sh '''set +x
   az login --service-principal -u "$AZURE_CREDS_USR" -p "$AZURE_CREDS_PSW" --tenant "$AZURE_TENANT_ID" >/dev/null
   az account set --subscription "$AZURE_SUBSCRIPTION_ID"
   az acr login -n "$ACR_NAME"
   docker push "$FE_IMAGE"; docker push "$BE_IMAGE"'''}}
  stage('Deploy Dev'){steps{sh '''RG=rg-wonderlearn-dev; FE=app-wonderlearn-frontend-dev-${UNIQUE_SUFFIX}; API=app-wonderlearn-api-dev-${UNIQUE_SUFFIX}
   az webapp config container set -g $RG -n $API --container-image-name "$BE_IMAGE" --container-registry-url "https://${ACR_NAME}.azurecr.io"
   az webapp config appsettings set -g $RG -n $API --settings APP_VERSION=$GIT_SHA
   az webapp config container set -g $RG -n $FE --container-image-name "$FE_IMAGE" --container-registry-url "https://${ACR_NAME}.azurecr.io"
   az webapp restart -g $RG -n $API; az webapp restart -g $RG -n $FE
   ./scripts/smoke-test.sh https://${FE}.azurewebsites.net https://${API}.azurewebsites.net
   ./scripts/zap-scan.sh https://${FE}.azurewebsites.net'''}}
  stage('Production Approval'){when{expression{return params.DEPLOY_PROD}}steps{timeout(time:15,unit:'MINUTES'){input message:'Deploy WonderLearn to Production?',ok:'Deploy'}}}
  stage('Deploy Prod'){when{expression{return params.DEPLOY_PROD}}steps{sh '''RG=rg-wonderlearn-prod; FE=app-wonderlearn-frontend-prod-${UNIQUE_SUFFIX}; API=app-wonderlearn-api-prod-${UNIQUE_SUFFIX}
   az webapp config container set -g $RG -n $API --container-image-name "$BE_IMAGE" --container-registry-url "https://${ACR_NAME}.azurecr.io"
   az webapp config appsettings set -g $RG -n $API --settings APP_VERSION=$GIT_SHA
   az webapp config container set -g $RG -n $FE --container-image-name "$FE_IMAGE" --container-registry-url "https://${ACR_NAME}.azurecr.io"
   az webapp restart -g $RG -n $API; az webapp restart -g $RG -n $FE
   ./scripts/smoke-test.sh https://${FE}.azurewebsites.net https://${API}.azurewebsites.net
   printf 'Git SHA: %s\nFrontend: %s\nBackend: %s\nTimestamp: %s\n' "$GIT_SHA" "$FE_IMAGE" "$BE_IMAGE" "$(date -Iseconds)" | tee reports/deployment/summary.txt'''}}
 }
 post { always { archiveArtifacts artifacts:'reports/**/*', allowEmptyArchive:true; junit testResults:'**/junit*.xml', allowEmptyResults:true } cleanup { cleanWs() } }
}
