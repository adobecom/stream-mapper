/* eslint-disable import/prefer-default-export */
export const CONFIG = {
  prod: {
    peregrineMapper: {
      serviceEP: 'https://adobe-acom-peregrine-service-deploy-ethos501-prod-or2-ab8ae6.cloud.adobe.io',
    },
  },
  stage: {
    peregrineMapper: {
      serviceEP: 'https://adobe-acom-peregrine-service-deploy-ethos501-prod-or2-d587ab.cloud.adobe.io',
    },
  },
  dev: {
    peregrineMapper: {
      serviceEP: 'http://localhost:8081',
    },
  },
};
