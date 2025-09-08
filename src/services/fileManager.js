const fs = require('fs');
const path = require('path');
const config = require('../config');

class FileManager {
  constructor() {
    this.downloadPath = config.inep.downloadPath;
    this.currentFile = path.join(this.downloadPath, 'current.csv');
    this.backupFile = path.join(this.downloadPath, 'backup.csv');
  }

  ensureDirectory() {
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  getCurrentFilePath() {
    return fs.existsSync(this.currentFile) ? this.currentFile : null;
  }

  getBackupFilePath() {
    return fs.existsSync(this.backupFile) ? this.backupFile : null;
  }

  backupCurrentFile() {
    if (!fs.existsSync(this.currentFile)) {
      console.log('📋 Nenhum arquivo atual para backup');
      return false;
    }

    try {
      if (fs.existsSync(this.backupFile)) {
        fs.unlinkSync(this.backupFile);
      }
      
      fs.renameSync(this.currentFile, this.backupFile);
      console.log('📦 Arquivo atual movido para backup');
      return true;
    } catch (error) {
      console.error('❌ Erro ao fazer backup:', error.message);
      return false;
    }
  }

  saveAsCurrentFile(sourcePath) {
    try {
      if (fs.existsSync(this.currentFile)) {
        fs.unlinkSync(this.currentFile);
      }
      
      fs.renameSync(sourcePath, this.currentFile);
      console.log('💾 Arquivo salvo como current.csv');
      return this.currentFile;
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo atual:', error.message);
      throw error;
    }
  }

  cleanupOldFiles() {
    try {
      const files = fs.readdirSync(this.downloadPath)
        .filter(file => file.endsWith('.csv') && 
                       file !== 'current.csv' && 
                       file !== 'backup.csv')
        .map(file => ({
          name: file,
          path: path.join(this.downloadPath, file),
          mtime: fs.statSync(path.join(this.downloadPath, file)).mtime
        }));

      if (files.length === 0) {
        console.log('🧹 Nenhum arquivo antigo para limpar');
        return;
      }

      files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Arquivo removido: ${file.name}`);
        } catch (error) {
          console.error(`❌ Erro ao remover ${file.name}:`, error.message);
        }
      });

      console.log(`🧹 Limpeza concluída: ${files.length} arquivo(s) removido(s)`);
    } catch (error) {
      console.error('❌ Erro na limpeza:', error.message);
    }
  }

  getLatestFile() {
    if (fs.existsSync(this.currentFile)) {
      return this.currentFile;
    }
    
    if (fs.existsSync(this.backupFile)) {
      console.log('⚠️ Usando arquivo de backup');
      return this.backupFile;
    }

    return null;
  }

  getFileStats() {
    const current = fs.existsSync(this.currentFile) 
      ? { exists: true, size: this.getFileSize(this.currentFile), mtime: fs.statSync(this.currentFile).mtime }
      : { exists: false };
    
    const backup = fs.existsSync(this.backupFile) 
      ? { exists: true, size: this.getFileSize(this.backupFile), mtime: fs.statSync(this.backupFile).mtime }
      : { exists: false };

    return { current, backup };
  }

  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
    } catch {
      return 'N/A';
    }
  }

  migrateOldFiles() {
    console.log('🔄 Migrando arquivos antigos...');
    
    const oldFiles = fs.readdirSync(this.downloadPath)
      .filter(file => file.endsWith('.csv') && file !== 'current.csv' && file !== 'backup.csv')
      .map(file => ({
        name: file,
        path: path.join(this.downloadPath, file),
        mtime: fs.statSync(path.join(this.downloadPath, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (oldFiles.length === 0) {
      console.log('📂 Nenhum arquivo para migrar');
      return;
    }

    if (!fs.existsSync(this.currentFile) && oldFiles.length > 0) {
      fs.renameSync(oldFiles[0].path, this.currentFile);
      console.log(`📁 ${oldFiles[0].name} → current.csv`);
      oldFiles.shift();
    }

    if (!fs.existsSync(this.backupFile) && oldFiles.length > 0) {
      fs.renameSync(oldFiles[0].path, this.backupFile);
      console.log(`📁 ${oldFiles[0].name} → backup.csv`);
      oldFiles.shift();
    }

    oldFiles.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Removido: ${file.name}`);
      } catch (error) {
        console.error(`❌ Erro ao remover ${file.name}`);
      }
    });

    console.log('✅ Migração concluída');
  }
}

module.exports = new FileManager();