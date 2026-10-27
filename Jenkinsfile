// Builds the OBDX Development Factory: the Oracle JET UI and the Spring Boot server, as one runnable jar.
// Needs a JDK 21 and Maven on the agent; Node.js is downloaded by the build (see node.download.root in pom.xml).
pipeline {
    agent any

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Build and test') {
            steps {
                sh 'mvn -B clean verify'
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'factory-server/target/surefire-reports/*.xml'
        }
        success {
            archiveArtifacts artifacts: 'factory-server/target/obdx-factory.jar, deploy/*', fingerprint: true
        }
    }
}
