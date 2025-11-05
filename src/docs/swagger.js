const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

const localServerUrl = `http://localhost:${config.port}${config.api.basePath || '/api'}`;
const primaryServerUrl = config.api.publicUrl || localServerUrl;

const servers = [
  {
    url: primaryServerUrl,
    description: 'Servidor principal'
  }
];

if (primaryServerUrl !== localServerUrl) {
  servers.push({
    url: localServerUrl,
    description: 'Servidor local'
  });
}

const swaggerDefinition = {
  openapi: '3.0.1',
  info: {
    title: 'API INEP - Catalogo de Escolas',
    version: config.api.version,
    description: [
      'Servicos HTTP para gerenciamento do catalogo de escolas do INEP.',
      'Permite consultar informacoes basicas, realizar buscas e acionar a atualizacao da base.'
    ].join(' ')
  },
  servers,
  tags: [
    { name: 'Status', description: 'Monitoramento da aplicacao e metadados' },
    { name: 'Escolas', description: 'Consultas ao catalogo de escolas carregado em memoria' },
    { name: 'Atualizacao', description: 'Rotas para atualizar a base de dados' }
  ],
  components: {
    schemas: {
      FileDetail: {
        type: 'object',
        properties: {
          exists: { type: 'boolean', example: true },
          size: { type: 'string', nullable: true, example: '12.45 MB' },
          mtime: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      FileCollection: {
        type: 'object',
        properties: {
          current: { $ref: '#/components/schemas/FileDetail' },
          backup: { $ref: '#/components/schemas/FileDetail' }
        }
      },
      ApiInfo: {
        type: 'object',
        properties: {
          nome: { type: 'string', example: 'API INEP - Catalogo de Escolas' },
          versao: { type: 'string', example: '1.0.0' },
          endpoints: {
            type: 'object',
            additionalProperties: { type: 'string' }
          },
          totalSchools: { type: 'integer', example: 34567 },
          lastUpdate: { type: 'string', format: 'date-time', nullable: true },
          currentFile: { type: 'string', nullable: true, example: './data/downloads/current.csv' },
          files: { $ref: '#/components/schemas/FileCollection' }
        }
      },
      StatusResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'online' },
          escolasCarregadas: { type: 'integer', example: 34567 },
          ultimaAtualizacao: { type: 'string', format: 'date-time', nullable: true },
          arquivo: { type: 'string', nullable: true, example: './data/downloads/current.csv' },
          arquivos: { $ref: '#/components/schemas/FileCollection' },
          scheduler: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              running: { type: 'boolean' },
              lastRun: { type: 'string', format: 'date-time', nullable: true },
              nextRun: { type: 'string', format: 'date-time', nullable: true },
              schedule: { type: 'string', example: '00:00 (diario)' }
            }
          }
        }
      },
      School: {
        type: 'object',
        properties: {
          codigoINEP: { type: 'string', example: '11000011' },
          restricaoAtendimento: { type: 'string', nullable: true },
          nome: { type: 'string', example: 'Escola Estadual Exemplo' },
          uf: { type: 'string', example: 'SP' },
          municipio: { type: 'string', example: 'Sao Paulo' },
          localizacao: { type: 'string', nullable: true, example: 'Urbana' },
          localidadeDiferenciada: { type: 'string', nullable: true },
          categoriaAdministrativa: { type: 'string', nullable: true },
          endereco: { type: 'string', nullable: true, example: 'Rua Exemplo, 123' },
          telefone: { type: 'string', nullable: true },
          dependenciaAdministrativa: { type: 'string', nullable: true },
          categoriaEscolaPrivada: { type: 'string', nullable: true },
          conveniadaPoderPublico: { type: 'string', nullable: true },
          regulamentacao: { type: 'string', nullable: true },
          porte: { type: 'string', nullable: true },
          etapasModalidades: { type: 'string', nullable: true },
          outrasOfertas: { type: 'string', nullable: true },
          latitude: { type: 'string', nullable: true },
          longitude: { type: 'string', nullable: true }
        }
      },
      PaginationInfo: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 34567 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 100 },
          totalPages: { type: 'integer', example: 347 }
        }
      },
      PaginatedSchools: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: true },
          schools: {
            type: 'array',
            items: { $ref: '#/components/schemas/School' }
          },
          pagination: { $ref: '#/components/schemas/PaginationInfo' }
        }
      },
      SearchResponse: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: true },
          total: { type: 'integer', example: 10 },
          filtros: {
            type: 'object',
            properties: {
              nome: { type: 'string', nullable: true },
              municipio: { type: 'string', nullable: true },
              uf: { type: 'string', nullable: true }
            }
          },
          escolas: {
            type: 'array',
            items: { $ref: '#/components/schemas/School' }
          }
        }
      },
      UpdateResponse: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: true },
          mensagem: { type: 'string', example: 'Base de dados atualizada com sucesso' },
          totalEscolas: { type: 'integer', example: 34567 },
          dataAtualizacao: { type: 'string', format: 'date-time' }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          erro: { type: 'string', example: 'Erro ao atualizar base de dados' },
          mensagem: { type: 'string', nullable: true },
          detalhes: { type: 'string', nullable: true },
          codigoInep: { type: 'string', nullable: true }
        }
      }
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['Status'],
        summary: 'Retorna informacoes gerais da API',
        responses: {
          200: {
            description: 'Informacoes da API e estatisticas basicas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiInfo' }
              }
            }
          }
        }
      }
    },
    '/status': {
      get: {
        tags: ['Status'],
        summary: 'Consulta o status do sistema e do scheduler',
        responses: {
          200: {
            description: 'Status do sistema',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StatusResponse' }
              }
            }
          }
        }
      }
    },
    '/atualizar': {
      post: {
        tags: ['Atualizacao'],
        summary: 'Dispara o processo de download e recarregamento do catalogo do INEP',
        responses: {
          200: {
            description: 'Atualizacao concluida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateResponse' }
              }
            }
          },
          500: {
            description: 'Falha ao atualizar a base',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/escola/{codigo}': {
      get: {
        tags: ['Escolas'],
        summary: 'Busca uma escola pelo codigo INEP',
        parameters: [
          {
            name: 'codigo',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Codigo INEP da escola'
          }
        ],
        responses: {
          200: {
            description: 'Escola encontrada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    escola: { $ref: '#/components/schemas/School' }
                  }
                }
              }
            }
          },
          404: {
            description: 'Escola nao encontrada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          503: {
            description: 'Base nao carregada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/escolas': {
      get: {
        tags: ['Escolas'],
        summary: 'Lista escolas com paginacao',
        parameters: [
          {
            name: 'pagina',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Numero da pagina (padrao: 1)'
          },
          {
            name: 'limite',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: config.api.maxResultsPerPage, default: config.api.defaultPageSize },
            description: 'Quantidade de registros por pagina'
          }
        ],
        responses: {
          200: {
            description: 'Lista de escolas paginada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedSchools' }
              }
            }
          },
          503: {
            description: 'Base nao carregada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/buscar': {
      get: {
        tags: ['Escolas'],
        summary: 'Busca escolas por filtros',
        parameters: [
          {
            name: 'nome',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtro pelo nome da escola (contendo)'
          },
          {
            name: 'municipio',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtro pelo municipio'
          },
          {
            name: 'uf',
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 2 },
            description: 'Filtro pela UF (ex: SP)'
          }
        ],
        responses: {
          200: {
            description: 'Resultado da busca',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchResponse' }
              }
            }
          },
          503: {
            description: 'Base nao carregada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    }
  }
};

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: []
});

module.exports = swaggerSpec;
