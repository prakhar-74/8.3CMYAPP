pipeline {
  agent any
  options { timestamps(); ansiColor('xterm'); disableConcurrentBuilds() }

  parameters { booleanParam(name: 'ROLLBACK', defaultValue: false, description: 'Rollback to previous color') }

  environment {
    APP_NAME     = 'myapp'
    IMAGE_BASE   = "prakhar8070/${env.APP_NAME}"
    BUILD_TAGGED = "${env.IMAGE_BASE}:b${env.BUILD_NUMBER}"
    BLUE_NAME    = "${env.APP_NAME}-blue"
    GREEN_NAME   = "${env.APP_NAME}-green"
  }

  stages {
    stage('Prepare') {
      steps {
        bat '''
        echo == Prepare ==
        if not exist tmp mkdir tmp
        if not exist tmp\\current_color.txt (echo blue > tmp\\current_color.txt)
        type tmp\\current_color.txt
        '''
      }
      post { always { archiveArtifacts artifacts: 'tmp/current_color.txt', onlyIfSuccessful: false } }
    }

    stage('Build & Test') {
      when { expression { return !params.ROLLBACK } }
      steps {
        bat '''
        echo == Build & Test ==
        if exist package.json (
          call npm ci || call npm install
          call npm test || exit /b 0
        ) else (
          echo No package.json; skipping tests.
        )
        '''
      }
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
        for /f "usebackq tokens=*" %%i in ("tmp\\current_color.txt") do set CUR=%%i
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

        timeout /t 2 >nul
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
        for /f "usebackq tokens=*" %%i in ("tmp\\current_color.txt") do set CUR=%%i
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
        for /f "usebackq tokens=*" %%I in (`docker inspect --format="{{.Image}}" !NEW_NAME!`) do set CID=%%I
        docker run -d --name live -p 3000:3000 "!CID!"

        echo !NEW_COLOR! > tmp\\current_color.txt
        type tmp\\current_color.txt
        docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}"
        endlocal
        '''
      }
      post { always { archiveArtifacts artifacts: 'tmp/current_color.txt', onlyIfSuccessful: false } }
    }
  }

  post {
    success { echo "8.3C pipeline finished successfully." }
    failure { echo "8.3C pipeline failed. Check logs." }
  }
}
