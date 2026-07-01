/* eslint-disable import/prefer-default-export */
export const CONFIG = {
  prod: {
    streamMapper: {
      serviceEP: 'https://adobe-acom-stream-service-deploy-ethos501-prod-or2-ab8ae6.cloud.adobe.io',
    },
  },
  stage: {
    streamMapper: {
      serviceEP: 'https://adobe-acom-stream-service-deploy-ethos501-prod-or2-d587ab.cloud.adobe.io',
    },
  },
  dev: {
    streamMapper: {
      serviceEP: 'http://localhost:8081',
    },
  },
};
