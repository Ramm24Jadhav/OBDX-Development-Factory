// Builds the OBDX Development Factory: the Oracle JET UI and the Spring Boot server, as one runnable jar.
// Needs a JDK 21, Maven and the Subversion client (svn, svnadmin) on the agent; Node.js is downloaded by the build
// (see node.download.root in pom.xml). Set FACTORY_TEST_DB_URL (plus FACTORY_TEST_DB_USER/PASSWORD) to a PostgreSQL
// test database with pgvector to also run the import-and-search integration test.
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
        stage('Download zip') {
            steps {
                // Start scripts, settings and demo code with the jar; see deploy/bundle/README.txt
                sh 'deploy/bundle/build-bundle.sh factory-server/target/obdx-factory.jar dist/obdx-factory.zip'
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'factory-server/target/surefire-reports/*.xml'
        }
        success {
            archiveArtifacts artifacts: 'factory-server/target/obdx-factory.jar, dist/obdx-factory.zip, deploy/*', fingerprint: true
        }
    }
}
