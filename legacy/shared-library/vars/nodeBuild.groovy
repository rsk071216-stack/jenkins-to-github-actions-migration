// vars/nodeBuild.groovy - legacy shared library step (the "before" state).
//
// A whole-pipeline template that dozens of Node.js repositories call with
//   nodeBuild(nodeImage: 'node:22.23.3-bookworm-slim', sonarProjectKey: 'my-service')
//
// Migration target: .github/actions/node-test (composite action) for the
// steps, and .github/workflows/reusable-container-build.yml for the image.
//
// [PROBLEM] "God template": every team's pipeline is the same Groovy file, so a
//           change for one team is a change for all consuming jobs. There is no
//           versioning because consumers load '@master'.
// [PROBLEM] Runs on the controller's CPS interpreter: heavy Groovy logic here
//           slows down the controller for every other build.
// [PROBLEM] Behaviour depends on plugin versions installed on the controller
//           (docker-workflow, sonar, junit). Upgrading one plugin is a
//           change-advisory-board event.

def call(Map config = [:]) {
    def nodeImage  = config.nodeImage ?: 'node:22.23.3-bookworm-slim'
    def projectKey = config.sonarProjectKey ?: env.JOB_BASE_NAME
    def appDir     = config.appDir ?: 'app'

    docker.image(nodeImage).inside('-e HOME=/tmp -e NPM_CONFIG_UPDATE_NOTIFIER=false') {
        stage('Build') {
            dir(appDir) {
                sh 'npm install --no-audit --no-fund'
            }
        }
        stage('Unit Test') {
            try {
                dir(appDir) {
                    sh 'npm run test:ci'
                }
            } finally {
                junit "${appDir}/reports/junit.xml"
            }
        }
        if (!config.skipSonar) {
            stage('SonarQube Analysis') {
                withSonarQubeEnv('sonarqube-prod') {
                    sh "npx --yes sonar-scanner -Dsonar.projectKey=${projectKey} -Dsonar.sources=${appDir}/src"
                }
            }
        }
    }
}
