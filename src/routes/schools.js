const express = require('express');
const schoolService = require('../services/schools');
const scheduler = require('../services/scheduler');
const config = require('../config');

const router = express.Router();
const basePath = config.api.basePath || '/api';

router.get('/', (req, res) => {
  const stats = schoolService.getStats();

  res.json({
    nome: 'API INEP - Catalogo de Escolas',
    versao: config.api.version,
    endpoints: {
      [`GET ${basePath}`]: 'Informacoes da API',
      [`GET ${basePath}/status`]: 'Status do sistema',
      [`POST ${basePath}/atualizar`]: 'Baixa novo catalogo do INEP',
      [`GET ${basePath}/escola/:codigo`]: 'Busca escola por codigo INEP',
      [`GET ${basePath}/escolas`]: 'Lista escolas com paginacao',
      [`GET ${basePath}/buscar`]: 'Busca escolas por filtros'
    },
    ...stats
  });
});

router.get('/status', (req, res) => {
  const stats = schoolService.getStats();
  const schedulerStatus = scheduler.getStatus();

  res.json({
    status: 'online',
    escolasCarregadas: stats.totalSchools,
    ultimaAtualizacao: stats.lastUpdate,
    arquivo: stats.currentFile,
    arquivos: stats.files,
    scheduler: schedulerStatus
  });
});

router.post('/atualizar', async (req, res) => {
  try {
    await scheduler.runManualUpdate();

    res.json({
      sucesso: true,
      mensagem: 'Base de dados atualizada com sucesso',
      totalEscolas: schoolService.getStats().totalSchools,
      dataAtualizacao: new Date()
    });
  } catch (error) {
    console.error('Erro ao atualizar base:', error);
    res.status(500).json({
      erro: 'Erro ao atualizar base de dados',
      detalhes: error.message
    });
  }
});

router.get('/escola/:codigo', (req, res) => {
  const { codigo } = req.params;

  if (schoolService.isEmpty()) {
    return res.status(503).json({
      erro: 'Base de dados nao carregada',
      mensagem: `Use POST ${basePath}/atualizar para carregar os dados`
    });
  }

  const escola = schoolService.findByCode(codigo);

  if (!escola) {
    return res.status(404).json({
      erro: 'Escola nao encontrada',
      codigoInep: codigo
    });
  }

  res.json({ escola });
});

router.get('/escolas', (req, res) => {
  if (schoolService.isEmpty()) {
    return res.status(503).json({
      erro: 'Base de dados nao carregada',
      mensagem: `Use POST ${basePath}/atualizar para carregar os dados`
    });
  }

  const page = parseInt(req.query.pagina, 10) || 1;
  const limit = parseInt(req.query.limite, 10) || config.api.defaultPageSize;

  const result = schoolService.paginate(page, limit);

  res.json({
    sucesso: true,
    ...result
  });
});

router.get('/buscar', (req, res) => {
  if (schoolService.isEmpty()) {
    return res.status(503).json({
      erro: 'Base de dados nao carregada',
      mensagem: `Use POST ${basePath}/atualizar para carregar os dados`
    });
  }

  const filters = {
    nome: req.query.nome,
    municipio: req.query.municipio,
    uf: req.query.uf
  };

  const schools = schoolService.search(filters);

  res.json({
    sucesso: true,
    total: schools.length,
    filtros: filters,
    escolas: schools
  });
});

module.exports = router;
