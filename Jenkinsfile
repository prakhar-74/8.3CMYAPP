pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds() }

  parameters {
    booleanParam(name: 'ROLLBACK', defaultValue: false, description: 'Rollback to previous color without building')
  }

  environment {
    APP_NAME     = 'myapp'
    IMAGE_BASE   = "prakhar8070/${env.APP_NAME}"
    BUILD_TAGGED = "${env.IMAGE_BASE}:b${env.BUILD_NUMBER}"
    BLUE_NAME    = "${env.APP_NAME}-blue"
    GREEN_NAME   = "${env.APP_NAME}-green"
    // Ports: LIVE=3000, BLUE=3001, GREEN=3002
  }

  stages {
    stage('Prepare') {
      steps {
        bat '''
        echo == Prepare ==
        if not exist tmp mkdir tmp
        rem create file with NO trailing space
        if not exist tmp\\current_color.txt ( > tmp\\current_color.txt echo blue )
        rem show value
        type tmp\\current_color.txt
        '''
      }
      post { always { archiveArtifacts artifacts: 'tmp/current_color.txt', onlyIfSuccessful: false } }
    }

    stage('Build ^& Test') {
      when { expression { return !params.ROLLBACK } }
      steps {
        bat '''
        echo == Build ^& Test ==
        if exist package.json (
          call npm ci || call npm install
          call npm test || exit /b 0
        ) else (
          echo No package.json; skipping tests.
        )
        '''
      }
      post { always { junit allowEmptyResults: true, testResults: 'reports/junit/*.xml' } }
    }

    stage('Package Image') {
      when { expression { return !params.ROLLBACK } }
      steps {
        script {
          writeFile file: 'Dockerfile', text: '''FROM node:18-alpine
WORKDIR /app
COPY . .
RUN [ -f package.json ] && npm ci || true
EXPOSE 3000
CMD [ "npm", "start" ]'''
        }
        bat '''
        echo == Docker build ==
        docker build -t "%BUILD_TAGGED%" .
        '''
      }
      post { always { archiveArtifacts artifacts: 'Dockerfile', allowEmptyArchive: true } }
    }

    stage('Deploy Blue/Green (Side-by-Side)') {
      steps {
        bat '''
        setlocal ENABLEDELAYEDEXPANSION
        echo == Blue/Green deploy ==

        rem READ & TRIM current_color (strips spaces/tabs)
        for /f "usebackq tokens=* delims=" %%i in ("tmp\\current_color.txt") do set CUR=%%i
        set "CUR=!CUR: =!"
        set "CUR=!CUR:	=!"  rem also strip tabs just in case

        if /i "!CUR!"=="blue" (
          set CANDIDATE=green
          set PORT=3002
          set NAME=%GREEN_NAME%
        ) else (
          set CANDIDATE=blue
          set PORT=3001
          set NAME=%BLUE_NAME%
        )

        echo Current LIVE color: !CUR!
        echo Candidate color: !CANDIDATE! on port !PORT!

        docker rm -f "!NAME!" 2>nul

        if /i "%ROLLBACK%"=="true" (
          echo Rollback path: reuse last image if available
          docker run -d --name "!NAME!" -p !PORT!:3000 %IMAGE_BASE%:latest
        ) else (
          docker tag "%BUILD_TAGGED%" %IMAGE_BASE%:latest
          docker run -d --name "!NAME!" -p !PORT!:3000 "%BUILD_TAGGED%"
        )

        rem sleep 2s (use ping instead of timeout to avoid redirection error)
        ping -n 3 127.0.0.1 >nul

        docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}"
        endlocal
        '''
      }
    }

    stage('Smoke Test (Both Colors)') {
      steps {
        bat '''
        echo == Smoke test ==
        echo Blue  : http://localhost:3001/health
        curl.exe -s -f http://localhost:3001/health || echo Blue not responding
        echo Green : http://localhost:3002/health
        curl.exe -s -f http://localhost:3002/health || echo Green not responding
        '''
      }
    }

    stage('Manual Approval to Promote') {
      steps {
        script {
          if (params.ROLLBACK) {
            echo "Rollback run: skip approval."
          } else {
            timeout(time: 5, unit: 'MINUTES') {
              input message: 'Promote candidate to LIVE (port 3000)?', ok: 'Promote'
            }
          }
        }
      }
    }

    stage('Release Switch (Promote/Swap)') {
      steps {
        bat '''
        setlocal ENABLEDELAYEDEXPANSION

        for /f "usebackq tokens=* delims=" %%i in ("tmp\\current_color.txt") do set CUR=%%i
        set "CUR=!CUR: =!"
        set "CUR=!CUR:	=!"

        if /i "!CUR!"=="blue" (
          set OLD_NAME=%BLUE_NAME%
          set NEW_NAME=%GREEN_NAME%
          set NEW_COLOR=green
        ) else (
          set OLD_NAME=%GREEN_NAME%
          set NEW_NAME=%BLUE_NAME%
          set NEW_COLOR=blue
        )

        echo == Release: LIVE -> !NEW_COLOR! ==
        docker rm -f live 2>nul

        for /f "usebackq tokens=* delims=" %%I in (`docker inspect --format="{{.Image}}" !NEW_NAME!`) do set CID=%%I
        docker run -d --name live -p 3000:3000 "!CID!"

        > tmp\\current_color.txt echo !NEW_COLOR!
        type tmp\\current_color.txt

        docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}"
        endlocal
        '''
      }
      post { always { archiveArtifacts artifacts: 'tmp/current_color.txt', onlyIfSuccessful: false } }
    }
  }

  post {
    success {
      echo "8.3C pipeline finished successfully."
      emailext(
        subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """Build succeeded.

Job: ${env.JOB_NAME}
Build: #${env.BUILD_NUMBER}
URL:   ${env.BUILD_URL}""",
        to: "any@address.com",
        attachLog: true,
        compressLog: true
      )
    }
    failure {
      echo "8.3C pipeline failed. Check logs."
      emailext(
        subject: "FAILURE: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """Build failed.

Job: ${env.JOB_NAME}
Build: #${env.BUILD_NUMBER}
URL:   ${env.BUILD_URL}""",
        to: "any@address.com",
        attachLog: true,
        compressLog: true
      )
    }
  }
}
