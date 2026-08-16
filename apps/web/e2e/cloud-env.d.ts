declare namespace NodeJS {
  interface ProcessEnv {
    CLOUD_BASE_URL?: string;
    CLOUD_TEST_EMAIL?: string;
    CLOUD_TEST_PASSWORD?: string;
    CLOUD_TEST_PEER_EMAIL?: string;
    CLOUD_TEST_PEER_PASSWORD?: string;
    CLOUD_TEST_OTHER_TENANT_EMAIL?: string;
    CLOUD_TEST_OTHER_TENANT_PASSWORD?: string;
    CLOUD_TEST_PERSONAL_EMAIL?: string;
    CLOUD_TEST_PERSONAL_PASSWORD?: string;
    GITHUB_RUN_ID?: string;
  }
}
