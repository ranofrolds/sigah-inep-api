require('dotenv').config();

const port = process.env.PORT || 3000;
const env = process.env.NODE_ENV || 'development';
const apiBasePath = process.env.API_BASE_PATH || '/api';
const apiPublicUrl =
  process.env.API_PUBLIC_URL
  || (env === 'production'
    ? 'https://sigah.uem.br/api'
    : `http://localhost:${port}${apiBasePath}`);

const config = {
  port,
  env,
  
  inep: {
    url: 'https://anonymousdata.inep.gov.br/analytics/saw.dll?Dashboard&PortalPath=%2Fshared%2FCenso%20da%20Educa%C3%A7%C3%A3o%20B%C3%A1sica%2F_portal%2FCat%C3%A1logo%20de%20Escolas&Page=Pr%C3%A9-Lista%20das%20Escolas',
    downloadPath: './data/downloads',
    headless: process.env.HEADLESS !== 'false'
  },

  api: {
    maxResultsPerPage: 1000,
    defaultPageSize: 100,
    version: '1.0.0',
    basePath: apiBasePath,
    publicUrl: apiPublicUrl
  }
};

module.exports = config;
