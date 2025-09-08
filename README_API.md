# API RESTful - Catálogo de Escolas INEP

API para consulta e atualização do catálogo de escolas do INEP.

## Instalação

```bash
npm install
```

## Execução

```bash
# Iniciar a API
npm start
# ou
npm run api

# Baixar dados do INEP manualmente
npm run download
```

## Endpoints

### Informações da API
```
GET /
```

### Status do Sistema
```
GET /api/status
```

### Atualizar Base de Dados
```
POST /api/atualizar-base
```
Baixa um novo catálogo do site do INEP e atualiza o cache.

### Buscar Escola por Código INEP
```
GET /api/escola/:codigoInep
```

Exemplo:
```bash
curl http://localhost:3000/api/escola/11000023
```

### Listar Escolas (com paginação)
```
GET /api/escolas?pagina=1&limite=100
```

### Buscar Escolas
```
GET /api/escolas/buscar?nome=adventista&municipio=porto&uf=RO
```

Parâmetros opcionais:
- `nome`: busca no nome da escola
- `municipio`: busca por município
- `uf`: filtra por estado (sigla)

## Exemplos de Uso

### Buscar escola específica
```javascript
fetch('http://localhost:3000/api/escola/11000023')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Atualizar base de dados
```javascript
fetch('http://localhost:3000/api/atualizar-base', { method: 'POST' })
  .then(res => res.json())
  .then(data => console.log(data));
```

## Formato de Resposta

### Sucesso
```json
{
  "sucesso": true,
  "escola": {
    "codigoINEP": "11000023",
    "nome": "EEEE ABNAEL MACHADO DE LIMA - CENE",
    "uf": "RO",
    "municipio": "Porto Velho",
    "endereco": "AVENIDA AMAZONAS, 6492...",
    ...
  }
}
```

### Erro
```json
{
  "erro": "Escola não encontrada",
  "codigoInep": "99999999"
}
```

## Porta

A API roda na porta 3000 por padrão. Configure com a variável de ambiente `PORT` se necessário.

```bash
PORT=8080 npm start
```