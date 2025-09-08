const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const config = require('../config');
const fileManager = require('./fileManager');

class SchoolService {
  constructor() {
    this.cache = new Map();
    this.lastUpdate = null;
    this.currentFilePath = null;
  }

  async loadFromFile(filePath) {
    console.log(`📂 Carregando arquivo: ${path.basename(filePath)}`);
    
    const schools = new Map();
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
        .on('data', (row) => {
          const school = this.parseSchoolRow(row);
          if (school.codigoINEP) {
            schools.set(school.codigoINEP, school);
          }
        })
        .on('end', () => {
          this.cache = schools;
          this.currentFilePath = filePath;
          this.lastUpdate = new Date();
          console.log(`✅ ${schools.size} escolas carregadas no cache`);
          resolve(schools.size);
        })
        .on('error', reject);
    });
  }

  parseSchoolRow(row) {
    const codigoINEP = row['Código INEP']?.trim();
    
    return {
      codigoINEP,
      restricaoAtendimento: this.cleanField(row['Restrição de Atendimento']),
      nome: this.cleanField(row['Escola']),
      uf: this.cleanField(row['UF']),
      municipio: this.cleanField(row['Município']),
      localizacao: this.cleanField(row['Localização']),
      localidadeDiferenciada: this.cleanField(row['Localidade Diferenciada']),
      categoriaAdministrativa: this.cleanField(row['Categoria Administrativa']),
      endereco: this.cleanField(row['Endereço']),
      telefone: this.cleanField(row['Telefone']),
      dependenciaAdministrativa: this.cleanField(row['Dependência Administrativa']),
      categoriaEscolaPrivada: this.cleanField(row['Categoria Escola Privada']),
      conveniadaPoderPublico: this.cleanField(row['Conveniada Poder Público']),
      regulamentacao: this.cleanField(row['Regulamentação pelo Conselho de Educação']),
      porte: this.cleanField(row['Porte da Escola']),
      etapasModalidades: this.cleanField(row['Etapas e Modalidade de Ensino Oferecidas']),
      outrasOfertas: this.cleanField(row['Outras Ofertas Educacionais']),
      latitude: this.cleanField(row['Latitude']),
      longitude: this.cleanField(row['Longitude'])
    };
  }

  cleanField(value) {
    return value?.trim() || null;
  }

  async loadLatestFile() {
    fileManager.ensureDirectory();
    fileManager.migrateOldFiles();
    
    const latestFile = fileManager.getLatestFile();
    
    if (!latestFile) {
      console.log('⚠️ Nenhum arquivo CSV encontrado');
      return false;
    }

    await this.loadFromFile(latestFile);
    return true;
  }

  getCsvFilesSorted() {
    return fs.readdirSync(config.inep.downloadPath)
      .filter(file => file.endsWith('.csv'))
      .map(file => ({
        name: file,
        path: path.join(config.inep.downloadPath, file),
        mtime: fs.statSync(path.join(config.inep.downloadPath, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  findByCode(codigoInep) {
    return this.cache.get(codigoInep) || null;
  }

  search(filters) {
    let results = Array.from(this.cache.values());

    if (filters.nome) {
      const searchTerm = filters.nome.toLowerCase();
      results = results.filter(school => 
        school.nome?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.municipio) {
      const searchTerm = filters.municipio.toLowerCase();
      results = results.filter(school => 
        school.municipio?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.uf) {
      const uf = filters.uf.toUpperCase();
      results = results.filter(school => school.uf === uf);
    }

    return results.slice(0, config.api.maxResultsPerPage);
  }

  paginate(page = 1, limit = config.api.defaultPageSize) {
    const schools = Array.from(this.cache.values());
    const offset = (page - 1) * limit;
    const paginatedSchools = schools.slice(offset, offset + limit);
    
    return {
      schools: paginatedSchools,
      pagination: {
        total: schools.length,
        page,
        limit,
        totalPages: Math.ceil(schools.length / limit)
      }
    };
  }

  getStats() {
    const fileStats = fileManager.getFileStats();
    
    return {
      totalSchools: this.cache.size,
      lastUpdate: this.lastUpdate,
      currentFile: this.currentFilePath,
      files: fileStats
    };
  }

  isEmpty() {
    return this.cache.size === 0;
  }
}

module.exports = new SchoolService();