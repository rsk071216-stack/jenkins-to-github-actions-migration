// vars/deployToAks.groovy - legacy shared library step (the "before" state).
//
// Usage from a Jenkinsfile:
//   deployToAks(environment: 'staging', image: 'acmeprod.azurecr.io/app:42-abc1234', credentialsId: 'azure-sp-prod')
//
// Migration target: the deploy-staging / deploy-production jobs in
// .github/workflows/deploy.yml (OIDC login + signature verification gate).
//
// [PROBLEM] Long-lived service principal secret: the client secret lives in the
//           Jenkins credential store and is valid for every cluster it can reach.
//           GitHub Actions replaces this with OIDC federation (no secret at all).
// [PROBLEM] Cluster and resource group names are hard-coded in a Groovy map that
//           only the platform team can change; every new environment needs a
//           library release.
// [PROBLEM] Requires az CLI + kubectl to be pre-installed on the agent at
//           compatible versions ("snowflake agent").
// [PROBLEM] No verification that the image being deployed was built, scanned and
//           signed by the trusted pipeline.

def call(Map config = [:]) {
    def environment   = config.environment ?: error('deployToAks: environment is required')
    def image         = config.image ?: error('deployToAks: image is required')
    def credentialsId = config.credentialsId ?: 'azure-sp-prod'

    def clusters = [
        staging   : [resourceGroup: 'rg-apps-staging', cluster: 'aks-apps-staging', namespace: 'versioning'],
        production: [resourceGroup: 'rg-apps-prod',    cluster: 'aks-apps-prod',    namespace: 'versioning'],
    ]
    def target = clusters[environment]
    if (!target) {
        error("deployToAks: unknown environment '${environment}'")
    }

    withCredentials([azureServicePrincipal(credentialsId)]) {
        sh '''
            az login --service-principal -u "$AZURE_CLIENT_ID" -p "$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID" >/dev/null
            az account set --subscription "$AZURE_SUBSCRIPTION_ID"
        '''
        sh "az aks get-credentials --resource-group ${target.resourceGroup} --name ${target.cluster} --overwrite-existing"
        sh "kubectl -n ${target.namespace} set image deployment/versioning-service app=${image}"
        // [PROBLEM] Rollback is a manual runbook step; failure here just leaves
        // the rollout half-finished and pages someone.
        sh "kubectl -n ${target.namespace} rollout status deployment/versioning-service --timeout=5m"
    }
}
