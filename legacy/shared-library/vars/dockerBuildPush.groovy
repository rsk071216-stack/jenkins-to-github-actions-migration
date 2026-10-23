// vars/dockerBuildPush.groovy - legacy shared library step (the "before" state).
//
//   dockerBuildPush(image: 'acmeprod.azurecr.io/versioning-service', tag: env.IMAGE_TAG, context: 'app')
//
// Migration target: .github/workflows/reusable-container-build.yml
//
// [PROBLEM] Uses a static registry username/password from the credential store.
//           GitHub Actions pushes to GHCR with the short-lived, job-scoped
//           GITHUB_TOKEN, and to ACR/ECR through OIDC.
// [PROBLEM] No build cache between agents: every build starts cold.
// [PROBLEM] Produces no SBOM, signature or provenance attestation.

def call(Map config = [:]) {
    def image    = config.image ?: error('dockerBuildPush: image is required')
    def tag      = config.tag ?: env.BUILD_NUMBER
    def context  = config.context ?: '.'
    def credId   = config.credentialsId ?: 'acr-push'
    def registry = image.tokenize('/')[0]

    sh "docker build --pull -t ${image}:${tag} ${context}"
    withCredentials([usernamePassword(credentialsId: credId, usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
        sh "echo \"\$REG_PASS\" | docker login ${registry} -u \"\$REG_USER\" --password-stdin"
        sh "docker push ${image}:${tag}"
    }
    return "${image}:${tag}"
}
