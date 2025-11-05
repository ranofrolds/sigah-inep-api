# API INEP - Catálogo de Escolas

API RESTful (base path `/inep-api`) para consulta do catálogo de escolas do INEP.

## Estrutura do Projeto

```
inep_auto/
├── src/
│   ├── config.js           # Configurações centralizadas
│   ├── services/
│   │   ├── scraper.js      # Download do INEP
│   │   └── schools.js      # Lógica de escolas e CSV
│   ├── routes/
│   │   └── schools.js      # Rotas da API
│   └── server.js           # Servidor Express
├── data/
│   └── downloads/          # CSVs baixados
├── .env                    # Variáveis de ambiente
└── package.json
```

## Instalação

```bash
npm install
```

## Configuração

Copie `.env` e ajuste as variáveis se necessário:

```bash
NODE_ENV=development
PORT=3000
HEADLESS=true
```

## Execução

```bash
# Iniciar API
npm start

# Modo desenvolvimento  
npm run dev

# Baixar dados apenas (sem API)
npm run scraper
```

## Endpoints

### Informações da API
```
GET /inep-api
```

### Status do Sistema
```
GET /inep-api/status
```

### Atualizar Base de Dados
```
POST /inep-api/atualizar
```

### Buscar Escola por Código
```
GET /inep-api/escola/:codigo
```

### Listar Escolas
```
GET /inep-api/escolas?pagina=1&limite=100
```

### Buscar Escolas por Filtros
```
GET /inep-api/buscar?nome=adventista&uf=RO&municipio=porto
```

## Exemplos

```bash
# Buscar escola específica
curl http://localhost:3000/inep-api/escola/11000023

# Atualizar base
curl -X POST http://localhost:3000/inep-api/atualizar

# Buscar por nome
curl "http://localhost:3000/inep-api/buscar?nome=adventista&uf=RO"
```

## Recursos

### 📁 Gerenciamento de Arquivos
- Mantém apenas 2 arquivos: `current.csv` + `backup.csv`
- Limpeza automática de arquivos antigos
- Migração automática na inicialização

### ⏰ Download Automático
- Agendamento diário às 00:00 (configurável)
- Backup automático antes de atualizar
- Reload automático dos dados
