pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 90, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        skipDefaultCheckout(true)
    }

    parameters {
        string(name: 'UNIQUE_SUFFIX', defaultValue: 'sk85wl2', description: 'Azure resource suffix')
        string(name: 'ACR_NAME', defaultValue: 'acrwonderlearnsk85wl2', description: 'Azure Container Registry name')
        string(name: 'AZURE_SUBSCRIPTION_ID', defaultValue: '8552b586-7d42-4691-a9f0-beae626f7dbe', description: 'Azure subscription ID')
        string(name: 'AZURE_TENANT_ID', defaultValue: 'cc85c2c8-5397-4c5a-9240-a43fbb66bd6e', description: 'Azure tenant ID')
        booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarCloud analysis')
        booleanParam(name: 'BLOCK_CRITICAL_TRIVY', defaultValue: false, description: 'Fail on CRITICAL Trivy findings')
        booleanParam(name: 'RUN_ZAP', defaultValue: false, description: 'Run OWASP ZAP against Dev')
        booleanParam(name: 'DEPLOY_PROD', defaultValue: true, description: 'Request production approval and deployment')
    }

    environment {
        AZURE_SP_CREDENTIAL_ID = 'azure-sp-wonderlearn'
        SONARCLOUD_CREDENTIAL_ID = 'sonarcloud-token'
        REPORTS_DIR = 'reports'
        TRIVY_CACHE_DIR = '/var/jenkins_home/.cache/trivy'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.ACR_LOGIN_SERVER = "${params.ACR_NAME}.azurecr.io"
                    env.FE_IMAGE = "${env.ACR_LOGIN_SERVER}/wonderlearn-frontend:${env.GIT_SHA}"
                    env.BE_IMAGE = "${env.ACR_LOGIN_SERVER}/wonderlearn-backend:${env.GIT_SHA}"
                    env.DEV_FE = "app-wonderlearn-frontend-dev-${params.UNIQUE_SUFFIX}"
                    env.DEV_API = "app-wonderlearn-api-dev-${params.UNIQUE_SUFFIX}"
                    env.PROD_FE = "app-wonderlearn-frontend-prod-${params.UNIQUE_SUFFIX}"
                    env.PROD_API = "app-wonderlearn-api-prod-${params.UNIQUE_SUFFIX}"
                }
                sh '''
                    set -eu
                    mkdir -p reports/frontend reports/backend reports/trivy reports/zap reports/deployment
                '''
            }
        }

        stage('Install, Test and Build') {
            parallel {
                stage('Frontend') {
                    steps {
                        dir('client') {
                            sh '''
                                set -eu
                                npm ci
                                if npm run | grep -qE '^[[:space:]]+lint$'; then npm run lint; fi
                                if npm run | grep -qE '^[[:space:]]+test$'; then npm test -- --run; fi
                                if npm run | grep -qE '^[[:space:]]+test:coverage$'; then npm run test:coverage; fi
                                npm run build
                            '''
                        }
                    }
                }
                stage('Backend') {
                    steps {
                        dir('server') {
                            sh '''
                                set -eu
                                npm ci
                                if npm run | grep -qE '^[[:space:]]+lint$'; then npm run lint; fi
                                if npm run | grep -qE '^[[:space:]]+test$'; then npm test -- --runInBand; fi
                                if npm run | grep -qE '^[[:space:]]+test:coverage$'; then npm run test:coverage; fi
                                node --check src/index.js
                                node --check src/auth.js
                                node --check src/models.js
                            '''
                        }
                    }
                }
            }
        }

        stage('Dependency Audit') {
            steps {
                sh '''
                    set +e
                    (cd client && npm audit --json > ../reports/frontend/npm-audit.json)
                    (cd server && npm audit --json > ../reports/backend/npm-audit.json)
                    set -e
                '''
            }
        }

        stage('Gitleaks') {
            steps {
                sh '''
                    set -eu
                    docker run --rm \
                      --volumes-from jenkins \
                      --workdir "$WORKSPACE" \
                      zricethezav/gitleaks:v8.24.2 \
                      detect \
                      --source="$WORKSPACE" \
                      --no-banner \
                      --redact \
                      --report-format=json \
                      --report-path="$WORKSPACE/reports/gitleaks.json"
                '''
            }
        }

        stage('SonarCloud Analysis') {
            when {
                expression { return params.RUN_SONAR }
            }
            steps {
                withCredentials([
                    string(credentialsId: "${SONARCLOUD_CREDENTIAL_ID}", variable: 'SONAR_TOKEN')
                ]) {
                    timeout(time: 12, unit: 'MINUTES') {
                        sh '''
                            set -eu
                            set +x
                            export SONAR_SCANNER_OPTS="-Xmx1024m"
                            export NODE_OPTIONS="--max-old-space-size=1024"
                            sonar-scanner \
                              -Dsonar.host.url=https://sonarcloud.io \
                              -Dsonar.token="$SONAR_TOKEN" \
                              -Dsonar.javascript.node.maxspace=1024
                            set -x
                        '''
                    }
                }
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    set -eu
                    docker build --pull --build-arg GIT_SHA="$GIT_SHA" -t "$FE_IMAGE" client
                    docker build --pull --build-arg GIT_SHA="$GIT_SHA" -t "$BE_IMAGE" server
                '''
            }
        }

        stage('Trivy Scans') {
            steps {
                script {
                    sh '''
                        set -eu
                        mkdir -p "$TRIVY_CACHE_DIR"
                        trivy fs --cache-dir "$TRIVY_CACHE_DIR" --skip-version-check --scanners vuln,secret --format json --output reports/trivy/filesystem.json . || true
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --skip-version-check --scanners vuln --format json --output reports/trivy/frontend.json "$FE_IMAGE" || true
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --skip-version-check --scanners vuln --format json --output reports/trivy/backend.json "$BE_IMAGE" || true
                    '''
                    if (params.BLOCK_CRITICAL_TRIVY) {
                        sh '''
                            set -eu
                            trivy image --cache-dir "$TRIVY_CACHE_DIR" --skip-version-check --scanners vuln --exit-code 1 --severity CRITICAL --ignore-unfixed "$FE_IMAGE"
                            trivy image --cache-dir "$TRIVY_CACHE_DIR" --skip-version-check --scanners vuln --exit-code 1 --severity CRITICAL --ignore-unfixed "$BE_IMAGE"
                        '''
                    } else {
                        echo 'Trivy CRITICAL gate is non-blocking for this run.'
                    }
                }
            }
        }

        stage('Azure Login and Push') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: "${AZURE_SP_CREDENTIAL_ID}",
                        usernameVariable: 'AZURE_CLIENT_ID',
                        passwordVariable: 'AZURE_CLIENT_SECRET'
                    )
                ]) {
                    sh '''
                        set -eu
                        set +x
                        test -n "$AZURE_CLIENT_ID"
                        test -n "$AZURE_CLIENT_SECRET"
                        test -n "$AZURE_TENANT_ID"
                        test -n "$AZURE_SUBSCRIPTION_ID"
                        az login --service-principal --username "$AZURE_CLIENT_ID" --password "$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID" --output none
                        az account set --subscription "$AZURE_SUBSCRIPTION_ID"
                        az acr login --name "$ACR_NAME"
                        set -x
                        docker push "$FE_IMAGE"
                        docker push "$BE_IMAGE"
                    '''
                }
            }
        }

        stage('Deploy Dev') {
            steps {
                sh '''
                    set -eu
                    RG="rg-wonderlearn-dev"
                    FE_URL="https://${DEV_FE}.azurewebsites.net"
                    API_URL="https://${DEV_API}.azurewebsites.net"

                    az webapp config container set --resource-group "$RG" --name "$DEV_API" --container-image-name "$BE_IMAGE" --container-registry-url "https://${ACR_LOGIN_SERVER}" --output none
                    az webapp config appsettings set --resource-group "$RG" --name "$DEV_API" --settings APP_VERSION="$GIT_SHA" --output none
                    az webapp config container set --resource-group "$RG" --name "$DEV_FE" --container-image-name "$FE_IMAGE" --container-registry-url "https://${ACR_LOGIN_SERVER}" --output none
                    az webapp config appsettings set --resource-group "$RG" --name "$DEV_FE" --settings API_BASE_URL="${API_URL}/api" --output none

                    az webapp restart --resource-group "$RG" --name "$DEV_API"
                    az webapp restart --resource-group "$RG" --name "$DEV_FE"
                    sleep 20

                    sh ./scripts/smoke-test.sh "$FE_URL" "$API_URL"

                    printf '%s\n' \
                      "environment=dev" \
                      "git_sha=$GIT_SHA" \
                      "frontend_image=$FE_IMAGE" \
                      "backend_image=$BE_IMAGE" \
                      "frontend_url=$FE_URL" \
                      "backend_url=$API_URL" \
                      "timestamp=$(date -Iseconds)" \
                      > reports/deployment/dev-summary.txt
                '''
                script {
                    if (params.RUN_ZAP) {
                        sh '''
                            set +e
                            sh ./scripts/zap-scan.sh "https://${DEV_FE}.azurewebsites.net"
                            ZAP_EXIT=$?
                            set -e
                            if [ "$ZAP_EXIT" -ne 0 ]; then echo "ZAP completed with warnings; continuing."; fi
                        '''
                    } else {
                        echo 'OWASP ZAP skipped for this run.'
                    }
                }
            }
        }

        stage('Production Approval') {
            when {
                expression { return params.DEPLOY_PROD }
            }
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    input message: 'Deploy WonderLearn to Production?', ok: 'Deploy'
                }
            }
        }

        stage('Deploy Prod') {
            when {
                expression { return params.DEPLOY_PROD }
            }
            steps {
                sh '''
                    set -eu
                    RG="rg-wonderlearn-prod"
                    FE_URL="https://${PROD_FE}.azurewebsites.net"
                    API_URL="https://${PROD_API}.azurewebsites.net"

                    az webapp config container set --resource-group "$RG" --name "$PROD_API" --container-image-name "$BE_IMAGE" --container-registry-url "https://${ACR_LOGIN_SERVER}" --output none
                    az webapp config appsettings set --resource-group "$RG" --name "$PROD_API" --settings APP_VERSION="$GIT_SHA" --output none
                    az webapp config container set --resource-group "$RG" --name "$PROD_FE" --container-image-name "$FE_IMAGE" --container-registry-url "https://${ACR_LOGIN_SERVER}" --output none
                    az webapp config appsettings set --resource-group "$RG" --name "$PROD_FE" --settings API_BASE_URL="${API_URL}/api" --output none

                    az webapp restart --resource-group "$RG" --name "$PROD_API"
                    az webapp restart --resource-group "$RG" --name "$PROD_FE"
                    sleep 20

                    sh ./scripts/smoke-test.sh "$FE_URL" "$API_URL"

                    printf '%s\n' \
                      "environment=prod" \
                      "git_sha=$GIT_SHA" \
                      "frontend_image=$FE_IMAGE" \
                      "backend_image=$BE_IMAGE" \
                      "frontend_url=$FE_URL" \
                      "backend_url=$API_URL" \
                      "timestamp=$(date -Iseconds)" \
                      > reports/deployment/prod-summary.txt
                '''
            }
        }

        stage('Deployment Summary') {
            steps {
                sh '''
                    set -eu
                    {
                      echo "WonderLearn deployment"
                      echo "Git SHA: $GIT_SHA"
                      echo "Frontend image: $FE_IMAGE"
                      echo "Backend image: $BE_IMAGE"
                      echo "Dev frontend: https://${DEV_FE}.azurewebsites.net"
                      echo "Dev backend: https://${DEV_API}.azurewebsites.net"
                      echo "Prod requested: ${DEPLOY_PROD}"
                      echo "Timestamp: $(date -Iseconds)"
                    } | tee reports/deployment/summary.txt
                '''
            }
        }
    }

    post {
        success {
            echo "WonderLearn pipeline completed successfully for ${env.GIT_SHA}."
        }
        unstable {
            echo 'Pipeline completed with non-blocking warnings.'
        }
        failure {
            echo 'Pipeline failed. Review the failed stage and archived reports.'
        }
        always {
            archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true, fingerprint: true
            junit testResults: '**/junit*.xml', allowEmptyResults: true
            sh 'az logout >/dev/null 2>&1 || true'
        }
        cleanup {
            cleanWs()
        }
    }
}
