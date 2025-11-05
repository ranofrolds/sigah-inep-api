# Guia de uso - API INEP (Catalogo de Escolas)

Este guia apresenta os passos para instalar, executar e consumir a API que expone o catalogo de escolas do INEP. A documentacao interativa da API esta disponivel via Swagger em tempo de execucao.

## 1. Requisitos
- Node.js 18 ou superior (necessario pelo Playwright utilizado no processo de download)
- npm 9 ou superior
- Sistema operacional com suporte a Playwright (Windows, macOS ou Linux)

## 2. Instalacao
```bash
npm install
```

## 3. Configuracao opcional
Crie um arquivo `.env` na raiz, caso queira sobrescrever os padroes:
```bash
PORT=3000          # Porta HTTP da API
NODE_ENV=production
HEADLESS=true      # Define se o Playwright abre ou nao o navegador
DAILY_DOWNLOAD=true # Controla a execucao do agendamento diario
```

## 4. Execucao
```bash
# Executa o servidor Express e inicializa o cache de escolas
npm start

# Desenvolvimento (mesma entrada, mas util em ambientes com nodemon)
npm run dev

# Apenas baixa os dados do INEP e atualiza os CSVs (sem subir a API)
npm run scraper
```

Quando a API sobe com sucesso, o terminal mostra as URLs principais:
- `http://localhost:PORT/inep-api` para o resumo da API
- `http://localhost:PORT/inep-api/docs` para a interface Swagger
- `http://localhost:PORT/inep-api/docs.json` para baixar o documento OpenAPI

## 5. Documentacao via Swagger
1. Inicie o servidor (`npm start`).
2. Acesse `http://localhost:PORT/inep-api/docs` em seu navegador.
3. Utilize o botao **Try it out** para testar chamadas diretamente do navegador.
4. Para importar em outros clientes (Insomnia, Postman, Hoppscotch), utilize `http://localhost:PORT/inep-api/docs.json` como fonte OpenAPI.

## 6. Endpoints principais
| Metodo | Rota                | Descricao                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------- |
| GET    | `/inep-api`              | Resumo da API, versao e estatisticas de arquivos e escolas carregadas.   |
| GET    | `/inep-api/status`       | Status detalhado do cache, arquivos e agendamento de atualizacao.        |
| POST   | `/inep-api/atualizar`    | Dispara o download do catalogo do INEP e recarrega o cache na memoria.   |
| GET    | `/inep-api/escola/{codigo}` | Retorna uma escola pelo codigo INEP.                                  |
| GET    | `/inep-api/escolas`      | Lista escolas com paginacao (`pagina`, `limite`).                        |
| GET    | `/inep-api/buscar`       | Busca por filtros (`nome`, `municipio`, `uf`).                           |

### Parametros relevantes
- `pagina`: numero da pagina (padrao 1).
- `limite`: quantidade de registros por pagina (padrao 100, maximo 1000).
- `nome`: filtro parcial por nome de escola.
- `municipio`: filtro parcial por municipio.
- `uf`: sigla do estado em duas letras (ex.: SP).

## 7. Exemplos com curl
```bash
# Resumo da API
curl http://localhost:3000/inep-api

# Status completo
curl http://localhost:3000/inep-api/status

# Disparar atualizacao manual
curl -X POST http://localhost:3000/inep-api/atualizar

# Buscar uma escola pelo codigo INEP
curl http://localhost:3000/inep-api/escola/11000023

# Listar escolas com paginacao
curl "http://localhost:3000/inep-api/escolas?pagina=2&limite=50"

# Busca por filtros
curl "http://localhost:3000/inep-api/buscar?nome=adventista&uf=RO"
```

## 8. Estrutura das respostas
### Sucesso (exemplo de `GET /inep-api/escola/{codigo}`)
```json
{
  "escola": {
    "codigoINEP": "11000023",
    "nome": "EEEE ABNAEL MACHADO DE LIMA - CENE",
    "uf": "RO",
    "municipio": "Porto Velho"
  }
}
```

### Paginas (`GET /inep-api/escolas`)
```json
{
  "sucesso": true,
  "schools": [
    { "codigoINEP": "11000011", "nome": "Escola A", "uf": "RO" }
  ],
  "pagination": { "total": 34567, "page": 1, "limit": 100, "totalPages": 347 }
}
```

### Erros comuns
- **503 Base nao carregada**: carregue dados via `POST /inep-api/atualizar` antes de consultar escolas.
- **404 Escola nao encontrada**: codigo INEP inexistente na base carregada.
- **500 Erro interno**: consultar logs do servidor para detalhes.

## 9. Rotina de atualizacao automatica
- O agendamento diario (00:00 America/Sao_Paulo) executa a mesma logica de `POST /inep-api/atualizar`.
- O processo cria backup do CSV anterior e mantem apenas `current.csv` e `backup.csv`.
- Para desabilitar, defina `DAILY_DOWNLOAD=false` no `.env`.

## 10. Dicas finais
- Garanta que a pasta `data/downloads` seja gravavel; a aplicacao cria e atualiza os arquivos CSV nesse caminho.
- Para atualizar clientes externos, exporte o documento em `http://localhost:PORT/inep-api/docs.json`.
- Caso rode dentro de container, exponha a porta configurada em `PORT`.
