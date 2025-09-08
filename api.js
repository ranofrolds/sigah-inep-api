const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const downloadINEP = require('./download-inep');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Cache em memória para armazenar dados das escolas
let escolasCache = new Map();
let ultimaAtualizacao = null;
let caminhoUltimoCSV = null;

// Função para carregar CSV no cache
async function carregarCSVNoCache(caminhoArquivo) {
  return new Promise((resolve, reject) => {
    const escolas = new Map();
    
    fs.createReadStream(caminhoArquivo)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim()
      }))
      .on('data', (row) => {
        const codigoINEP = row['Código INEP'];
        if (codigoINEP) {
          // Limpar e formatar dados
          const escola = {
            codigoINEP: codigoINEP.trim(),
            restricaoAtendimento: row['Restrição de Atendimento']?.trim() || null,
            nome: row['Escola']?.trim() || null,
            uf: row['UF']?.trim() || null,
            municipio: row['Município']?.trim() || null,
            localizacao: row['Localização']?.trim() || null,
            localidadeDiferenciada: row['Localidade Diferenciada']?.trim() || null,
            categoriaAdministrativa: row['Categoria Administrativa']?.trim() || null,
            endereco: row['Endereço']?.trim() || null,
            telefone: row['Telefone']?.trim() || null,
            dependenciaAdministrativa: row['Dependência Administrativa']?.trim() || null,
            categoriaEscolaPrivada: row['Categoria Escola Privada']?.trim() || null,
            conveniadaPoderPublico: row['Conveniada Poder Público']?.trim() || null,
            regulamentacao: row['Regulamentação pelo Conselho de Educação']?.trim() || null,
            porte: row['Porte da Escola']?.trim() || null,
            etapasModalidades: row['Etapas e Modalidade de Ensino Oferecidas']?.trim() || null,
            outrasOfertas: row['Outras Ofertas Educacionais']?.trim() || null,
            latitude: row['Latitude']?.trim() || null,
            longitude: row['Longitude']?.trim() || null
          };
          escolas.set(codigoINEP.trim(), escola);
        }
      })
      .on('end', () => {
        console.log(`✅ ${escolas.size} escolas carregadas no cache`);
        resolve(escolas);
      })
      .on('error', (error) => {
        console.error('❌ Erro ao ler CSV:', error);
        reject(error);
      });
  });
}

// Função para carregar o CSV mais recente ao iniciar
async function carregarCSVMaisRecente() {
  try {
    const downloadPath = './downloads';
    
    if (!fs.existsSync(downloadPath)) {
      console.log('📁 Pasta de downloads não encontrada');
      return false;
    }
    
    // Buscar arquivos CSV na pasta
    const arquivos = fs.readdirSync(downloadPath)
      .filter(file => file.endsWith('.csv'))
      .map(file => ({
        nome: file,
        caminho: path.join(downloadPath, file),
        dataModificacao: fs.statSync(path.join(downloadPath, file)).mtime
      }))
      .sort((a, b) => b.dataModificacao - a.dataModificacao);
    
    if (arquivos.length === 0) {
      console.log('⚠️ Nenhum arquivo CSV encontrado');
      return false;
    }
    
    // Carregar o arquivo mais recente
    const arquivoMaisRecente = arquivos[0];
    console.log(`📂 Carregando arquivo: ${arquivoMaisRecente.nome}`);
    
    escolasCache = await carregarCSVNoCache(arquivoMaisRecente.caminho);
    caminhoUltimoCSV = arquivoMaisRecente.caminho;
    ultimaAtualizacao = arquivoMaisRecente.dataModificacao;
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao carregar CSV:', error);
    return false;
  }
}

// Rotas

// Rota principal - informações da API
app.get('/', (req, res) => {
  res.json({
    nome: 'API INEP - Catálogo de Escolas',
    versao: '1.0.0',
    endpoints: {
      'GET /': 'Informações da API',
      'GET /api/status': 'Status do sistema',
      'POST /api/atualizar-base': 'Baixa novo catálogo do INEP',
      'GET /api/escola/:codigoInep': 'Busca escola por código INEP',
      'GET /api/escolas': 'Lista todas as escolas (com paginação)',
      'GET /api/escolas/buscar': 'Busca escolas por nome ou município'
    },
    totalEscolas: escolasCache.size,
    ultimaAtualizacao: ultimaAtualizacao
  });
});

// Status do sistema
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    escolasCarregadas: escolasCache.size,
    ultimaAtualizacao: ultimaAtualizacao,
    caminhoArquivo: caminhoUltimoCSV
  });
});

// Endpoint para atualizar base de dados
app.post('/api/atualizar-base', async (req, res) => {
  try {
    console.log('🔄 Iniciando atualização da base de dados...');
    
    // Baixar novo CSV
    const novoCaminhoCSV = await downloadINEP();
    
    // Carregar novo CSV no cache
    escolasCache = await carregarCSVNoCache(novoCaminhoCSV);
    caminhoUltimoCSV = novoCaminhoCSV;
    ultimaAtualizacao = new Date();
    
    res.json({
      sucesso: true,
      mensagem: 'Base de dados atualizada com sucesso',
      arquivo: novoCaminhoCSV,
      totalEscolas: escolasCache.size,
      dataAtualizacao: ultimaAtualizacao
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar base:', error);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao atualizar base de dados',
      detalhes: error.message
    });
  }
});

// Endpoint para buscar escola por código INEP
app.get('/api/escola/:codigoInep', (req, res) => {
  const { codigoInep } = req.params;
  
  if (!escolasCache.size) {
    return res.status(503).json({
      erro: 'Base de dados não carregada',
      mensagem: 'Use o endpoint POST /api/atualizar-base para carregar os dados'
    });
  }
  
  const escola = escolasCache.get(codigoInep);
  
  if (!escola) {
    return res.status(404).json({
      erro: 'Escola não encontrada',
      codigoInep: codigoInep
    });
  }
  
  res.json({
    sucesso: true,
    escola: escola
  });
});

// Endpoint adicional: listar todas as escolas com paginação
app.get('/api/escolas', (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = parseInt(req.query.limite) || 100;
  const inicio = (pagina - 1) * limite;
  const fim = inicio + limite;
  
  if (!escolasCache.size) {
    return res.status(503).json({
      erro: 'Base de dados não carregada',
      mensagem: 'Use o endpoint POST /api/atualizar-base para carregar os dados'
    });
  }
  
  const escolasArray = Array.from(escolasCache.values());
  const escolasPaginadas = escolasArray.slice(inicio, fim);
  
  res.json({
    sucesso: true,
    total: escolasCache.size,
    pagina: pagina,
    limite: limite,
    totalPaginas: Math.ceil(escolasCache.size / limite),
    escolas: escolasPaginadas
  });
});

// Endpoint adicional: buscar escolas por nome ou município
app.get('/api/escolas/buscar', (req, res) => {
  const { nome, municipio, uf } = req.query;
  
  if (!escolasCache.size) {
    return res.status(503).json({
      erro: 'Base de dados não carregada',
      mensagem: 'Use o endpoint POST /api/atualizar-base para carregar os dados'
    });
  }
  
  let resultados = Array.from(escolasCache.values());
  
  if (nome) {
    const termoBusca = nome.toLowerCase();
    resultados = resultados.filter(escola => 
      escola.nome && escola.nome.toLowerCase().includes(termoBusca)
    );
  }
  
  if (municipio) {
    const termoMunicipio = municipio.toLowerCase();
    resultados = resultados.filter(escola => 
      escola.municipio && escola.municipio.toLowerCase().includes(termoMunicipio)
    );
  }
  
  if (uf) {
    const termoUF = uf.toUpperCase();
    resultados = resultados.filter(escola => 
      escola.uf === termoUF
    );
  }
  
  res.json({
    sucesso: true,
    total: resultados.length,
    parametros: { nome, municipio, uf },
    escolas: resultados.slice(0, 1000) // Limitar a 1000 resultados
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    erro: 'Endpoint não encontrado',
    mensagem: 'Verifique a documentação em GET /'
  });
});

// Inicializar servidor
async function iniciarServidor() {
  console.log('🚀 Iniciando API INEP...\n');
  
  // Tentar carregar CSV existente
  const csvCarregado = await carregarCSVMaisRecente();
  
  if (!csvCarregado) {
    console.log('⚠️ Nenhum CSV carregado. Use POST /api/atualizar-base para baixar os dados.\n');
  }
  
  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`📍 Acesse: http://localhost:${PORT}`);
    console.log(`📊 Escolas carregadas: ${escolasCache.size}\n`);
  });
}

// Executar servidor
iniciarServidor().catch(error => {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
});

module.exports = app;