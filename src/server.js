const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const schoolRoutes = require('./routes/schools');
const schoolService = require('./services/schools');
const scheduler = require('./services/scheduler');
const config = require('./config');
const swaggerSpec = require('./docs/swagger');

const API_BASE_PATH = '/api';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'API INEP Docs'
}));

app.get('/docs.json', (req, res) => {
  res.json(swaggerSpec);
});

app.use(API_BASE_PATH, schoolRoutes);

app.get('/', (req, res) => {
  res.redirect(`${API_BASE_PATH}/`);
});

app.use((req, res) => {
  res.status(404).json({
    erro: 'Endpoint não encontrado',
    mensagem: `Consulte GET ${API_BASE_PATH} ou a documentacao Swagger em /docs`
  });
});

app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    erro: 'Erro interno do servidor',
    mensagem: 'Algo deu errado'
  });
});

async function startServer() {
  console.log('🚀 Iniciando API INEP...');
  
  const dataLoaded = await schoolService.loadLatestFile();
  
  if (!dataLoaded) {
    console.log('⚠️ Nenhum CSV carregado. Use POST /atualizar para baixar os dados.\n');
  }

  scheduler.start();
  
  app.listen(config.port, () => {
    console.log(`✅ Servidor rodando na porta ${config.port}`);
    console.log(`📍 Acesse: http://localhost:${config.port}${API_BASE_PATH}`);
    console.log(`📘 Documentacao Swagger: http://localhost:${config.port}/docs`);
    console.log(`📊 Escolas carregadas: ${schoolService.getStats().totalSchools}`);
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  });
}

module.exports = app;
